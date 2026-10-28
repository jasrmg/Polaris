import type { ResourceInput } from "../schema";

export const actionGroup: ResourceInput = {
  slug: "action-group",
  name: "Action Group",
  type: "Microsoft.Insights/actionGroups",
  category: "monitoring",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 2,
  scope: "resource",
  icon: "Send",

  tagline: "A reusable list of who to notify and what to run when an Azure Monitor alert fires.",
  definition:
    "An action group is a collection of notification preferences and automated actions. It decides who gets told and what happens when an alert fires. Notification types are email, SMS, voice call and push to the Azure mobile app. Automated actions can call a webhook, an Azure Function, a Logic Apps workflow, an Automation runbook, Event Hubs or an ITSM tool. Each receiver has a type, a name that is unique inside the action group, and details for that type. You can use action groups with Azure Monitor, Azure Service Health and Azure Advisor.",
  analogy:
    "A call list taped to the wall of a control room. When an alarm goes off, nobody has to decide who to phone: the alarm just points at the list. The same list can be reused by many alarms, and you can edit the list in one place without touching the alarms.",
  whenToUse: [
    "Telling people about an alert by email, SMS, voice call or push to the Azure mobile app.",
    "Triggering automation when an alert fires, such as a runbook, an Azure Function or a Logic Apps workflow.",
    "Sending alerts to another system through a webhook, Event Hubs or an ITSM connection.",
    "Sharing one set of recipients across many alert rules, so you only maintain it once.",
  ],
  notFor: [
    "Deciding when an alert fires. That is the alert rule: it holds the condition and the severity, and it points at action groups.",
    "Muting notifications during planned maintenance. An alert processing rule can suppress action groups without editing every alert rule.",
    "Storing the logs and metrics that alerts are based on. That is Azure Monitor and the Log Analytics workspace.",
    "Sending SMS or voice calls to a country or region that is not in the portal's country list. Learn suggests a webhook to a third-party provider instead.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The action group is saved in the subscription, region and resource group that you select.",
    },
    {
      name: "At least one notification or action",
      why: "Without receivers, an action group does nothing. Each receiver needs a name that is unique within the group, plus its details such as an email address or a webhook URI.",
    },
    {
      name: "A verified email address (for Email notifications)",
      why: "A new email address gets a one-time passcode (OTP) request. You must verify it within 30 minutes of saving the action group, or it cannot receive alert or test notifications.",
    },
    {
      name: "A connection or target for some action types",
      why: "An ITSM action needs an ITSM connection. A secure webhook needs a protected web API registered in Microsoft Entra ID. A Logic Apps, Functions or Automation action points at an existing resource.",
    },
  ],

  example: {
    portal: [
      "In the Azure portal, search for and select Monitor.",
      "Select Alerts, then Action groups, then select Create.",
      "On the Basics tab, under Project details, select the Subscription and Resource group.",
      "Select the Region. Global lets the service decide where the action group is stored. Regional keeps processing in the region you choose.",
      "Under Instance details, enter an Action group name and a Display name. The display name is used in place of the full name when notifications are sent.",
      "Select Next: Notifications. Select a Notification type of Email and enter the email address.",
      "Enter a Name for the notification, choose whether to enable the Common alert schema, then select OK.",
      "Select Next: Actions if you want automated actions. Pick an action type and enter a name for each action. This is optional for this example.",
      "Select Review + create, then Create.",
      "Open your inbox and use the one-time passcode (OTP) request to verify the email address within 30 minutes.",
      "To test it, open Monitor, then Alerts, then Action groups. Select your action group, then select Test from the top action bar. Choose a sample type and the notification types to test, then select Test.",
      "Wait for the test status. It shows Success or Failed, and View details gives the error information for a failure.",
    ],
    cli: `az monitor action-group create \\
  --name ag-polaris-ops \\
  --resource-group rg-polaris-demo \\
  --short-name agpolaris \\
  --location Global \\
  --action email ops-email ops@contoso.com usecommonalertschema`,
    powershell: `$email = New-AzActionGroupEmailReceiverObject \`
  -Name "ops-email" \`
  -EmailAddress "ops@contoso.com" \`
  -UseCommonAlertSchema $true

New-AzActionGroup \`
  -Name "ag-polaris-ops" \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Location "Global" \`
  -GroupShortName "agpolaris" \`
  -Enabled \`
  -EmailReceiver $email`,
    bicep: `param actionGroupName string = 'ag-polaris-ops'

@maxLength(12)
param groupShortName string = 'agpolaris'

param emailAddress string = 'ops@contoso.com'

resource actionGroup 'Microsoft.Insights/actionGroups@2023-01-01' = {
  name: actionGroupName
  location: 'global'
  properties: {
    groupShortName: groupShortName
    enabled: true
    emailReceivers: [
      {
        name: 'ops-email'
        emailAddress: emailAddress
        useCommonAlertSchema: true
      }
    ]
  }
}

output actionGroupId string = actionGroup.id`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "An action group is separate from the alert rule. Many alert rules can use the same action group, and one alert rule can use up to five action groups. They run at the same time, in no set order. To email the same people for two alert rules, create one action group and attach it to both.",
    "Notification types are Email Azure Resource Manager role, Email, SMS, Azure app push notifications and Voice. Action types are Automation Runbook, Event Hubs, Functions, ITSM, Logic Apps, Secure webhook and Webhook. Notifications tell a person. Actions run automation or call another system.",
    "In a template the resource type is Microsoft.Insights/actionGroups, and groupShortName is required with a maximum length of 12. It is used in SMS messages. The Learn ARM template sets location to Global. The Azure CLI default location is also Global.",
    "Global or regional is a processing choice. Global lets the service pick where the action group is stored. It is kept in at least two regions, and actions may run in any geographic region. Regional keeps storage and processing in the region you pick, from a short list that includes East US, West US 2, Sweden Central and India Central. Service Health alerts need the action group region to be Global.",
    "Rate limits apply to SMS, voice, push and email, across all subscriptions. Other notification actions are not rate limited. In production, no more than one SMS or one voice call every five minutes, and no more than 100 emails per hour per email address per region.",
    "Each receiver type has a cap per action group: 10 for SMS, voice, Azure app push, Email ARM role, webhook, secure webhook, Event Hubs, ITSM, Logic Apps and runbook actions. Email allows 1,000. You can create an unlimited number of action groups in a subscription.",
    "Test an action group in the portal with Test in the top action bar. Save the action group first. The result is Success or Failed, and test messages have Test in the subject. Test runs are limited, for example 2 test notifications every 5 minutes per action group per region. Subscription Contributor, Resource group Contributor and Azure Monitor Contributor can test an existing action group. A custom role needs Microsoft.Insights/ActionGroups/* and can exclude write and delete to allow testing only.",
    "Email Azure Resource Manager role emails the members of a subscription role. Only Owner, Contributor, Reader, Monitoring Contributor and Monitoring Reader are supported. Assign a User or Group to the role at the subscription level. The user also needs an email address in their Microsoft Entra profile. These addresses do not need OTP verification, and a new role assignment can take up to 24 hours to start receiving notifications.",
    "Webhook and Secure webhook are different action types. A webhook cannot use certificates, so basic authentication goes in the URI. A secure webhook must use Microsoft Entra ID to protect the endpoint, and it does not support basic authentication. If a webhook call fails, it is retried, and then the action group does not call the endpoint for 15 minutes.",
    "An alert processing rule works on fired alerts. It can add action groups, or suppress them such as during planned maintenance. It does not change the alert rule. Its resource type is Microsoft.AlertsManagement/actionRules, and it does not affect Azure Service Health alerts.",
    "Retirement notes. ITSM actions that send alerts and events to ServiceNow are in a 3-year deprecation that started in September 2022. Learn recommends the secure webhook action for ServiceNow ITOM and BMC Helix. Azure Automation Run as accounts were retired on 30 September 2023, so runbook actions should use a managed identity.",
    "If an action group is not enabled, none of its receivers get any communications. In PowerShell, New-AzActionGroup needs the -Enabled switch to enable it.",
  ],
    },
  ],

  related: ["alert-rule", "log-analytics-workspace", "resource-group", "virtual-machine", "app-service"],
  docsUrl: "https://learn.microsoft.com/azure/azure-monitor/alerts/action-groups",

  simulator: {
    armType: "Microsoft.Insights/actionGroups",
    apiVersion: "2023-01-01",
    nameRule: "action-group",
  },
};
