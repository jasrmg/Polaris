import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const containerInstances: ResourceInput = {
  slug: "container-instances",
  name: "Container Instances",
  type: "Microsoft.ContainerInstance/containerGroups",
  category: "compute",
  scope: "resource",
  icon: "Boxes",

  tagline: "Runs a container in Azure in seconds with no VM to manage, billed by the second.",
  definition:
    "Azure Container Instances (ACI) runs Linux or Windows containers in Azure without you managing any virtual machines. The top-level resource is the container group: one or more containers scheduled on the same host that share a lifecycle, local network and storage volumes. A group can get a public IP address and a DNS name label, or it can be deployed into a delegated subnet of your virtual network.",
  analogy:
    "A pop-up stall you rent by the second. You bring your packed container, Azure supplies the CPU and memory, and the meter runs only while the group runs. The containers in one group are like staff sharing one stall: same address, same shelves, same opening hours.",
  whenToUse: [
    "Run-once tasks such as build, test or image rendering. Set the restart policy so the container stops when its process ends, and you pay only while it runs.",
    "Quickly exposing a simple app with a public IP and a name such as customlabel.azureregion.azurecontainer.io.",
    "A main app container plus a supporting container, such as a logging sidecar, in one multi-container group (Linux only).",
    "A container that must talk privately to other resources in a virtual network, including on-premises ones through a VPN gateway or ExpressRoute.",
  ],
  notFor: [
    "Orchestrating many containers. Learn points to Azure Kubernetes Service when you need a full container orchestration platform. AKS virtual nodes can run pods as container groups on ACI.",
    "Autoscaling. Learn says scaling is not available for containers or container groups. To run more instances you create more container groups through the API.",
    "A fixed IP address. The group's IP address can change when it restarts or is recreated. Learn suggests NAT Gateway or Application Gateway if you need a static address.",
    "Arm-based images or GPU workloads. ACI supports only x64 (AMD64) images, and GPU resources are retired as of July 14, 2025.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "Container instances, like all Azure resources, must be deployed into a resource group.",
    },
    {
      name: "A container image",
      why: "From a public registry such as Docker Hub, or from Azure Container Registry. It must be x64 (AMD64) and, for a reliable deploy, no larger than 15 GB. Learn's quickstart uses the Microsoft sample image mcr.microsoft.com/azuredocs/aci-helloworld.",
    },
    {
      name: "A DNS name label (public deployment)",
      why: "Optional name for a public container group. It must be unique within the Azure region, and the app is then reachable at the label, the region and azurecontainer.io.",
    },
    {
      name: "A virtual network (private deployment)",
      slug: "virtual-network",
      why: "Only needed if the group must live in your network. The subnet must be in the same subscription as the container group.",
    },
    {
      name: "A delegated subnet (private deployment)",
      slug: "subnet",
      why: "You must delegate the subnet to Azure Container Instances before you deploy. A delegated subnet can then hold only container groups. Learn recommends at least a /24.",
    },
    {
      name: "A NAT gateway (private deployment)",
      why: "A container group in a virtual network must use a NAT gateway for outbound connectivity. This is the only supported configuration.",
    },
    {
      name: "A storage account with a file share (optional)",
      slug: "storage-account",
      why: "Containers are stateless by default. To keep files after a restart, mount an Azure Files share. This works for Linux containers only.",
    },
  ],

  example: {
    portal: [
      "On the Azure portal home page, select Create a resource, then select Containers, then Container Instances.",
      "On the Basics page, choose the Subscription. For Resource group select Create new and enter a name such as rg-polaris-demo.",
      "For Container name enter a name such as mycontainer. The form also asks for a Region, so pick one.",
      "For Image source select Quickstart images. For Container image choose mcr.microsoft.com/azuredocs/aci-helloworld:latest (Linux).",
      "Leave Availability zones as None unless you need a specific zone. Zones work only in regions that support them. Leave the other values as defaults, then select Next: Networking.",
      "On the Networking page, enter a DNS name label. It must be unique within the region. If you get a DNS name label not available error, try another one.",
      "Set the DNS name label scope reuse to Tenant. Leave all other settings as defaults, then select Review + create.",
      "When validation completes, select Create. When the deployment finishes, open Resource Groups, then your resource group, then the container group.",
      "Note the FQDN and the Status. Once Status is Running, browse to the FQDN. To see logs, under Settings select Containers, then Logs.",
    ],
    cli: `# The DNS name label must be unique within the region
az container create \\
  --resource-group rg-polaris-demo \\
  --name aci-hello \\
  --image mcr.microsoft.com/azuredocs/aci-helloworld \\
  --os-type Linux \\
  --cpu 1 \\
  --memory 1.5 \\
  --ports 80 \\
  --dns-name-label aci-demo-polaris \\
  --restart-policy Always

az container show \\
  --resource-group rg-polaris-demo \\
  --name aci-hello \\
  --query "{FQDN:ipAddress.fqdn,ProvisioningState:provisioningState}" \\
  --output table`,
    powershell: `$port = New-AzContainerInstancePortObject -Port 80 -Protocol TCP

$container = New-AzContainerInstanceObject \`
  -Name "aci-hello" \`
  -Image "mcr.microsoft.com/azuredocs/aci-helloworld" \`
  -RequestCpu 1 \`
  -RequestMemoryInGb 1.5 \`
  -Port @($port)

New-AzContainerGroup \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "aci-hello" \`
  -Location "southeastasia" \`
  -Container $container \`
  -OsType Linux \`
  -RestartPolicy "Always" \`
  -IPAddressType Public \`
  -IPAddressDnsNameLabel "aci-demo-polaris"`,
    bicep: `param location string = resourceGroup().location
param dnsNameLabel string = concat('aci-demo-', uniqueString(resourceGroup().id))

resource containerGroup 'Microsoft.ContainerInstance/containerGroups@2023-05-01' = {
  name: 'aci-hello'
  location: location
  properties: {
    containers: [
      {
        name: 'aci-hello'
        properties: {
          image: 'mcr.microsoft.com/azuredocs/aci-helloworld'
          ports: [
            {
              port: 80
              protocol: 'TCP'
            }
          ]
          resources: {
            requests: {
              cpu: 1
              memoryInGB: any('1.5')
            }
          }
        }
      }
    ]
    osType: 'Linux'
    restartPolicy: 'Always'
    ipAddress: {
      type: 'Public'
      dnsNameLabel: dnsNameLabel
      autoGeneratedDomainNameLabelScope: 'TenantReuse'
      ports: [
        {
          port: 80
          protocol: 'TCP'
        }
      ]
    }
  }
}`,
  },
  examNotes: [
    "The top-level resource is the container group, not the single container. Containers in a group are scheduled on the same host and share a lifecycle, resources, local network and storage volumes. It is similar to a pod in Kubernetes. They reach each other through localhost.",
    "Restart policy has three values. Always is the default and always restarts. OnFailure restarts only on a nonzero exit code. Never does not restart after a successful exit (code 0). A container whose restart policy is Never or OnFailure and has finished shows Terminated. With Never, a nonzero exit code can still be restarted by the platform.",
    "Run-once tasks use OnFailure or Never so the group stops when the process ends, and billing stops with it. The restart policy applies to every container in the group.",
    "A public container group gets a public IP and can have a DNS name label, which is unique within the region and gives the FQDN label.region.azurecontainer.io. A group deployed into a virtual network does not support a public IP or a DNS name label.",
    "To deploy into a virtual network you must delegate a subnet to Azure Container Instances first. The subnet can then hold only container groups, and must be in the same subscription. You must use a NAT gateway for outbound connectivity. Network profiles are retired as of API version 2021-07-01.",
    "CPU and memory are set per container, and the group is allocated the sum of its containers' requests. The minimum for a container group is 1 CPU and 1 GB of memory. A container group has no more than 60 containers, 20 volumes and 5 ports per IP. Standard groups top out at 31 CPU and 240 GB of memory.",
    "Linux and Windows containers use the same API and you choose the OS type at creation. Multiple containers per group and volume mounts (Azure Files, emptyDir, GitRepo, secret) are Linux only. A Windows deployment is a single container.",
    "Azure Files is the volume for persistent state, because containers are stateless by default. The share must be mounted by a Linux container that runs as root, using the storage account name, share name and access key. Managed identity is not supported for the SMB mount.",
    "Billing is per second for the CPU cores and memory you specify. The meter runs from the start of the first image pull (or a restart) until the whole group stops, so a stopped group is not billed.",
    "Pass settings with environment variables. For secrets use secureValue instead of value. A secure variable shows only its name in the portal and az container show, and can be read only from inside the container. A secret volume is another option.",
    "Container group IP addresses can change after a restart, so do not hard-code them. The group IP and FQDN are released when the group is deleted.",
  ],

  related: [
    "resource-group",
    "virtual-network",
    "subnet",
    "storage-account",
    "public-ip-address",
    "virtual-machine",
    "container-apps",
  ],
  docsUrl:
    "https://learn.microsoft.com/azure/container-instances/container-instances-overview",

  simulator: [
    { key: "name", label: "Container name", type: "text", required: true, default: "mycontainer" },
    { key: "region", label: "Region", type: "select", required: true, default: "southeastasia", options: regionIds },
    { key: "imageSource", label: "Image source", type: "select", required: true, default: "Quickstart images", options: ["Quickstart images"] },
    { key: "image", label: "Container image", type: "select", required: true, default: "mcr.microsoft.com/azuredocs/aci-helloworld:latest (Linux)", options: ["mcr.microsoft.com/azuredocs/aci-helloworld:latest (Linux)"] },
    { key: "restartPolicy", label: "Restart policy", type: "select", required: true, default: "Always", options: ["Always", "On failure", "Never"], help: "Always is the default. On failure restarts only after a nonzero exit code." },
    { key: "dnsNameLabel", label: "DNS name label", type: "text", required: false, default: "aci-demo-polaris", help: "Must be unique within the region. The app is reachable at the label, the region and azurecontainer.io." },
    { key: "dnsNameLabelScope", label: "DNS name label scope reuse", type: "select", required: false, default: "Tenant", options: ["Tenant", "Subscription", "Resource Group", "No reuse", "Any reuse"], help: "Any reuse is the least secure option." },
  ],
};
