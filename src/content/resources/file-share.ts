import type { ResourceInput } from "../schema";

export const fileShare: ResourceInput = {
  slug: "file-share",
  name: "Azure Files Share",
  type: "Microsoft.Storage/storageAccounts/fileServices/shares",
  category: "storage",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 2,
  scope: "resource",
  icon: "Files",

  tagline: "A managed network drive in the cloud. Mount it over SMB or NFS from many machines at once.",
  definition:
    "Azure Files gives you fully managed file shares in the cloud that you reach with the standard SMB and NFS protocols. This entry covers a classic file share: a share that lives inside a storage account (the Microsoft.Storage resource provider) and supports both SMB and NFS. You can mount one share at the same time from cloud and on-premises machines running Windows, Linux and macOS, with no extra software. Each share uses one protocol, chosen when you create it, and its kind of storage (SSD or HDD) comes from the storage account that holds it.",
  analogy:
    "A shared office network drive that nobody has to host. The storage account is the building, the share is the shared folder everyone maps to a drive letter, and Azure keeps the file server running.",
  whenToUse: [
    "Replacing or supplementing an on-premises file server with a share that many machines mount at the same time.",
    "Lifting and shifting an application that expects shared file storage, without changing its code.",
    "Sharing settings, diagnostic logs or dev and test tools across several virtual machines.",
    "Giving stateful containers shared storage that survives restarts. For example, Container Instances can mount a share (Linux containers only).",
    "Keeping a Windows Server cache of an SMB share on-premises with Azure File Sync.",
  ],
  notFor: [
    "Unstructured object data such as images and backups that apps read over HTTP. Use a blob container.",
    "Using one share over both SMB and NFS. A share supports only one of them, and the choice cannot be changed after creation.",
    "NFS from Windows clients. Learn says NFS Azure file shares are not supported for Windows.",
    "Mounting a share with a shared access signature (SAS) token. Learn says SAS tokens are not supported for mounting on Windows.",
    "Moving a share between SSD and HDD. You create a new share on the other media tier and copy the data.",
  ],

  prerequisites: [
    {
      name: "A storage account",
      slug: "storage-account",
      why: "A classic file share is a child of a storage account, so the account must exist first. The account kind and SKU decide the media tier, billing model and redundancy of its shares.",
    },
    {
      name: "The right storage account kind",
      why: "Pay-as-you-go HDD shares need the StorageV2 (general-purpose v2) kind. Provisioned shares need the FileStorage kind: provisioned v1 is SSD only, and provisioned v2 can be SSD or HDD. Learn recommends provisioned v2 for new deployments. A FileStorage account can hold only file shares.",
    },
    {
      name: "A share name",
      why: "Lowercase letters, numbers and single hyphens only. It must start and end with a letter or number and cannot contain two hyphens in a row. The ARM reference allows 3 to 63 characters.",
    },
    {
      name: "A protocol (SMB or NFS)",
      why: "SMB is the default. NFS (version 4.1) needs the SSD media tier, so a FileStorage account, and is used from Linux clients. You set the protocol when you create the share.",
    },
    {
      name: "TCP port 445 open from the client (SMB)",
      why: "SMB uses port 445. Many organizations and ISPs block it for outbound traffic, and connections fail if it is blocked. A VPN or ExpressRoute connection is the alternative.",
    },
    {
      name: "Network access set up (NFS only)",
      slug: "private-endpoint",
      why: "NFS shares have no user sign-in, so clients are allowed by network rules. Use a private endpoint, or a service endpoint with a virtual network rule. NFS uses port 2049, so a network security group must not block it.",
    },
  ],

  example: {
    portal: [
      "Search for Storage accounts and open a storage account of the StorageV2 kind. To see the kind, look under Essentials.",
      "In the service menu, under Data storage, select Classic file shares.",
      "Select + File share.",
      "On the Basics tab, enter a Name, for example fs-polaris-demo. In a pay-as-you-go account, choose an Access tier. Learn suggests Transaction optimized while you migrate data, then a cooler tier if usage allows.",
      "In a FileStorage account, the Basics tab asks for Provisioned storage (GiB) and Protocol instead. SMB is the default, and NFS creates an NFSv4.1 share.",
      "Select the Backup tab. Enable backup is on by default. Leave it on to use a Recovery Services vault in the same region and subscription as the account, or clear it.",
      "Select Review + create, then Create.",
      "To use the share, open it and select Connect. For Windows, pick a drive letter, choose the Authentication method (Active Directory or Microsoft Entra, or Storage account key), select Show script, then copy and run the script on the client.",
      "To take a snapshot, open the share, select Snapshots, then + Add snapshot, then OK.",
    ],
    cli: `az storage account create \\
  --resource-group rg-polaris-demo \\
  --name stpolarisdemo001 \\
  --location southeastasia \\
  --kind StorageV2 \\
  --sku Standard_LRS

az storage share-rm create \\
  --resource-group rg-polaris-demo \\
  --storage-account stpolarisdemo001 \\
  --name fs-polaris-demo \\
  --quota 100 \\
  --enabled-protocols SMB \\
  --access-tier Hot`,
    powershell: `New-AzStorageAccount \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "stpolarisdemo001" \`
  -Location "southeastasia" \`
  -Kind "StorageV2" \`
  -SkuName "Standard_LRS"

New-AzRmStorageShare \`
  -ResourceGroupName "rg-polaris-demo" \`
  -StorageAccountName "stpolarisdemo001" \`
  -Name "fs-polaris-demo" \`
  -QuotaGiB 100 \`
  -EnabledProtocol "SMB" \`
  -AccessTier "Hot"`,
    bicep: `param storageName string = 'stpolarisdemo001'
param shareName string = 'fs-polaris-demo'
param location string = resourceGroup().location

resource sa 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' existing = {
  parent: sa
  name: 'default'
}

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: fileService
  name: shareName
  properties: {
    accessTier: 'Hot'
    enabledProtocols: 'SMB'
    shareQuota: 100
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "Protocols: SMB works from Windows, Linux and macOS (SMB 3.1.1, 3.0 and 2.1). NFS (4.1) is for Linux workloads. One share cannot serve both, but one storage account can hold both kinds of share. The protocol is set at creation and cannot be changed later.",
    "NFS shares need the SSD (premium) media tier, so a FileStorage account. They support LRS and ZRS only, not GRS or GZRS. They have no identity-based authentication, no Azure File Sync and no Azure Backup. Clients must reach the share through a private endpoint, or through a service endpoint from an allowed subnet.",
    "NFS uses port 2049. Make sure on-premises firewalls allow it outbound and that network security groups on allowed virtual networks do not block it inbound.",
    "Media tiers and billing: SSD (premium) and HDD (standard). Provisioned v2 (SSD or HDD) is recommended for new shares. Provisioned v1 is SSD only. Pay-as-you-go is HDD only and needs a StorageV2 account. You cannot move a share to a different media tier. Create a new one and copy the data.",
    "Access tiers apply only to pay-as-you-go (HDD) shares: transaction optimized, hot and cool. All three use the same hardware. Cooler tiers cost less to store and more per transaction. Learn suggests starting in transaction optimized during a migration. You can change a share's tier up to five times in a 30-day window, and not twice within 24 hours. In ARM and Bicep, accessTier also allows Premium for FileStorage accounts.",
    "Quota and size: provisioned v2 shares range from 32 GiB to 256 TiB, provisioned v1 from 100 GiB to 100 TiB, and pay-as-you-go shares can grow to 100 TiB. A provisioned share is billed for the size you provision, whatever you use. Learn also notes that an old account created before large file shares may need its quota raised.",
    "Redundancy: HDD shares support LRS, ZRS, GRS and GZRS. SSD shares support only LRS and ZRS. Azure Files does not support reading from the secondary region, so RA-GRS and RA-GZRS accounts are billed as GRS and GZRS.",
    "Snapshots are read-only, point-in-time and incremental copies of a share. A share supports up to 200 snapshots, and you can keep them for up to 10 years. You cannot delete a share and keep its snapshots. Deleting the share deletes them too. On Windows, SMB snapshots appear on the Previous Versions tab in File Explorer.",
    "Soft delete is a storage-account setting that protects against accidental deletion of whole shares. It is on by default for new accounts. Retention is 7 days by default, and you can set 1 to 365 days. It restores a share, not a single file. To restore files, use snapshots or Azure Backup. Soft-deleted shares are still billed for the capacity they use. It covers classic SMB and NFS shares, not shares created with Microsoft.FileShares.",
    "Backup: Azure Backup protects SMB shares by scheduling snapshots, with daily, weekly, monthly and yearly retention. In the portal, Enable backup is on by default when you create a share. It uses a Recovery Services vault in the same region and subscription as the storage account. Azure Backup turns on soft delete and puts a delete lock on the storage account once any share in it is backed up.",
    "Identity-based authentication (SMB only): on-premises AD DS, Microsoft Entra Domain Services or Microsoft Entra Kerberos. All use Kerberos. You can use only one identity source per storage account, and it applies to all shares in it. Access needs share-level permission and file or directory permission. Learn recommends identity-based access over the storage account key.",
    "Mounting with the storage account key uses the account name as the user name and the key as the password (NTLMv2). It works like an administrator: the mount has full permission on every file and folder in the share, even where ACLs exist. Learn says to use private endpoints or service endpoints if you must use the key.",
    "Port 445: SMB needs outbound TCP 445. Check from Windows with Test-NetConnection to the account's file.core.windows.net name on port 445, or from Linux with nc -zvw3. If it is blocked, use a point-to-site VPN, site-to-site VPN or ExpressRoute. SMB over QUIC is not supported directly by Azure Files.",
    "Encryption in transit is on by default. Azure Files accepts only SMB 3.x with encryption, or HTTPS. SMB 2.1 and unencrypted access work only after you turn this off, and then only from within the same Azure region. In the portal, the account setting is Require secure transfer for REST API operations. A separate per-protocol setting, Require Encryption in Transit for SMB or NFS, can take over. Data at rest is always encrypted, with Microsoft-managed keys by default.",
    "Network access: SMB from Azure clients needs no special network setup. SMB from on-premises usually needs a VPN or ExpressRoute with a private endpoint. Service endpoints add no charge and allow only chosen subnets. Private endpoints give a private, static IP address and standard data processing rates apply. For NFS, Learn warns that after a rare event such as a zone outage, a service endpoint can leave clients needing a remount because the public IP changed.",
    "Azure File Sync caches an SMB share on Windows Servers, on-premises or in Azure, and can tier cold files to the cloud. It needs a Storage Sync Service and an agent on each server. It works only with SMB shares in classic file shares. It is not supported with NFS shares.",
    "Newer option: the Microsoft.FileShares resource provider creates a share as a top-level resource with no storage account. It currently supports only NFS on SSD (LRS or ZRS) and the provisioned v2 model. Soft delete and customer-managed keys do not apply to it. This entry covers classic shares under Microsoft.Storage.",
  ],
    },
  ],

  related: [
    "storage-account",
    "blob-container",
    "private-endpoint",
    "service-endpoint",
    "virtual-machine",
    "recovery-services-vault",
    "container-instances",
    "network-security-group",
  ],
  docsUrl: "https://learn.microsoft.com/azure/storage/files/storage-files-introduction",

  simulator: {
    armType: "Microsoft.Storage/storageAccounts/fileServices/shares",
    apiVersion: "2023-05-01",
    nameRule: "file-share",
  },
};
