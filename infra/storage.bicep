// Study material storage (Epic 9).
//
// Declares the Blob Storage account that holds uploaded study materials, plus
// every setting the app depends on at runtime. This file is the source of
// truth: the resources it describes were originally created by hand, and this
// template exists so they can be rebuilt or moved to a new environment without
// anyone having to remember the manual steps -- particularly the CORS rule,
// which is invisible in the app code but required for downloads to work at all.
//
// Deploy (idempotent -- safe to re-run against the existing resources):
//   az deployment group create \
//     --resource-group EduProfile-RG \
//     --template-file infra/storage.bicep \
//     --parameters apiAppName=eduprofile-api-prod \
//                  webAppOrigins='["https://<web-app-host>","http://localhost:3000"]'

@description('Globally unique storage account name (3-24 lowercase alphanumeric chars).')
param storageAccountName string = 'eduprofilematerials'

@description('Blob container holding study material files.')
param containerName string = 'study-materials'

@description('Azure region. Keep this co-located with the API App Service to avoid cross-region egress charges.')
param location string = resourceGroup().location

@description('Name of the API App Service whose managed identity needs blob access.')
param apiAppName string

@description('Origins allowed to download blobs from the browser. Must include every host apps/web is served from, plus local dev.')
param webAppOrigins array = [
  'http://localhost:3000'
]

// Existing API app -- referenced only to read its system-assigned identity, so
// the role assignment below doesn't need a principal ID passed in by hand.
resource apiApp 'Microsoft.Web/sites@2023-12-01' existing = {
  name: apiAppName
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    // LRS is deliberate: study materials need to survive a deploy, not a
    // regional outage. Geo-redundancy would multiply cost for durability
    // this project hasn't asked for.
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    // No anonymous access, ever. Reads are authorized exclusively through
    // short-lived user delegation SAS URLs minted by the API after its own
    // entitlement checks.
    allowBlobPublicAccess: false
    // No account key path at all -- the API authenticates via managed
    // identity, so there is no long-lived secret to leak or rotate. Turning
    // this off means a stolen key is not merely unused but unusable.
    allowSharedKeyAccess: false
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    // Downloads are a 302 from the API to a SAS URL on this account, which the
    // browser follows as a cross-origin fetch(). Without these rules that fetch
    // is blocked outright; without Content-Disposition in exposedHeaders the
    // request succeeds but the frontend cannot read the server-chosen filename
    // and silently falls back to an extension-less name.
    cors: {
      corsRules: [
        {
          allowedOrigins: webAppOrigins
          allowedMethods: [
            'GET'
            'HEAD'
          ]
          allowedHeaders: [
            '*'
          ]
          exposedHeaders: [
            'Content-Disposition'
            'Content-Type'
            'Content-Length'
          ]
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}

// Storage Blob Data Contributor. Covers blob read/write/delete and, critically,
// the generateUserDelegationKey action the SAS-minting path depends on.
var storageBlobDataContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'

resource apiBlobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  // Deterministic name so re-deploying updates this assignment rather than
  // failing on a duplicate.
  name: guid(storageAccount.id, apiApp.id, storageBlobDataContributorRoleId)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataContributorRoleId)
    principalId: apiApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output storageAccountNameOut string = storageAccount.name
output containerNameOut string = container.name
