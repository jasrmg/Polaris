import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const logAnalyticsWorkspace: ResourceInput = {
  slug: "log-analytics-workspace",
  name: "Log Analytics Workspace",
  type: "Microsoft.OperationalInsights/workspaces",
  category: "monitor-backup",
  scope: "resource",
  icon: "ScrollText",

  tagline: "A data store for logs from Azure and non-Azure resources. You search it with KQL queries.",
  definition:
    "A Log Analytics workspace is the main Azure Monitor Logs resource. It is a data store into which you collect any type of log data from your Azure and non-Azure resources and applications. The data lives in tables. Azure creates the tables it needs for Azure data, and you create custom tables for your own data. Each workspace lives in one Azure region, and each table has its own retention setting and table plan (Analytics, Basic or Auxiliary). You read the data with Kusto Query Language (KQL) queries in Log Analytics, and other features such as alerts, workbooks and Microsoft Sentinel use the same data. Creating a workspace costs nothing. You are charged for the data you ingest and keep.",
  analogy:
    "A big searchable filing room for logs. Every service drops its paperwork into labelled drawers (the tables), and a retention rule decides how long each drawer keeps its papers. You find things by asking questions in KQL. You pay for the papers you file and the time they stay, not for the room.",
  whenToUse: [
    "Collecting resource logs, the activity log and guest OS data from many resources in one place so you can query them together.",
    "Searching logs with KQL for troubleshooting, and building alerts or workbooks on the results.",
    "Keeping log data for audit or compliance. You can extend a table's total retention up to 12 years inside the workspace.",
    "Receiving data from VMs through Azure Monitor Agent and data collection rules, or from custom apps through the Logs ingestion API.",
  ],
  notFor: [
    "Numeric time-series values. Azure Monitor Metrics is the other half of the Azure Monitor data platform and stores those.",
    "Cheap archive storage with no querying. Learn says storage might be less expensive than other options and can be kept indefinitely, and diagnostic settings or data export can send data there.",
    "Collecting guest OS data on a VM with no agent. Without an agent you only see data from the host. The Azure Monitor Agent does the collecting.",
    "Sending notifications on its own. A log search alert rule queries the workspace, and an action group does the notifying.",
  ],

  prerequisites: [
    {
      name: "An Azure subscription and permission to create the workspace",
      why: "You need Microsoft.OperationalInsights/workspaces/write on the resource group. The Log Analytics Contributor built-in role provides it.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The workspace needs a group to live in. Use an existing one or create a new one. The workspace name must be unique per resource group.",
    },
    {
      name: "A region",
      why: "Each workspace resides in one Azure region. Pick a region where Log Analytics is available. Keep data in a specific geography only if you have a rule that says so. Otherwise Learn suggests one workspace for all regions.",
    },
    {
      name: "A data source (to get any data in)",
      slug: "virtual-machine",
      why: "A workspace starts empty. Resources can send data to it with diagnostic settings, and VMs use the Azure Monitor Agent with a data collection rule. VMs can be in a different region from the workspace, but Learn warns that bandwidth charges can apply when a VM in another region sends data to it. The data collection rule itself must be created in the same region as the workspace.",
    },
  ],

  example: {
    portal: [
      "In the Azure portal, enter Log Analytics in the search box and select Log Analytics workspaces.",
      "Select Create.",
      "Select a Subscription from the dropdown.",
      "Use an existing Resource Group or create a new one.",
      "Enter a name for the workspace, for example law-polaris. The name must be unique per resource group.",
      "Select an available Region.",
      "Select Review + Create to review the settings, then select Create. A default pay-as-you-go pricing tier is applied, and no charges accrue until data collection begins.",
      "To change the default retention, open the workspace, then under Settings select Usage and estimated costs. Select Data Retention at the top, move the slider to the number of days you want, then select OK.",
      "To set a daily cap, stay on Usage and estimated costs, select Daily Cap at the top, select ON and enter the data volume limit in GB/day.",
      "To run a query, open the workspace and select Logs. Selecting Logs from the workspace uses workspace scope.",
    ],
    cli: `az monitor log-analytics workspace create \\
  --resource-group rg-polaris-demo \\
  --workspace-name law-polaris \\
  --location southeastasia \\
  --sku PerGB2018 \\
  --retention-time 90 \\
  --quota 1

az monitor log-analytics workspace show \\
  --resource-group rg-polaris-demo \\
  --workspace-name law-polaris`,
    powershell: `New-AzOperationalInsightsWorkspace \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "law-polaris" \`
  -Location "southeastasia" \`
  -Sku "PerGB2018" \`
  -RetentionInDays 90

Get-AzOperationalInsightsWorkspace \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "law-polaris"`,
    bicep: `param location string = resourceGroup().location

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'law-polaris'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 90
    features: {
      enableLogAccessUsingOnlyResourcePermissions: true
    }
    workspaceCapping: {
      dailyQuotaGb: 1
    }
  }
}`,
  },
  examNotes: [
    "Retention defaults. By default every table keeps data for 30 days, except that Usage and AzureActivity keep data for at least 90 days at no charge, and so do the Application Insights tables. Analytics retention can be extended up to two years (730 days) by changing the workspace default or a single table. Total retention (long-term retention included) can reach 12 years (4,383 days). The CLI --total-retention-time parameter supports up to 2,556 days (seven years).",
    "Basic and Auxiliary tables have only a total retention period, which is 30 days by default. Retention is set per table under Tables, then Manage table. After analytics retention ends, you retrieve older data with a search job. If you shorten a table's total retention, Azure Monitor Logs waits 30 days before it removes the data, so you can undo a mistake.",
    "Table plans are set per table, so one workspace can mix all three. Analytics is for continuous monitoring and has full features. Basic costs less to ingest and bills for queries by data scanned. Auxiliary is the lowest cost, for verbose and audit data, and is not subject to the daily cap. Basic and Auxiliary plans are not available to workspaces in legacy pricing tiers.",
    "Pricing tiers. The default is pay-as-you-go (SKU name PerGB2018), billed on data ingested and retained. Commitment tiers start at 100 GB per day, last 31 days, and Learn says they can save as much as 30 percent against pay-as-you-go for Analytics Logs. During the commitment period you can go up to a higher tier but not back to pay-as-you-go or a lower tier. You change the tier under Usage and estimated costs. The legacy tiers (Free Trial, Standalone, Per Node, Standard, Premium) are only for older subscriptions.",
    "Cost control. There is no direct cost to create or keep a workspace. You pay for ingestion and retention. Lower cost by choosing the right table plan, filtering with ingestion-time transformations in a data collection rule, and picking a commitment tier when volume is high. The AzureActivity, Heartbeat, Usage and Operation tables are free from ingestion charges.",
    "Daily cap. It stops collection of billable data for Analytics and Basic tables for the rest of a 24-hour period once your GB/day limit is reached. The reset hour is shown in the portal but cannot be changed. Some data above the cap is expected, and it is still billed. Learn says to use it only as a safeguard against spikes, not to cut costs. In ARM and Bicep it is workspaceCapping.dailyQuotaGb. In the CLI it is --quota, and the default of -1 means unlimited. Create a log search alert rule on the cap event so you know when it is hit.",
    "Getting data in. Resource logs are not collected by default. Create a diagnostic setting on the resource and pick the Log Analytics workspace as a destination. Platform metrics and the activity log can also be sent there with a diagnostic setting. A resource can have up to five diagnostic settings, and the workspace must already exist. For VMs, install the Azure Monitor Agent, create a data collection rule (DCR), and associate the DCR with the VM. VM insights sets this up for you. Custom and third-party data goes through the Logs ingestion API.",
    "The Log Analytics agent (also called MMA or OMS) was retired on August 31, 2024. Learn says that after March 2, 2026 its data upload can stop at any time. Use the Azure Monitor Agent instead.",
    "Access control mode is a workspace setting. Use resource or workspace permissions lets users read data for resources they can view. Require workspace permissions needs explicit access to the workspace or its tables. In ARM and Bicep, enableLogAccessUsingOnlyResourcePermissions set to true gives resource-or-workspace permissions, and false (also the value when the flag is not set) gives workspace permissions.",
    "Access mode is how you open the logs. Opening Logs from the workspace or the Azure Monitor menu is workspace-context and shows all tables you can access. Opening Logs from a resource is resource-context and shows only that resource's records. Resource-context supports only tables on the Analytics plan.",
    "Roles. Log Analytics Reader can view and search all monitoring data and settings but cannot read the workspace keys. Log Analytics Contributor can do all that and also edit monitoring settings, configure diagnostic settings and data export, and run search jobs. Learn warns that the permission to add a VM extension can give full control of a VM.",
    "KQL basics. Start a query with a table name, then add commands with the pipe character. Table and column names are case sensitive. The time picker defaults to the last 24 hours. For example: Perf | where TimeGenerated > ago(1h) | summarize count() by ObjectName. Use take for a sample, top or sort to order results, where to filter, project to pick columns and summarize to group.",
    "Workspace per region. Each workspace lives in one region. Start with a single workspace and add more only when a requirement needs it, for example data that must stay in a geography, split billing, different retention for the same table, or resilience. Diagnostic settings from other Azure resources do not incur egress charges. VMs sending data across regions can.",
    "Creating a workspace with the same name, resource group, subscription and region as one deleted in the last 14 days recovers the deleted workspace and its data. If you want a brand new workspace with a soft-deleted name, you get an error until you recover the old one and permanently delete it.",
    "In the CLI the command is az monitor log-analytics workspace create, and the retention parameter is --retention-time. In Azure PowerShell the cmdlets use the old name Operational Insights, for example New-AzOperationalInsightsWorkspace with -RetentionInDays.",
  ],

  related: [
    "resource-group",
    "virtual-machine",
    "container-apps",
    "app-service",
    "alert-rule",
    "network-watcher",
    "storage-account",
    "recovery-services-vault",
    "action-group",
  ],
  docsUrl:
    "https://learn.microsoft.com/azure/azure-monitor/logs/log-analytics-workspace-overview",

  simulator: [
    { key: "name", label: "Workspace name", type: "text", required: true, default: "law-polaris", help: "Must be unique per resource group." },
    { key: "region", label: "Region", type: "select", required: true, default: "southeastasia", options: regionIds, help: "A workspace lives in one region." },
    { key: "retentionDays", label: "Data retention (days)", type: "number", required: false, default: 30, help: "Not on the create form. After creation, set it under Usage and estimated costs, then Data Retention. The default is 30 days." },
    { key: "dailyCapGb", label: "Daily cap (GB/day)", type: "number", required: false, help: "Not on the create form. After creation, set it under Usage and estimated costs, then Daily Cap. Leave empty for no cap." },
  ],
};
