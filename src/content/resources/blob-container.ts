import type { ResourceInput } from "../schema";

export const blobContainer: ResourceInput = {
  slug: "blob-container",
  name: "Blob Container",
  type: "Microsoft.Storage/storageAccounts/blobServices/containers",
  category: "storage",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 2,
  scope: "resource",
  icon: "Archive",

  tagline: "A group of blobs inside a storage account. Private by default.",
  definition:
    "A blob container organizes a set of blobs, similar to a directory in a file system. It sits between the storage account and the blobs: account, then container, then blob. A storage account can include an unlimited number of containers, and a container can store an unlimited number of blobs. The container name becomes part of the URI, for example https://myaccount.blob.core.windows.net/mycontainer. Some settings are made per container, such as the anonymous access level, immutability policies and stored access policies. Others are made on the account, such as the default access tier, soft delete and versioning.",
  analogy:
    "A top-level folder in a filing cabinet (the storage account). Files (blobs) go inside. You cannot put a folder inside another folder at this level. If you want a tree, put slashes in the file names and the portal will show them as folders.",
  whenToUse: [
    "Storing unstructured data such as images, documents, logs and backups as blobs.",
    "Serving files directly to a browser, or streaming video and audio.",
    "Keeping data that needs the same rules together, because the anonymous access level, immutability policy and stored access policy are set per container.",
    "Hosting a static website. Enabling it creates a container named $web for the site files.",
  ],
  notFor: [
    "A managed SMB or NFS file share. Use Azure Files for that.",
    "Relational data that needs queries and transactions. Use a database service.",
    "A website that needs a web server to render content. Learn points to Azure App Service for that. Blob static websites serve static files only.",
  ],

  prerequisites: [
    {
      name: "A storage account",
      slug: "storage-account",
      why: "Every container lives in a storage account, and all access to Azure Storage goes through one. A general-purpose v2 account is recommended for most Blob Storage scenarios.",
    },
    {
      name: "Permission to create the container (Microsoft Entra ID)",
      why: "Data operations with Entra credentials (az storage container create --auth-mode login, or New-AzStorageContext -UseConnectedAccount) need a data role such as Storage Blob Data Contributor, even if you own the account. In the portal you also need at least the Reader role on the account to browse to the containers. Role assignments can take a few minutes to apply.",
    },
    {
      name: "Or the account key",
      why: "In the portal you can instead authorize with the account access key if you hold a role with the listkeys action, such as Storage Account Contributor, Azure Resource Manager Contributor or Owner. Microsoft recommends Entra ID over keys.",
    },
    {
      name: "A valid container name",
      why: "3 to 63 characters. Lowercase letters, numbers and hyphens only, with no consecutive hyphens. It must be unique within the account.",
    },
    {
      name: "An anonymous access level (optional)",
      why: "New containers default to Private. Blob or Container only works if the storage account allows anonymous access.",
    },
  ],

  example: {
    portal: [
      "Make sure you hold a data role such as Storage Blob Data Contributor plus Reader on the account, or a role that can read account keys. Without one of these you see an error and no blobs are listed.",
      "Search for Storage accounts and open your storage account.",
      "In the left menu, scroll to the Data storage section, then select Containers.",
      "Select the + Container button.",
      "Type a Name for the container, for example images. It must be lowercase, must start with a letter or number, and can include only letters, numbers and the dash (-) character.",
      "Leave the Anonymous access level on Private (no anonymous access), the default. If the dropdown is disabled, the storage account does not allow anonymous access.",
      "Select Create.",
      "To change the level later, select the container, select Change access level, pick a value in the Anonymous access level dropdown and select OK. This needs the storage account to allow anonymous access.",
      "To upload a blob, open the container and select Upload. To delete the container and every blob in it, go back to the Containers list, select the container, select the More button (...) and select Delete.",
    ],
    cli: `# Give yourself a data role first (Learn says even the account owner needs one)
STORAGE_ID=$(az storage account show \\
  --name stpolarisdemo001 \\
  --resource-group rg-polaris-demo \\
  --query id \\
  --output tsv)

az ad signed-in-user show --query id --output tsv | az role assignment create \\
  --role "Storage Blob Data Contributor" \\
  --assignee @- \\
  --scope "$STORAGE_ID"

# Role assignments can take a few minutes to propagate. Containers are private by default.
az storage container create \\
  --account-name stpolarisdemo001 \\
  --name images \\
  --auth-mode login`,
    powershell: `# Needs a data role such as Storage Blob Data Contributor on the account
Connect-AzAccount

$ctx = New-AzStorageContext -StorageAccountName "stpolarisdemo001" -UseConnectedAccount

New-AzStorageContainer \`
  -Name "images" \`
  -Permission Off \`
  -Context $ctx`,
    bicep: `param storageName string = 'stpolarisdemo001'
param containerName string = 'images'
param location string = resourceGroup().location

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

// The Blob service is a child of the account and is always named default
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: sa
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: 7
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: 7
    }
  }
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "Hierarchy: storage account, then container, then blob. An account can hold an unlimited number of containers and a container an unlimited number of blobs. A container holds blobs (and directories if the account has a hierarchical namespace), not other containers. Without a hierarchical namespace the Blob service is flat, and a delimiter such as / in a blob name only creates a virtual hierarchy.",
    "Container names: 3 to 63 characters, lowercase letters, numbers and hyphens, every hyphen between letters or numbers (no consecutive hyphens), no spaces. A name that breaks the rules fails with status 400. Two accounts can have a container with the same name, but a name must be unique within one account. Blob names are case-sensitive, up to 1,024 characters.",
    "Anonymous access levels: Private (default, no anonymous access), Blob (anonymous clients can read the blobs but cannot list them) and Container (anonymous clients can read blobs and list them). In PowerShell the values are Off, Blob and Container, and in the CLI off, blob and container. You set the level per container only, never per blob.",
    "Anonymous access is controlled twice. The storage account setting (Allow Blob anonymous access under Configuration, or AllowBlobPublicAccess) overrides every container. If the account disallows anonymous access, no container can be anonymous and you cannot set the level. If the account allows it, a container is still private until you change its level. A request that carries an Authorization header is authorized with its own credentials. The $web container of a static website stays public even when the account disallows anonymous access.",
    "Setting the anonymous access level (Set Container ACL, az storage container set-permission, Set-AzStorageContainerAcl) does not support Entra authorization. Use the account key, a connection string or a SAS. Creating the container with --auth-mode login is fine.",
    "Blob types: block blobs (text and binary data, most scenarios, up to about 190.7 TiB), append blobs (optimized for appends such as logs) and page blobs (random access, up to 8 TiB, back the VHDs of VMs). You can only set an access tier on block blobs.",
    "Access tiers are set on blobs, not on the container. The account has a default tier of Hot, Cool or Cold, and a blob without its own tier inherits it (the portal shows Hot (inferred)). Archive cannot be the account default. Hot has no minimum retention. Cool is 30 days, Cold is 90 and Archive is 180.",
    "Early deletion: deleting, overwriting or moving a blob to another tier before the minimum days is charged, prorated for the days left. Example from Learn: a blob moved to Cool and deleted after 21 days is charged for 9 more days. A soft-deleted blob is not charged until the soft delete retention period expires.",
    "Archive is offline. A blob cannot be read or modified until you rehydrate it to Hot, Cool or Cold, which can take up to 15 hours. Archive works only on LRS, GRS and RA-GRS accounts, not ZRS, GZRS or RA-GZRS.",
    "Lifecycle management is a rule-based policy on the account (Data management, Lifecycle management). Rules move current versions, previous versions or snapshots to a cooler tier or delete them. They can apply to the whole account, to selected containers, or to blobs filtered by name prefix or blob index tags (up to 10 prefixes and 10 tag conditions per rule). It works on block blobs and append blobs and runs once a day. A new or changed policy can take up to 24 hours to take effect. It cannot rehydrate archived blobs, and delete actions do not work on blobs in an immutable container or in a soft-deleted state.",
    "Soft delete is two separate account settings. Blob soft delete restores a deleted or overwritten blob, snapshot or version, with a retention of 1 to 365 days. Container soft delete restores a whole deleted container with its contents, retention 1 to 365 days with a default of 7. A restored container keeps its original name. Container soft delete is not retroactive and does not protect against deleting the storage account (use a resource lock). Without it, blobs in a deleted container cannot be recovered. In the portal both are under Data management, Data protection.",
    "Blob versioning is an account setting. Once on, every write creates a new version automatically, and previous versions cannot be modified. It does not help you recover a deleted container or storage account. It can add cost, so use lifecycle rules to delete old versions. Disabling it keeps the existing versions.",
    "Immutable storage puts blobs in a WORM (write once, read many) state. A time-based retention policy lasts 1 to 146,000 days. A legal hold has no end date until you clear it, and a container-level hold needs one or more tags. Both can be set at container level (portal: container, More, Access policy, Add policy) or at version level, which needs versioning. A new time-based policy is unlocked and can be changed or deleted. Locking it makes it compliant. A locked policy cannot be deleted and the period can be extended but not shortened.",
    "SAS types: user delegation SAS (signed with Entra credentials, recommended, Blob, Queue, Table and Files), service SAS (signed with the account key, one service) and account SAS (signed with the account key, one or more services). A stored access policy is defined on a container, with a limit of five per container, and applies to a service SAS only. Changing or deleting the policy changes or revokes the SAS without rotating the account keys. Creating the policy needs the account key, not Entra.",
    "Authorization choices for blob data: Microsoft Entra ID with RBAC (recommended), Shared Key (Microsoft recommends disallowing it), SAS, and anonymous read access. In the CLI, --auth-mode login uses your Entra identity. If you omit --auth-mode or use key, the CLI tries to get the account key. Management roles like Contributor do not grant Entra data access. Use data roles such as Storage Blob Data Reader, Contributor or Owner.",
    "Related features on the account: change feed records every blob change as logs in a $blobchangefeed container. Object replication copies block blobs asynchronously to another account and needs change feed on the source and versioning on both accounts. Static website hosting creates the $web container. Lifecycle rules do not touch $web or $logs.",
    "Via Azure Resource Manager you can create containers with Bicep or ARM (the type is Microsoft.Storage/storageAccounts/blobServices/containers, parented to the blob service named default), az storage container-rm create or New-AzRmStorageContainer. The publicAccess property accepts None, Blob or Container.",
  ],
    },
  ],

  related: ["storage-account", "file-share", "private-endpoint", "service-endpoint", "virtual-machine", "app-service", "recovery-services-vault"],
  docsUrl: "https://learn.microsoft.com/azure/storage/blobs/storage-blobs-introduction",

  simulator: {
    armType: "Microsoft.Storage/storageAccounts/blobServices/containers",
    apiVersion: "2023-05-01",
    nameRule: "blob-container",
  },
};
