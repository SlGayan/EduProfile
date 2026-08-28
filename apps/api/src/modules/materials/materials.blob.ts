import fs from 'fs/promises';
import path from 'path';
import {
  BlobServiceClient,
  BlobSASPermissions,
  SASProtocol,
  generateBlobSASQueryParameters,
  type UserDelegationKey,
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';

/**
 * Dev-only escape hatch: if an actual Azure call fails (e.g. no `az login`,
 * no Azure CLI installed, no role assignment yet) and we're not in
 * production, fall back to storing/serving the blob from local disk instead
 * of hard-failing the request. Never engages in production (Dockerfile sets
 * NODE_ENV=production), and never engages for a teammate whose Azure access
 * already works -- it only triggers on an actual thrown error.
 */
const DEV_FALLBACK_ENABLED = process.env.NODE_ENV !== 'production';
// No leading dot: Express's `send` module (used by res.download) treats any
// dotfile path segment as forbidden by default and 404s it even when the
// file exists.
const LOCAL_BLOB_DIR = path.join(process.cwd(), 'local-blob-storage');

function localBlobPath(key: string): string {
  return path.join(LOCAL_BLOB_DIR, key);
}

/** Used by materials.controller's dev-only local-blob route to stream the file back. */
export function getLocalBlobAbsolutePath(key: string): string {
  return localBlobPath(key);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

// Lazy singleton: constructed on first actual blob operation, not at module
// import. Importing this module (e.g. transitively, in tests or tooling that
// never touch blob storage) must not require these env vars to be set.
let clients: { blobServiceClient: BlobServiceClient; containerClient: ReturnType<BlobServiceClient['getContainerClient']> } | undefined;

function getClients() {
  if (!clients) {
    const accountName = requireEnv('AZURE_STORAGE_ACCOUNT_NAME');
    const containerName = requireEnv('AZURE_STORAGE_CONTAINER_NAME');
    const blobServiceClient = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      new DefaultAzureCredential()
    );
    clients = { blobServiceClient, containerClient: blobServiceClient.getContainerClient(containerName) };
  }
  return clients;
}

const SAS_TTL_MS = 12 * 60 * 1000;
/** Clock-skew allowance, applied to both SAS and delegation-key start times. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** How long each fetched user delegation key stays valid before a refresh. */
const DELEGATION_KEY_TTL_MS = 60 * 60 * 1000;
/**
 * Refresh the cached key once its remaining validity can no longer cover a
 * full-length SAS: Azure rejects a SAS whose expiry falls outside its
 * delegation key's window, so the key must outlive every SAS it signs.
 */
const DELEGATION_KEY_REFRESH_MARGIN_MS = SAS_TTL_MS + 2 * 60 * 1000;

export async function uploadBlob(key: string, data: Buffer, contentType: string): Promise<void> {
  try {
    const { containerClient } = getClients();
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    await blockBlobClient.uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
  } catch (err) {
    if (!DEV_FALLBACK_ENABLED) throw err;
    console.warn(`[materials.blob] Azure upload failed, using local disk fallback (dev only): ${(err as Error).message}`);
    await fs.mkdir(LOCAL_BLOB_DIR, { recursive: true });
    await fs.writeFile(localBlobPath(key), data);
  }
}

/**
 * Idempotent: deleting an already-absent blob is a no-op success, not a
 * thrown error (mirrors the old disk-storage unlinkQuiet's ENOENT-is-fine
 * behavior) -- callers never need to branch on this.
 */
export async function deleteBlob(key: string): Promise<void> {
  if (DEV_FALLBACK_ENABLED) {
    const deletedLocally = await fs.unlink(localBlobPath(key)).then(
      () => true,
      (err) => {
        if (err.code === 'ENOENT') return false;
        throw err;
      }
    );
    if (deletedLocally) return;
  }
  try {
    const { containerClient } = getClients();
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    await blockBlobClient.deleteIfExists();
  } catch (err) {
    if (!DEV_FALLBACK_ENABLED) throw err;
    console.warn(`[materials.blob] Azure delete failed, ignoring (dev only): ${(err as Error).message}`);
  }
}

export async function blobExists(key: string): Promise<boolean> {
  if (DEV_FALLBACK_ENABLED) {
    const existsLocally = await fs.access(localBlobPath(key)).then(() => true, () => false);
    if (existsLocally) return true;
  }
  try {
    const { containerClient } = getClients();
    const blockBlobClient = containerClient.getBlockBlobClient(key);
    return await blockBlobClient.exists();
  } catch (err) {
    if (!DEV_FALLBACK_ENABLED) throw err;
    return false;
  }
}

/**
 * Cached user delegation key. The key is not per-blob or per-request -- it is
 * an account-level signing key valid for its whole window -- so re-fetching it
 * on every download would add an avoidable Azure AD round-trip to each one.
 * The in-flight promise is cached too, so a burst of concurrent downloads on a
 * cold cache triggers one fetch rather than one per request.
 */
let delegationKeyCache:
  | { promise: Promise<UserDelegationKey>; usableUntil: number }
  | undefined;

async function getCachedUserDelegationKey(
  blobServiceClient: BlobServiceClient
): Promise<UserDelegationKey> {
  const now = Date.now();

  if (delegationKeyCache && delegationKeyCache.usableUntil > now) {
    return delegationKeyCache.promise;
  }

  const startsOn = new Date(now - CLOCK_SKEW_MS);
  const expiresOn = new Date(now + DELEGATION_KEY_TTL_MS);

  const promise = blobServiceClient.getUserDelegationKey(startsOn, expiresOn);
  const entry = {
    promise,
    usableUntil: expiresOn.valueOf() - DELEGATION_KEY_REFRESH_MARGIN_MS,
  };
  delegationKeyCache = entry;

  try {
    return await promise;
  } catch (err) {
    // Never leave a rejected promise cached -- the next request must retry
    // rather than replay this failure until the window elapses. Only clear
    // this attempt's own entry: a later request may already have installed a
    // successful one that must not be thrown away.
    if (delegationKeyCache === entry) {
      delegationKeyCache = undefined;
    }
    throw err;
  }
}

/**
 * Mints a short-lived, read-only User Delegation SAS for exactly one blob
 * (AD-1). Required because the account has no key (AD-2, allowSharedKeyAccess
 * is false) -- an account-key SAS isn't possible, so access is delegated via
 * the caller's own Managed Identity through getUserDelegationKey.
 */
export async function getDownloadSasUrl(key: string, downloadFilename: string): Promise<string> {
  if (DEV_FALLBACK_ENABLED) {
    const existsLocally = await fs.access(localBlobPath(key)).then(() => true, () => false);
    if (existsLocally) {
      // Relative path: downloadMaterial's 302 redirect resolves it against
      // this same API origin, so no CORS concerns even through the Next.js
      // rewrite proxy.
      return `/api/materials/local-blob/${encodeURIComponent(key)}?filename=${encodeURIComponent(downloadFilename)}`;
    }
  }

  const { blobServiceClient, containerClient } = getClients();
  const now = new Date();
  const startsOn = new Date(now.valueOf() - CLOCK_SKEW_MS);
  const expiresOn = new Date(now.valueOf() + SAS_TTL_MS);

  const userDelegationKey = await getCachedUserDelegationKey(blobServiceClient);

  const sasQueryParameters = generateBlobSASQueryParameters(
    {
      containerName: containerClient.containerName,
      blobName: key,
      permissions: BlobSASPermissions.parse('r'),
      protocol: SASProtocol.Https,
      startsOn,
      expiresOn,
      contentDisposition: `attachment; filename="${downloadFilename}"`,
    },
    userDelegationKey,
    blobServiceClient.accountName
  );

  const blockBlobClient = containerClient.getBlockBlobClient(key);
  return `${blockBlobClient.url}?${sasQueryParameters.toString()}`;
}

/**
 * Same short-lived read-only User Delegation SAS as getDownloadSasUrl, but
 * without a Content-Disposition override — the blob's stored content type
 * (set at upload) decides inline vs attachment. Used where the URL is
 * embedded directly (e.g. an <img src>) and must render rather than prompt
 * a download.
 */
export async function getInlineSasUrl(key: string): Promise<string> {
  const { blobServiceClient, containerClient } = getClients();
  const now = new Date();
  const startsOn = new Date(now.valueOf() - CLOCK_SKEW_MS);
  const expiresOn = new Date(now.valueOf() + SAS_TTL_MS);

  const userDelegationKey = await getCachedUserDelegationKey(blobServiceClient);

  const sasQueryParameters = generateBlobSASQueryParameters(
    {
      containerName: containerClient.containerName,
      blobName: key,
      permissions: BlobSASPermissions.parse('r'),
      protocol: SASProtocol.Https,
      startsOn,
      expiresOn,
    },
    userDelegationKey,
    blobServiceClient.accountName
  );

  const blockBlobClient = containerClient.getBlockBlobClient(key);
  return `${blockBlobClient.url}?${sasQueryParameters.toString()}`;
}
