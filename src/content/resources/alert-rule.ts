import type { ResourceInput } from "../schema";

export const alertRule: ResourceInput = {
  slug: "alert-rule",
  name: "Azure Monitor Alert Rule",
  type: "Microsoft.Insights/metricAlerts",
  category: "monitoring",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 2,
  scope: "resource",
  icon: "BellRing",

  tagline: "Checks a signal against a condition and fires an alert. An action group sends the notification.",
  definition:
    "An Azure Monitor alert rule combines the resources to monitor, the signal (the data) from them, and a condition. When the condition is met, the rule fires an alert. The alert starts its action groups and updates the state of the alert. This entry shows a metric alert rule, whose resource type is Microsoft.Insights/metricAlerts. It evaluates a metric, such as a VM's Percentage CPU, at regular intervals. Other alert types are separate resource types. Learn lists log search alerts under microsoft.insights/scheduledqueryrules and activity log alerts under microsoft.insights/activityLogAlerts. The alert rule itself does not send anything: an action group does.",
  analogy:
    "A smoke detector wired to an alarm bell. The detector is the alert rule: it keeps checking one reading and trips when the reading crosses your line. The bell is the action group that makes noise. A 'do not disturb' sign during planned maintenance is an alert processing rule: the detector still trips, but the bell stays quiet.",
  whenToUse: [
    "You want to be told when a metric crosses a line, such as a VM's CPU staying above 80 percent. Learn recommends metric alerts when the data is already available as metrics and needs little or no manipulation.",
    "One rule should watch many resources of the same type in the same Azure region. For example, all VMs in one region in a resource group. You get a separate alert for each resource.",
    "You do not know the right threshold. Dynamic thresholds learn the normal pattern of the metric and set it for you.",
    "You need to know about a missing signal such as a VM heartbeat. Learn suggests metric alerts over log search alerts here, because logs are more latent than metrics.",
  ],
  notFor: [
    "Data that needs advanced logic or a query. Use a log search alert, which runs a Log Analytics (KQL) query on a schedule.",
    "Reacting to something that happened, such as a VM being deleted or a role being assigned. Use an activity log alert.",
    "Silencing notifications during planned maintenance. An alert processing rule suppresses action groups without disabling the rule.",
    "Classic metric alerts. Learn says classic alerts are retired for public cloud users, and classic alert rules can no longer be created with PowerShell.",
    "Notifying anyone on its own. Without an action group, the alert fires and shows on the Alerts page, but nobody is notified.",
  ],

  prerequisites: [
    {
      name: "A resource to monitor",
      slug: "virtual-machine",
      why: "The scope of the rule. It can be one resource, such as a VM, or several resources of the same type in the same Azure region. A new resource can take 10 to 15 minutes before its metrics are available.",
    },
    {
      name: "An action group",
      slug: "action-group",
      why: "Optional to create the rule, but it is what sends notifications or runs automation when the alert fires. You can select an existing one or create one on the Actions tab. You need read permission on it.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The alert rule is a resource and must be stored in one. The portal uses the target resource's group by default. Rule names must be unique within the group.",
    },
    {
      name: "Permissions",
      why: "Read on the target resource, read on any action group used, and write on the resource group that holds the rule. The built-in Monitoring Contributor role can create alert rules.",
    },
  ],

  example: {
    portal: [
      "Go to the virtual machine, for example vm-web-01, and select Alerts on the left pane. Or select Monitor, then Alerts.",
      "Select + Create, then Alert rule. From the VM, the scope is already set to that VM. From Monitor, use the Select a resource pane to set the scope, then select Apply.",
      "On the Condition tab, open the Signal name field and select Percentage CPU. If you do not see it, select See all signals.",
      "In the Alert logic section, set Threshold to Static, Aggregation type to Average, Operator to Greater than, and Threshold value to 80.",
      "In the When to evaluate section, set Check every to 1 minute and Lookback period to 5 minutes, then select Done.",
      "On the Actions tab, select an existing action group, or create one.",
      "On the Details tab, select the Subscription and Resource group, and select the Severity. Enter an Alert rule name, for example alert-vm-high-cpu, and an Alert rule description.",
      "Under Advanced options, select Automatically resolve alerts to make the alert stateful.",
      "Select Review + create, then Create.",
    ],
    cli: `VM_ID=$(az vm show \\
  --resource-group rg-polaris-demo \\
  --name vm-web-01 \\
  --query id --output tsv)

AG_ID=$(az monitor action-group show \\
  --resource-group rg-polaris-demo \\
  --name ag-polaris-ops \\
  --query id --output tsv)

az monitor metrics alert create \\
  --name alert-vm-high-cpu \\
  --resource-group rg-polaris-demo \\
  --scopes $VM_ID \\
  --condition "avg Percentage CPU > 80" \\
  --window-size 5m \\
  --evaluation-frequency 1m \\
  --severity 2 \\
  --description "Percentage CPU is above 80 percent" \\
  --action $AG_ID`,
    powershell: `$vmId = (Get-AzVM -ResourceGroupName "rg-polaris-demo" -Name "vm-web-01").Id
$actionGroupId = (Get-AzActionGroup -ResourceGroupName "rg-polaris-demo" -Name "ag-polaris-ops").Id

$condition = New-AzMetricAlertRuleV2Criteria \`
  -MetricName "Percentage CPU" \`
  -MetricNamespace "Microsoft.Compute/virtualMachines" \`
  -TimeAggregation Average \`
  -Operator GreaterThan \`
  -Threshold 80

Add-AzMetricAlertRuleV2 \`
  -Name "alert-vm-high-cpu" \`
  -ResourceGroupName "rg-polaris-demo" \`
  -TargetResourceId $vmId \`
  -Condition $condition \`
  -WindowSize 00:05:00 \`
  -Frequency 00:01:00 \`
  -Severity 2 \`
  -Description "Percentage CPU is above 80 percent" \`
  -ActionGroupId $actionGroupId`,
    bicep: `param vmName string = 'vm-web-01'
param actionGroupName string = 'ag-polaris-ops'

resource vm 'Microsoft.Compute/virtualMachines@2024-03-01' existing = {
  name: vmName
}

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' existing = {
  name: actionGroupName
}

resource cpuAlert 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'alert-vm-high-cpu'
  location: 'global'
  properties: {
    description: 'Percentage CPU is above 80 percent'
    severity: 2
    enabled: true
    scopes: [ vm.id ]
    evaluationFrequency: 'PT1M'
    windowSize: 'PT5M'
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria'
      allOf: [
        {
          name: 'HighCpu'
          criterionType: 'StaticThresholdCriterion'
          metricName: 'Percentage CPU'
          metricNamespace: 'Microsoft.Compute/virtualMachines'
          operator: 'GreaterThan'
          threshold: 80
          timeAggregation: 'Average'
        }
      ]
    }
    actions: [
      {
        actionGroupId: actionGroup.id
      }
    ]
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "Pick the alert type from the signal. Metric alert: data already in metrics that needs little manipulation. Log search alert: advanced logic with a KQL query on logs. Activity log alert: a specific event such as a restart, a shutdown, or a resource being created or deleted. Service Health and Resource Health alerts are types of activity log alert. Prometheus alerts use PromQL on Azure Monitor managed service for Prometheus. Smart detection alerts come from Application Insights.",
    "Resource types differ by alert type. Metric alerts are Microsoft.Insights/metricAlerts. Learn lists log search alerts under microsoft.insights/scheduledqueryrules and activity log alerts under microsoft.insights/activityLogAlerts. Alert processing rules are Microsoft.AlertsManagement/actionRules, because they used to be called action rules.",
    "Severity runs from 0 (critical) to 4 (verbose). In az monitor metrics alert create the default is 2.",
    "Evaluation frequency is how often the rule checks the condition (portal: Check every, CLI: --evaluation-frequency, default 1m). The aggregation window is the time over which the metric is aggregated (portal: Lookback period, CLI: --window-size, default 5m). For example, every 1 minute, look back 5 minutes. For dynamic thresholds, keep Check every less than or equal to Lookback period.",
    "Alert condition and user response are two different things. The condition is set by the system: Fired, then Resolved once the cause clears. The user response is set by you and stays until you change it: New, Acknowledged or Closed. Activity log alerts are stateless, so their condition stays Fired and you manage them with the user response.",
    "Stateless alerts fire every time the condition is met, even if they already fired. Stateful alerts fire once and send nothing more until the condition is resolved, and then they send a resolved notification. Learn says metric alerts are stateful by default. A stateful metric alert is resolved when the condition is not met for three consecutive checks. The API setting is autoMitigate, and its default is true. The portal's Advanced options has Automatically resolve alerts to make the alert stateful. Log search alerts can be stateful or stateless.",
    "An action group is what notifies. It can send email, SMS and push notifications, or start Automation runbooks, Azure Functions, ITSM tickets, Logic Apps, webhooks and Event Hubs. The Actions tab is optional when you create a rule, but with no action group nobody is told.",
    "Alert processing rules change alerts as they fire. They can suppress action groups, or add action groups. They can have a scope, filters and a one-time or recurring schedule. Scope is resources, a resource group or a subscription, in the same subscription as the rule. They do not stop the alert from firing: suppressed alerts still appear in the portal. Suppression wins over Apply action groups. They do not affect Service Health alerts. Disabling the alert rule is different, because then no alert fires at all.",
    "One metric alert rule can watch several resources, if they are the same type and in the same Azure region. For VMs the scope can be a list of VMs, resource groups, or a subscription. When the scope is a resource group or subscription, the CLI needs --target-resource-type and --target-resource-region. You get separate alerts per resource. Multi-resource rules are not supported for VM guest metrics or VM network metrics.",
    "One metric alert rule can have up to five conditions. With several conditions, the alert fires when all are true. Dynamic thresholds cannot be used in a rule with multiple conditions.",
    "Dynamic thresholds use machine learning on the metric's history instead of a number you pick. Learn says they work with metric alerts and log search alerts. Sensitivity is High, Medium (the default in the portal) or Low. A new rule does not alert before it has three days and at least 30 samples of data. Dynamic thresholds are not supported in log search alert rules with 1-minute frequency.",
    "To create an alert rule you need read on the target resource, read on any action group used, and write on the resource group that holds the rule. Metric alert rule names cannot be changed after creation and must be unique in the resource group.",
    "Alerts are stored for 30 days and are then deleted. A fired alert instance is read-only. Changes to the rule apply only to future alerts.",
    "Classic metric alerts are retired for public cloud users. To create a metric alert rule in PowerShell, use Add-AzMetricAlertRuleV2 together with New-AzMetricAlertRuleV2Criteria. In the CLI, use az monitor metrics alert create.",
  ],
    },
  ],

  related: [
    "action-group",
    "log-analytics-workspace",
    "virtual-machine",
    "network-watcher",
    "storage-account",
    "app-service",
    "resource-group",
  ],
  docsUrl: "https://learn.microsoft.com/azure/azure-monitor/alerts/alerts-create-metric-alert-rule",

  simulator: {
    armType: "Microsoft.Insights/metricAlerts",
    apiVersion: "2018-03-01",
    nameRule: "alert-rule",
  },
};
