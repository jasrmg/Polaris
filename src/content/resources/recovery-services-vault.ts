import type { ResourceInput } from "../schema";

export const recoveryServicesVault: ResourceInput = {
  slug: "recovery-services-vault",
  name: "Recovery Services Vault",
  type: "Microsoft.RecoveryServices/vaults",
  category: "backup-recovery",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 2,
  scope: "resource",
  icon: "DatabaseBackup",

  tagline: "The Azure container that stores backup copies (recovery points) and their policies. Azure Site Recovery uses it too.",
  definition:
    "A Recovery Services vault is a storage entity in Azure that holds copies of data or configuration information for VMs, workloads, servers and workstations. It stores the recovery points that Azure Backup creates over time, and it also holds the backup policies attached to the protected items. You use it to take on-demand backups, run restores and create backup policies. Azure Backup handles the underlying storage for you, so you never create a storage account for it. You only choose how that storage is replicated. A vault protects only data sources in its own region.",
  analogy:
    "A safe-deposit room in the same city as your valuables. Each backup run puts a dated copy in the room. The policy is the rule for how often you visit and how long each copy is kept. The room's rules (how it is replicated, how deletions are handled) are set by the vault, and a copy can be fetched later without touching the original.",
  whenToUse: [
    "Backing up Azure VMs (Windows or Linux) on a schedule and restoring them later.",
    "Backing up other workloads Learn lists for this vault type: SQL Server and SAP HANA in Azure VMs, Azure Files, and on-premises servers through the MARS agent, Azure Backup Server or System Center DPM.",
    "Keeping a long-term copy of data in a different place from production. Backup data is stored in a Microsoft-managed subscription and tenant, isolated from the source.",
    "Managing Azure Site Recovery items as well. Learn says a Recovery Services vault lets you monitor Azure Backup and Azure Site Recovery jobs from one portal.",
  ],
  notFor: [
    "Backing up Azure Disks, Azure Blobs or Azure Database for PostgreSQL servers. Learn lists these as data sources of the newer Backup vault, a separate vault type.",
    "Backing up data in a different region. The vault must be in the same region as the data source, so you need one vault per region.",
    "A quick recovery from a regional outage on its own. Backup restores data you saved. Azure Site Recovery is the service that replicates machines and fails over.",
    "Backing up an Azure VM to an on-premises location. Learn says this is not supported.",
  ],

  prerequisites: [
    {
      name: "The Microsoft.RecoveryServices resource provider",
      why: "The Azure PowerShell quickstart registers it the first time you use Azure Backup. Learn also says vault options such as zone redundancy and immutability are not accessible without it.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The vault needs a group to live in. The vault's resource group can be different from the VM's resource group.",
    },
    {
      name: "A VM to protect, in the same region as the vault",
      slug: "virtual-machine",
      why: "Learn says you can only select VMs in the same region as the vault. A VM can be backed up to only one vault at a time. The VM agent must be installed. It is already there for Azure Marketplace images.",
    },
    {
      name: "A storage redundancy choice",
      why: "Geo-redundant (the default), locally redundant or zone-redundant. Set it before you configure the first backup. After that, the option is disabled.",
    },
  ],

  example: {
    portal: [
      "In the top search bar, search for Resiliency and open the Resiliency dashboard.",
      "On the Vault pane, select + Vault, select Recovery Services vault, then select Continue.",
      "On the Create Recovery Services vault pane, select your Subscription and Resource group (Use existing or Create new).",
      "Enter a Vault name (2 to 50 characters, starts with a letter, only letters, numbers and hyphens, for example rsv-polaris). Select the same Region as the VM you want to protect.",
      "Select Review + create, then Create. Wait for the notification, and select Refresh if the vault is not in the list yet.",
      "Open the new vault. Under Settings, select Properties. Under Backup Configuration, select Update. Choose the Storage replication type (Geo-redundant, Locally-redundant or Zone-redundant) and select Save. Do this before the first backup.",
      "Go to Resiliency and select + Configure protection. Set Resources managed by to Azure, Datasource type to Azure Virtual machines and Solution to Azure Backup, then select Continue.",
      "On the Start: Configure Backup pane, keep Datasource type as Azure Virtual machines, select your vault, then select Continue.",
      "On the Configure backup pane, choose the Policy sub type (Enhanced or Standard) and a policy. The Standard default policy backs up once a day and keeps daily backups for 30 days. Instant recovery snapshots are kept for two days.",
      "Under Virtual Machines, select Add, choose the VM on the Select virtual machines pane, then select OK.",
      "Select Enable backup. Learn says this deploys the policy to the vault and the VM and installs the backup extension on the VM agent.",
      "To start the first backup now, go to Resiliency, then Protection Inventory, then Protected items. Filter Datasource type by Virtual machines, select More (...) for the VM, then Details. Select Backup Now, pick the last day to retain the recovery point and select OK.",
    ],
    cli: `# Create the vault in the same region as the VM (GRS is the default)
az backup vault create \\
  --resource-group rg-polaris-demo \\
  --name rsv-polaris \\
  --location southeastasia

# Optional: change redundancy. Only works before anything is protected.
az backup vault backup-properties set \\
  --name rsv-polaris \\
  --resource-group rg-polaris-demo \\
  --backup-storage-redundancy LocallyRedundant

# Protect the VM with the default policy (daily, kept 30 days)
az backup protection enable-for-vm \\
  --resource-group rg-polaris-demo \\
  --vault-name rsv-polaris \\
  --vm vm-web-01 \\
  --policy-name DefaultPolicy

# Run a backup now and keep the recovery point until the given date (dd-mm-yyyy)
az backup protection backup-now \\
  --resource-group rg-polaris-demo \\
  --vault-name rsv-polaris \\
  --container-name vm-web-01 \\
  --item-name vm-web-01 \\
  --backup-management-type AzureIaasVM \\
  --retain-until 31-12-2026`,
    powershell: `# First use only: register the provider
Register-AzResourceProvider -ProviderNamespace "Microsoft.RecoveryServices"

New-AzRecoveryServicesVault \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "rsv-polaris" \`
  -Location "southeastasia"

# Set the vault context for the commands that follow
Get-AzRecoveryServicesVault -Name "rsv-polaris" | Set-AzRecoveryServicesVaultContext

# Optional: change redundancy. Only works before anything is protected.
Get-AzRecoveryServicesVault -Name "rsv-polaris" | Set-AzRecoveryServicesBackupProperty -BackupStorageRedundancy LocallyRedundant

# Protect the VM with the default policy
$policy = Get-AzRecoveryServicesBackupProtectionPolicy -Name "DefaultPolicy"
Enable-AzRecoveryServicesBackupProtection \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "vm-web-01" \`
  -Policy $policy

# Run a backup now
$container = Get-AzRecoveryServicesBackupContainer \`
  -ContainerType "AzureVM" \`
  -FriendlyName "vm-web-01"
$item = Get-AzRecoveryServicesBackupItem \`
  -Container $container \`
  -WorkloadType "AzureVM"
Backup-AzRecoveryServicesBackupItem -Item $item`,
    bicep: `param location string = resourceGroup().location

resource vault 'Microsoft.RecoveryServices/vaults@2024-10-01' = {
  name: 'rsv-polaris'
  location: location
  sku: {
    name: 'RS0'
    tier: 'Standard'
  }
  properties: {
    publicNetworkAccess: 'Enabled'
    redundancySettings: {
      standardTierStorageRedundancy: 'GeoRedundant'
      crossRegionRestore: 'Disabled'
    }
    securitySettings: {
      softDeleteSettings: {
        softDeleteState: 'Enabled'
        softDeleteRetentionPeriodInDays: 14
      }
    }
  }
}

// A daily VM backup policy: one backup a day, kept 30 days, instant restore snapshots kept 2 days
resource vmPolicy 'Microsoft.RecoveryServices/vaults/backupPolicies@2024-10-01' = {
  parent: vault
  name: 'policy-vm-daily'
  properties: {
    backupManagementType: 'AzureIaasVM'
    instantRpRetentionRangeInDays: 2
    timeZone: 'UTC'
    schedulePolicy: {
      schedulePolicyType: 'SimpleSchedulePolicy'
      scheduleRunFrequency: 'Daily'
      scheduleRunTimes: [
        '2026-01-01T02:00:00Z'
      ]
    }
    retentionPolicy: {
      retentionPolicyType: 'LongTermRetentionPolicy'
      dailySchedule: {
        retentionTimes: [
          '2026-01-01T02:00:00Z'
        ]
        retentionDuration: {
          count: 30
          durationType: 'Days'
        }
      }
    }
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "Same-region rule: the vault must be in the same region as the data source it protects. When you pick VMs, only VMs in the vault's region are listed. With VMs in several regions you need a vault in each region. Moving a vault across regions is not supported. Moving vaults between subscriptions or resource groups in the same subscription is.",
    "Storage redundancy: the default is geo-redundant storage (GRS). The other options are locally redundant (LRS, cheaper, for when Azure is not your primary backup target) and zone-redundant (ZRS, for data availability without downtime in a region and data residency). Change it before you configure the first backup. After backup items exist, the option is disabled, and the only way out is the workarounds Learn describes, such as stopping protection and re-creating in a new vault.",
    "Cross Region Restore (CRR) lets you restore Azure VMs in the paired secondary region at any time, without waiting for Azure to declare a disaster. It works only on a GRS vault. You enable it under Properties, then Backup Configuration, then Update. It costs extra, and Learn says it cannot be reverted to GRS or LRS after protection starts for the first time. Without CRR, secondary-region data on a GRS vault is only usable when Azure declares a disaster.",
    "Soft delete is on by default for new vaults. Deleted backup data stays recoverable for 14 days at no extra cost. You can raise the retention to between 14 and 180 days, and days beyond the 14 are billed as normal backup storage. Learn describes secure by default (soft delete always on, cannot be disabled) as generally available for Recovery Services vaults in all public regions.",
    "Standard policy: one backup a day. Enhanced policy: a backup every 4 hours (the hourly options are 4, 6, 8, 12 and 24 hours). Trusted Launch VMs are protected with Enhanced policies. A VM using an Enhanced policy cannot be switched back to Standard. Learn's default policy backs up once a day and keeps daily backups for 30 days.",
    "In a custom VM policy you set the schedule (daily or weekly for Standard), Instant Restore snapshot retention, the retention range, and optional monthly and yearly retention. Instant Restore snapshots are kept for 1 to 5 days on Standard (default 2) and 1 to 30 days on Enhanced (default 7). Instant restore uses the local snapshot, so you do not wait for the data to copy from the vault.",
    "A backup job has a Snapshot phase (a recovery point for Instant Restore) and a Transfer data to vault phase (the long-term recovery point), and then Validate backup. Azure Backup puts the restore point collection in its own resource group, named AzureBackupRG_<region>_<number> by default. Do not lock that resource group.",
    "VM backup works through an extension that Azure Backup installs on the VM agent when you enable backup, whether or not the VM is running. A running VM gives the best chance of an application-consistent recovery point. A stopped VM is still backed up, with a crash-consistent point. No explicit outbound connectivity is needed. Marketplace images already have the agent. Custom or migrated VMs may need it installed manually.",
    "Restore options for a VM: Create new VM (must be in the same region as the source VM), Restore disk (gives you a template to build the VM), Replace existing (the VM must still exist, supported for unencrypted managed VMs, and Azure Backup snapshots the VM first), and Cross Region (only Create new and Restore disks, not Replace existing). For single files and folders use File Recovery on the VM's Backup page, which downloads a password-protected executable (Windows) or script (Linux).",
    "Recovery Services vault versus Backup vault are separate types for different data sources. Recovery Services vault: Azure VMs, SQL in Azure VMs, SAP HANA in Azure VMs, Azure Files, Azure Backup Server, the Azure Backup agent (MARS) and DPM. Backup vault: Azure Disks, Azure Blobs, Azure Database for PostgreSQL servers and Kubernetes services (preview, per Learn). Create the vault that matches the data source.",
    "Azure Site Recovery is a separate service that replicates VMs and physical servers to a secondary location and fails over when there is an outage. Azure Backup keeps your data safe and recoverable. Learn says both appear as jobs in the vault's monitoring, and you must disable Site Recovery replication and clean up its items before you can delete a vault.",
    "Immutable vault: a vault setting that blocks operations that would lose recovery points, such as stop protection with delete data or reducing retention in a policy. It has three states: Disabled, Enabled (can be turned off) and Enabled and locked (irreversible, uses WORM storage). Multi-user authorization (MUA) uses a separate Resource Guard resource, owned by a different person, to approve critical operations such as disabling soft delete.",
    "Deleting a vault: you cannot delete one that still has protected items, backup data (including soft-deleted data), registered storage accounts or servers, or private endpoints. Stop backup and select Delete Backup Data for each item first. You do not need to delete the VM or the policy. A delete lock on the resource group also blocks deleting backup items.",
    "You cannot move backup data between vaults, and a VM can be in only one vault at a time. To change a VM's vault, stop backup and then protect the VM in the new vault. Stopping with Retain data keeps the recovery points until you delete them, and you pay for them.",
    "Data is encrypted with platform-managed keys by default. To use a customer-managed key you must set it before you protect any item, and Learn says it cannot be reversed afterwards.",
  ],
    },
  ],

  related: ["resource-group", "virtual-machine", "storage-account", "file-share", "log-analytics-workspace", "alert-rule", "virtual-network"],
  docsUrl: "https://learn.microsoft.com/azure/backup/backup-azure-recovery-services-vault-overview",

  simulator: {
    armType: "Microsoft.RecoveryServices/vaults",
    apiVersion: "2024-10-01",
    nameRule: "recovery-services-vault",
  },
};
