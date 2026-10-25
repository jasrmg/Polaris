import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const containerApps: ResourceInput = {
  slug: "container-apps",
  name: "Container Apps",
  type: "Microsoft.App/containerApps",
  category: "compute",
  scope: "resource",
  icon: "Container",

  tagline: "Run containers on a serverless platform. Azure runs the servers, and apps can scale to zero.",
  definition:
    "Azure Container Apps is a serverless platform for running containerized applications without managing the underlying infrastructure. You bring a container image, and Azure runs it on a platform powered by Kubernetes and open-source technologies such as Dapr, KEDA and Envoy. You do not get direct access to the Kubernetes APIs. Every container app lives in a Container Apps environment, which is the shared boundary for networking and logging. Apps scale automatically on HTTP traffic, events, CPU or memory load, and most can scale to zero.",
  analogy:
    "A managed apartment building for your containers. The environment is the building, with shared plumbing (the virtual network) and one shared logbook (the Log Analytics workspace). Each container app is a flat. The building manager handles upgrades and capacity, and you only decide how many flats are occupied and who may walk in from the street.",
  whenToUse: [
    "Hosting API endpoints or microservices that you have already packaged as containers.",
    "Event-driven processing or background jobs that should scale with a queue or other event source, including scale to zero.",
    "Splitting traffic between versions of an app for blue-green deployments or A/B testing.",
    "Running containers without learning Kubernetes, when you do not need direct access to its APIs.",
  ],
  notFor: [
    "Needing direct access to the Kubernetes APIs and control plane. That is Azure Kubernetes Service.",
    "Hosting a plain web app or website. Learn calls App Service the ideal option for web apps.",
    "A low-level building block with no scale, revisions or environments. Container Instances is the less opinionated option.",
    "Function-style code that runs on events. Learn names Azure Functions as the ideal option for that.",
  ],

  prerequisites: [
    {
      name: "The Microsoft.App resource provider",
      why: "Must be registered in your subscription. The CLI and PowerShell quickstarts also register the Microsoft.OperationalInsights provider.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The environment and the container app both need a group to live in.",
    },
    {
      name: "A Container Apps environment",
      why: "A secure boundary around one or more container apps. Apps in the same environment share the same virtual network and write logs to the same logging destination. The portal flow creates one for you if you keep the default.",
      autoCreated: true,
    },
    {
      name: "A Log Analytics workspace",
      why: "By default, apps in an environment send logs to a common Log Analytics workspace. The CLI creates one when you do not pass one. With PowerShell you create the workspace first and pass its ID and key.",
    },
    {
      name: "A container image",
      why: "From any public or private registry, such as Azure Container Registry. The quickstarts use the Microsoft sample image mcr.microsoft.com/k8se/quickstart:latest.",
    },
    {
      name: "A target port (only for ingress)",
      why: "The port your container listens on. It is required when you enable ingress.",
    },
  ],

  example: {
    portal: [
      "Make sure the Microsoft.App resource provider is registered in your subscription.",
      "In the top search bar, search for Container Apps, select it, then select Create, then Container App.",
      "On the Basics tab, select your Subscription. For Resource group, select Create new and enter my-container-apps.",
      "Enter a Container app name, for example my-container-app. Leave Optimize for Azure Functions unselected and set Deployment source to Container image.",
      "Under Container Apps environment, select a Region near you and leave Container Apps environment on the default value to create a new one.",
      "Select Next: Container, then Use quickstart image.",
      "Select Review + create, then Create. Wait for Your deployment is complete, then select Go to resource.",
      "Next to Application Url, select the link to open the app.",
      "To set the replica range, open the app, select Scale, then Edit and deploy, and use the Scale tab. Add a rule with Add, set Type to HTTP Scaling and enter the Concurrent requests value.",
      "To change who can reach the app, select Ingress under Settings. Choose Limited to Container Apps Environment for internal, or Accepting traffic from anywhere for external, and enter the Target port.",
    ],
    cli: `az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights

az containerapp env create \\
  --name cae-polaris \\
  --resource-group rg-polaris-demo \\
  --location southeastasia

az containerapp create \\
  --name ca-web \\
  --resource-group rg-polaris-demo \\
  --environment cae-polaris \\
  --image mcr.microsoft.com/k8se/quickstart:latest \\
  --ingress external \\
  --target-port 80 \\
  --min-replicas 0 \\
  --max-replicas 5 \\
  --scale-rule-name http-rule \\
  --scale-rule-http-concurrency 50 \\
  --query properties.configuration.ingress.fqdn`,
    powershell: `Install-Module -Name Az.App
Register-AzResourceProvider -ProviderNamespace Microsoft.App
Register-AzResourceProvider -ProviderNamespace Microsoft.OperationalInsights

$ResourceGroupName = "rg-polaris-demo"
$Location = "southeastasia"

# The environment needs a Log Analytics workspace, so create one first
$WorkspaceArgs = @{
  Name = "law-polaris"
  ResourceGroupName = $ResourceGroupName
  Location = $Location
  PublicNetworkAccessForIngestion = "Enabled"
  PublicNetworkAccessForQuery = "Enabled"
}
New-AzOperationalInsightsWorkspace @WorkspaceArgs
$WorkspaceId = (Get-AzOperationalInsightsWorkspace -ResourceGroupName $ResourceGroupName -Name $WorkspaceArgs.Name).CustomerId
$WorkspaceSharedKey = (Get-AzOperationalInsightsWorkspaceSharedKey -ResourceGroupName $ResourceGroupName -Name $WorkspaceArgs.Name).PrimarySharedKey

$EnvArgs = @{
  EnvName = "cae-polaris"
  ResourceGroupName = $ResourceGroupName
  Location = $Location
  AppLogConfigurationDestination = "log-analytics"
  LogAnalyticConfigurationCustomerId = $WorkspaceId
  LogAnalyticConfigurationSharedKey = $WorkspaceSharedKey
}
New-AzContainerAppManagedEnv @EnvArgs

# Create the app in that environment (the Learn flow does not enable ingress)
$EnvId = (Get-AzContainerAppManagedEnv -ResourceGroupName $ResourceGroupName -EnvName "cae-polaris").Id
$TemplateObj = New-AzContainerAppTemplateObject -Name "ca-web" -Image "mcr.microsoft.com/k8se/quickstart:latest"

$ContainerAppArgs = @{
  Name = "ca-web"
  Location = $Location
  ResourceGroupName = $ResourceGroupName
  ManagedEnvironmentId = $EnvId
  TemplateContainer = $TemplateObj
}
New-AzContainerApp @ContainerAppArgs`,
    bicep: `param location string = resourceGroup().location

resource workspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'law-polaris'
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource containerEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-polaris'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-web'
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
      }
    }
    template: {
      containers: [
        {
          name: 'web'
          image: 'mcr.microsoft.com/k8se/quickstart:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 5
        rules: [
          {
            name: 'http-rule'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}`,
  },
  examNotes: [
    "The environment is the shared boundary. Apps in one environment share the same virtual network and write logs to the same Log Analytics workspace. Use separate environments when apps must never share compute, or for isolation such as test versus production.",
    "Ingress visibility is per app. External lets the app be reached from outside its environment, and Internal limits it to other apps in the same environment. Whether external really means the internet depends on the environment: an internal environment has no public endpoint. You set that with --internal-only when you create the environment, and you cannot change it later.",
    "HTTP ingress is always exposed on port 443, and HTTP on port 80 redirects to HTTPS unless you allow insecure connections. You must set the target port to the port your container listens on. You do not need to create a load balancer or public IP. External TCP ingress needs an environment that uses a virtual network.",
    "Scale limits are set per revision. Minimum replicas default to 0 and maximum replicas default to 10. Rule types are HTTP, TCP and custom (KEDA scalers such as Service Bus, Event Hubs, Kafka and Redis, plus CPU and memory). With several rules, the app scales when the first condition of any rule is met.",
    "Scale to zero means no usage charges. A rule based on CPU or memory cannot scale to zero. If ingress is off and you set neither minimum replicas nor a custom scale rule, the app scales to zero and cannot start again.",
    "Revision mode is Single by default: a new revision takes over once it is ready, and old ones are deprovisioned. Multiple mode keeps several revisions active so you can split traffic. Traffic weights must add up to 100, and you can use a revision name or a label.",
    "Changes under properties.template, such as the image or scale rules, create a new revision. Changes under properties.configuration, such as secrets, ingress, traffic splitting and revision mode, apply to all revisions and do not create one. After you change a secret, restart the active revisions.",
    "Secrets are scoped to the app, not to a revision. A secret can hold a value or point to Azure Key Vault. A Key Vault reference needs a managed identity on the app that holds the Key Vault Secrets User role. A system-assigned identity is deleted with the app. A user-assigned identity is a separate resource that can be shared.",
    "Workload profiles is the default environment type and supports both the Consumption and Dedicated plans. Consumption only is the legacy type. Workload profiles needs a subnet of at least /27 and supports user-defined routes and NAT Gateway. Consumption only needs at least /23 and does not support them.",
    "Consumption billing is per second for vCPU and memory, plus HTTP requests. Each month per subscription the first 180,000 vCPU-seconds, 360,000 GiB-seconds and 2 million requests are free. A Dedicated workload profile adds a plan management fee and bills per instance.",
    "Choosing a container service: Container Apps for serverless microservices and event-driven apps, Container Instances for a single pod without scale or revisions, App Service for web apps and Azure Kubernetes Service when you need the Kubernetes API.",
    "To use the CLI, install the containerapp extension. The CLI quickstarts register the Microsoft.App and Microsoft.OperationalInsights providers. az containerapp up builds from source, creates a registry and an environment with a Log Analytics workspace, and deploys the app.",
  ],

  related: ["resource-group", "container-instances", "app-service", "virtual-network", "subnet"],
  docsUrl: "https://learn.microsoft.com/azure/container-apps/overview",

  simulator: [
    { key: "name", label: "Container app name", type: "text", required: true, default: "ca-web" },
    { key: "region", label: "Region", type: "select", required: true, default: "southeastasia", options: regionIds },
    { key: "environment", label: "Container Apps environment", type: "text", required: true, default: "cae-polaris", help: "A new environment is created if it does not exist. Apps in one environment share a virtual network and a logging destination." },
    { key: "image", label: "Container image", type: "text", required: true, default: "mcr.microsoft.com/k8se/quickstart:latest" },
    { key: "ingress", label: "Ingress traffic", type: "select", required: true, default: "Accepting traffic from anywhere", options: ["Disabled", "Limited to Container Apps Environment", "Accepting traffic from anywhere"] },
    { key: "targetPort", label: "Target port", type: "number", required: false, default: 80, help: "Required when ingress is enabled. The port your container listens on." },
    { key: "minReplicas", label: "Minimum replicas", type: "number", required: true, default: 0, help: "0 allows the app to scale to zero." },
    { key: "maxReplicas", label: "Maximum replicas", type: "number", required: true, default: 10 },
  ],
};
