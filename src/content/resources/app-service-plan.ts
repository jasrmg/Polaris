import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const appServicePlan: ResourceInput = {
  slug: "app-service-plan",
  name: "App Service Plan",
  type: "Microsoft.Web/serverfarms",
  category: "compute",
  scope: "resource",
  icon: "LayoutGrid",

  tagline: "The compute (region, OS, size, instances) that your web apps run on, and what you are billed for.",
  definition:
    "An App Service plan is the set of compute resources that App Service apps run on. When you create a plan in a region, Azure sets aside compute for it in that region, and every app you put in the plan runs on it. The plan sets the operating system (Windows or Linux), the region, the number of VM instances, the size of those instances and the pricing tier. An app always runs in a plan, and the plan, not the app, is what you pay for.",
  analogy:
    "An apartment building you rent. The plan is the building: its size and number of floors are the VM size and instance count. Apps are the tenants who share it. You pay the rent for the building whether it holds one tenant or ten, and an empty building still costs money.",
  whenToUse: [
    "Hosting one or more App Service web apps or APIs. Every app needs a plan.",
    "Putting several small apps in one plan to share the compute and save money, as long as the plan has enough resources for all of them.",
    "Scaling up (a bigger tier or size) or out (more instances) without changing app code or redeploying.",
  ],
  notFor: [
    "Apps that need full control of the operating system. A virtual machine gives you that.",
    "Keeping a plan around as an empty placeholder. A plan with no apps still bills, because it keeps its VM instances reserved.",
    "Isolating one busy app from its neighbours inside the same plan. Apps in a plan share the same VM instances, so give the busy app its own plan.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The plan lives in a resource group. If creation fails with a pricing tier or workers error, Learn says to create the plan in a new resource group.",
    },
    {
      name: "A region",
      why: "The plan's region is where its compute runs and where its apps run. You cannot change a plan's region later.",
    },
    {
      name: "An operating system (Windows or Linux)",
      why: "You choose it when you create the plan. An app can only move to a plan with the same OS type.",
    },
    {
      name: "A pricing tier",
      why: "The tier decides which features you get (such as autoscale and deployment slots) and how much you pay. The tiers you can pick depend on the OS, region and other factors.",
    },
  ],

  example: {
    portal: [
      "In the Azure portal, go to Create App Service Plan.",
      "Under Project Details, choose the Subscription and the Resource group.",
      "Under App Service Plan details, enter a Name such as plan-polaris-demo, set Operating System to Linux and choose a Region.",
      "For Pricing Tier, select a Pricing plan such as Basic B1. Select Explore pricing plans to compare tiers.",
      "In the Zone redundancy section, select Disabled for a small demo. Enabled needs at least 2 instances.",
      "Select Review + create, then select Create.",
      "To change the tier later, open an app in the plan and, in the left pane under App Service plan, select Scale up.",
    ],
    cli: `az appservice plan create \\
  --name plan-polaris-demo \\
  --resource-group rg-polaris-demo \\
  --location southeastasia \\
  --sku B1 \\
  --is-linux \\
  --number-of-workers 1

# Scale up (a different size or tier)
az appservice plan update \\
  --name plan-polaris-demo \\
  --resource-group rg-polaris-demo \\
  --sku S1

# Scale out (more instances)
az appservice plan update \\
  --name plan-polaris-demo \\
  --resource-group rg-polaris-demo \\
  --number-of-workers 2`,
    powershell: `New-AzAppServicePlan \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "plan-polaris-demo" \`
  -Location "southeastasia" \`
  -Tier "Basic" \`
  -WorkerSize "Small" \`
  -NumberofWorkers 1 \`
  -Linux`,
    bicep: `param location string = resourceGroup().location

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-polaris-demo'
  location: location
  sku: {
    name: 'B1'
    capacity: 1
  }
  properties: {
    reserved: true
  }
}`,
  },
  examNotes: [
    "Scale up changes the pricing tier or size of the plan, which gives more CPU, memory and disk or extra features. Scale out changes the number of VM instances. Both apply to every app in the plan and take only seconds, with no code change or redeploy.",
    "Free and Shared run apps on a shared VM with other customers' apps, give each app CPU quotas, and cannot scale out. Free allows 3 CPU minutes per 5 minutes and 60 per day. Shared allows 3 per 5 minutes and 240 per day.",
    "Maximum instances when scaling out: Basic 3, Standard 10, Premium v2, v3 and v4 up to 30, and Isolated up to 100. Manual scale out starts at Basic. Autoscale needs Standard or higher.",
    "Deployment slots need Standard, Premium or Isolated. Standard allows 5 slots per app, Premium and Isolated allow 20. Slots run on the same VM instances as the plan and cost nothing extra. You cannot scale down to a tier that supports fewer slots than the app already uses.",
    "Apps in a plan share its VM instances. If you scale the plan, every app scales with it, including all of its deployment slots. To scale one app independently, give it its own plan or turn on per-app scaling.",
    "Billing is per plan, not per app. In Basic, Standard and the Premium tiers you pay for each VM instance, however many apps run on it. The Free tier is not charged, and in Shared each app is charged for its CPU quota.",
    "An app can move to another plan only if both plans are in the same resource group and region and use the same OS type. Windows to Linux is not supported, and you must turn off virtual network integration on the app first. A plan's region cannot be changed, so to run an app in another region you clone it.",
    "The OS is chosen when you create the plan. In the CLI, --is-linux defaults to true, so use --is-linux false for a Windows plan. In a Bicep template, reserved: true means a Linux plan and false means Windows.",
    "Always On is an app setting that keeps the app loaded when there is no traffic. When it is off, which is the default, the app is unloaded after 20 minutes without requests. The Free and Shared tiers do not support it, and continuous WebJobs need it.",
    "Deleting the last app in a plan also deletes the plan by default. If you keep the plan, set it to the Free tier so you are not charged. A plan with no apps still bills because it reserves its VM instances.",
    "Apps per plan: Free allows 10 and Shared allows 100. Basic and above have no fixed limit, but the number you can fit depends on the apps' activity and the VM size. Learn gives a rule of thumb of 8 apps for B1, S1 and P1v2 and 16 for P1v3. Active slots count as apps.",
  ],

  related: ["resource-group", "app-service", "virtual-machine", "virtual-network", "virtual-machine-scale-set", "container-apps"],
  docsUrl: "https://learn.microsoft.com/azure/app-service/overview-hosting-plans",

  simulator: [
    { key: "name", label: "App Service plan name", type: "text", required: true, default: "plan-polaris-demo" },
    { key: "region", label: "Region", type: "select", required: true, default: "southeastasia", options: regionIds },
    { key: "os", label: "Operating System", type: "select", required: true, default: "Linux", options: ["Linux", "Windows"] },
    { key: "sku", label: "Pricing tier", type: "select", required: true, default: "B1", options: ["F1", "B1", "S1", "P0v3", "P1v3"] },
    { key: "instances", label: "Instance count", type: "number", required: true, default: 1, help: "Scale out adds instances. Free and Shared cannot scale out." },
  ],
};
