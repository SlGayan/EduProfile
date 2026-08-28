/**
 * Types and pure helpers for the principal-issued Character Certificate
 * feature. Distinct from lib/studentCertificates.ts, which is the
 * student-self-reported course/competition certificates that feed into a
 * character certificate as evidence, not the certificate itself.
 */

import { apiFetch } from "@/lib/apiFetch"

/**
 * Count of active students who have at least one approved activity or
 * approved self-added certificate but have never had a character
 * certificate issued — the principal dashboard's "ready to issue" scorecard.
 */
export async function fetchEligibleForCertificateCount(): Promise<number> {
  const response = await apiFetch("/api/certificates/eligible-count")
  if (!response.ok) {
    throw new Error("Failed to load eligible student count")
  }
  const data = await response.json()
  // React Query treats a queryFn resolving to `undefined` as an error, not
  // "no data" — coerce a malformed body to 0 rather than let that surface as
  // a misleading error state for what is actually a successful response.
  return typeof data.count === "number" ? data.count : 0
}
