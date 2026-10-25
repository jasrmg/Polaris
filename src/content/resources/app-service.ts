import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const appService: ResourceInput = {
  slug: "app-service",
  name: "App Service (Web App)",
  type: "Microsoft.Web/sites",
  category: "compute",
  scope: "resource",
  icon: "Globe",

  tagline: "Managed hosting for web apps and APIs: you bring the code or a container, Azure runs the servers.",
  definition:
    "Azure App Service runs web applications, mobile back ends and REST APIs without you managing the underlying infrastructure. It supports .NET, Java, Node.js, Python and PHP on Windows and Linux, or you can deploy a custom container. A web app is the Microsoft.Web/sites resource. It always belongs to an App Service plan, and the plan decides the pricing tier and which features you get, such as deployment slots, scale out and backups.",
  analogy:
    "Renting a shop unit in a managed shopping centre. The building, power and security are looked after for you, and you only bring your own stock (your code). The App Service plan is the size of the unit, and a bigger unit comes with more features.",
  whenToUse: [
    "Hosting a web app, mobile back end or REST API in a supported stack without patching or running servers.",
    "Running a containerised web app as a custom container, still on the App Service platform.",
    "Releasing safely: deploy to a staging slot, test it, then swap it into production (Standard tier or higher).",
    "Needing built-in extras such as a custom domain with a managed certificate, autoscale and backups.",
  ],
  notFor: [
    "Full control of the operating system, or installing any software you like. That is a Virtual Machine, where you manage the VM yourself.",
    "A microservices design made of many containers. Azure Container Apps is the compute guide's pick for microservices and event-driven styles, without Kubernetes to run.",
    "Small code that runs when an event fires. Azure Functions is built for event-driven code.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The web app and its App Service plan need a group to live in.",
    },
    {
      name: "An App Service plan",
      slug: "app-service-plan",
      why: "The plan is what you pay for. Its pricing tier decides which features the app gets, and every app in the plan shares it. With the CLI, a plan created with --is-linux is a Linux plan. The portal can create a new plan for you.",
      autoCreated: true,
    },
    {
      name: "A globally unique app name",
      why: "The name becomes the default address, https://<app-name>.azurewebsites.net, so it must be unique across all of Azure. Use only letters, numbers and hyphens, with no hyphen at the start or end, and fewer than 64 characters.",
    },
    {
      name: "A publish type, runtime stack and operating system",
      why: "Choose Code (with a runtime stack such as Node 24 LTS) or a container, and pick Linux or Windows. The runtime stack names the language and version the platform runs for you.",
    },
  ],

  example: {
    portal: [
      "In the Azure portal, type app services in the search, then select App Services under Services.",
      "On the App Services page, select Create, then Web App.",
      "On the Basics tab, under Project Details, select the Subscription. For Resource group, select Create new, or pick an existing group.",
      "Under Instance details, enter a globally unique Name, select Code for Publish, then choose Node 24 LTS as the Runtime stack, an Operating System and a Region.",
      "Under Pricing plans, select Create new to make an App Service plan and enter a name such as plan-polaris. Free F1 works for a first test. Pick Standard or higher if you want deployment slots.",
      "Select Review + create, then Create. When the deployment finishes, select Go to resource and browse to https://<app-name>.azurewebsites.net.",
      "To deploy files, open Deployment Center under Deployment and use the FTPS Credentials tab. To add a staging slot, open Deployment, then Deployment slots, and select Add.",
    ],
    cli: `az appservice plan create \\
  --name plan-polaris \\
  --resource-group rg-polaris-demo \\
  --sku P0v3 \\
  --is-linux

APP_NAME="app-polaris-$RANDOM"

az webapp create \\
  --name $APP_NAME \\
  --resource-group rg-polaris-demo \\
  --plan plan-polaris \\
  --runtime "NODE:24-lts"

az webapp update \\
  --name $APP_NAME \\
  --resource-group rg-polaris-demo \\
  --https-only true

az webapp config appsettings set \\
  --name $APP_NAME \\
  --resource-group rg-polaris-demo \\
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=true

az webapp deploy \\
  --name $APP_NAME \\
  --resource-group rg-polaris-demo \\
  --src-path ./app.zip \\
  --type zip

az webapp deployment slot create \\
  --name $APP_NAME \\
  --resource-group rg-polaris-demo \\
  --slot staging

az webapp deployment slot swap \\
  --name $APP_NAME \\
  --resource-group rg-polaris-demo \\
  --slot staging \\
  --target-slot production`,
    powershell: `New-AzAppServicePlan \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "plan-polaris" \`
  -Location "southeastasia" \`
  -Tier "Basic"

$appName = "app-polaris-" + (Get-Random)

# New-AzWebApp has no runtime stack parameter.
# Choose the stack in the portal, the CLI or Bicep.
New-AzWebApp \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name $appName \`
  -Location "southeastasia" \`
  -AppServicePlan "plan-polaris"

Set-AzWebApp \`
  -AssignIdentity $true \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name $appName`,
    bicep: `param location string = resourceGroup().location
param webAppName string = format('app-polaris-{0}', uniqueString(resourceGroup().id))

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-polaris'
  location: location
  kind: 'linux'
  sku: {
    name: 'P0v3'
  }
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2024-04-01' = {
  name: webAppName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'FtpsOnly'
    }
  }
}`,
  },
  examNotes: [
    "Deployment slots need the Standard, Premium or Isolated tier. Free, Shared and Basic have none. Standard allows 5 slots per app, and Premium and Isolated allow 20. Slots cost nothing extra, and each slot is a live app with its own host name. A new slot starts with no content and gets 0% of traffic.",
    "A swap warms up the source slot, then switches the routing rules, so the target slot sees no downtime. Swap with preview pauses after the first phase so you can test the staging slot with the target slot's settings. To roll back, swap the same two slots again. Auto swap can swap into production every time you push to a slot.",
    "App settings and connection strings move with the content in a swap. To pin one to its slot, select Deployment slot setting (Settings > Environment variables), or use --slot-settings in the CLI. Custom domain names, scale settings, managed identities and virtual network integration do not swap.",
    "Scale up and scale out are set on the App Service plan, not on the app, and they affect every app in the plan. Basic, Standard and Premium scale out to 3, 10 and 30 instances. Autoscale needs the Standard tier or higher.",
    "Virtual network integration is outbound only. It needs Basic tier or higher, a VNet in the same region, and a dedicated subnet of /28 or larger. Inbound private access uses a private endpoint, which is a NIC in your subnet. After you add one, disable public network access to remove public exposure. The private endpoint and the integration cannot share a subnet, and IP-based TLS does not work with private endpoints. Each slot gets its own private endpoint.",
    "Custom domains need a paid tier, not Free. A TLS/SSL binding needs Basic, Standard or Premium, and an App Service Managed Certificate also needs Basic or higher. SNI SSL allows many bindings on one IP. IP-based SSL allows one binding and needs Standard or higher. DNS uses an A record for a root domain and a CNAME for a subdomain, plus a TXT record named asuid for domain verification. The domain must be in a public DNS zone.",
    "A system-assigned managed identity is tied to the app and is deleted with it. An app can have only one. A user-assigned identity is a separate resource that several apps can share, and an app can have many. The identity is set per slot.",
    "Backup and restore needs the Basic, Standard, Premium or Isolated tier. Basic can only back up the production slot. Automatic backups are hourly and kept for 30 days with nothing to configure. Custom backups need a storage account that supports SAS, because managed identity access to it is not supported. You manage both from Backups on the left menu.",
    "Always On is off by default, so an idle app is unloaded after 20 minutes without requests and the next request is slow. Always On needs Basic tier or higher.",
    "Deployment options include az webapp deploy with a zip file, FTPS (Deployment Center > FTPS Credentials), Visual Studio Code, and CI/CD with GitHub Actions or Azure Pipelines.",
    "Under Monitoring, App Service logs turns on application logging and Log stream shows it live. On Linux, application logs go to the file system only. Diagnostic settings send logs to a Log Analytics workspace, a storage account or an event hub, and adding one restarts the app. Diagnose and solve problems is the guided troubleshooter.",
  ],

  related: [
    "resource-group",
    "app-service-plan",
    "virtual-network",
    "subnet",
    "private-endpoint",
    "azure-dns-zone",
    "virtual-machine",
    "container-apps",
  ],
  docsUrl: "https://learn.microsoft.com/azure/app-service/overview",

  simulator: [
    { key: "name", label: "Name", type: "text", required: true, default: "app-polaris-demo", help: "Must be unique across all of Azure. It becomes <name>.azurewebsites.net." },
    { key: "region", label: "Region", type: "select", required: true, default: "southeastasia", options: regionIds },
    { key: "runtimeStack", label: "Runtime stack", type: "select", required: true, default: "Node 24 LTS", options: ["Node 24 LTS", ".NET 8 (LTS)"] },
    { key: "appServicePlan", label: "App Service plan", type: "text", required: true, default: "plan-polaris", help: "The plan sets the pricing tier. Deployment slots need Standard or higher." },
  ],
};
