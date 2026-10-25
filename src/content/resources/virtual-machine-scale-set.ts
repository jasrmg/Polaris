import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const virtualMachineScaleSet: ResourceInput = {
  slug: "virtual-machine-scale-set",
  name: "Virtual Machine Scale Set",
  type: "Microsoft.Compute/virtualMachineScaleSets",
  category: "compute",
  scope: "resource",
  icon: "Layers",

  tagline: "A group of identical VMs that Azure adds or removes automatically as demand changes.",
  definition:
    "A Virtual Machine Scale Set (VMSS) lets you create and manage a group of load balanced VM instances. All instances are built from the same base image and configuration, so you can manage many VMs without extra work. The number of instances can grow or shrink on demand or on a schedule. You choose an orchestration mode when you create it, and you cannot change it later. Flexible is the mode Learn recommends for new scale sets.",
  analogy:
    "A shop that hires identical staff. When the queue grows the manager brings in more staff, and when it is quiet the manager sends some home. The load balancer is the person at the door who points each customer to a free till.",
  whenToUse: [
    "A web or app tier that needs several identical VMs behind a load balancer.",
    "A workload whose demand changes through the day or week, so you want instances to be added and removed for you.",
    "Spreading instances across availability zones or fault domains so one failure does not take everything down.",
    "Using Flexible orchestration to mix VM sizes or to mix Spot and on-demand instances in one group.",
  ],
  notFor: [
    "One server with a unique role. A single Virtual Machine is simpler.",
    "Protection from a datacenter failure on its own. Learn says a scale set alone cannot do this, so spread the instances across availability zones.",
    "Making each VM bigger when load rises. Autoscale only scales in and out (adds or removes instances) and does not scale up or down.",
    "A simple web app where you do not want to manage the OS. App Service is the managed option.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The scale set and the resources it uses need a group to live in. The portal lets you create one on the Basics tab.",
    },
    {
      name: "A virtual network and subnet",
      slug: "virtual-network",
      why: "Every instance gets a network interface in a subnet. If you leave them out, the Azure CLI and Azure PowerShell can create a new virtual network and subnet for you.",
    },
    {
      name: "A subnet with enough addresses",
      slug: "subnet",
      why: "Each instance takes a private IP address from the subnet, so the subnet must be large enough for the maximum instance count.",
    },
    {
      name: "A load balancer (optional)",
      slug: "load-balancer",
      why: "Learn describes a scale set as a group of load balanced VMs. In the portal you pick or create one on the Networking tab. Application Gateway is the layer 7 option.",
    },
    {
      name: "Explicit outbound access (Flexible)",
      why: "Learn says Flexible scale sets do not get default outbound access. Use a NAT gateway on the subnet (recommended), a Standard load balancer backend pool, or a public IP on each instance.",
    },
    {
      name: "A network security group",
      slug: "network-security-group",
      why: "Filters the traffic that can reach the instances. Attach it to the subnet or in the scale set's network configuration.",
    },
    {
      name: "An image and a size",
      why: "The OS image every instance starts from, and a size available in your region, such as Standard_D2s_v5. Check that the size is not retired.",
    },
    {
      name: "An admin credential",
      why: "A username plus a password or, on Linux, an SSH public key. In the portal a password must be at least 12 characters and meet three of the four complexity rules.",
    },
  ],

  example: {
    portal: [
      "Search for Virtual Machine Scale Sets, then select Create.",
      "On the Basics tab, under Project details, choose the Subscription and create a new Resource group, for example myVMSSResourceGroup.",
      "Under Scale set details, enter a name such as myScaleSet and choose a Region close to you.",
      "Under Orchestration, select Flexible Orchestration Mode. You cannot change this after creation.",
      "Under Security type, select Trusted launch virtual machines.",
      "Under Scaling, keep Scaling mode as Manual, then set the initial Instance count (you can set up to 1000).",
      "Under Instance details, choose a marketplace Image.",
      "Under Administrator account, set a username and a password or an SSH public key.",
      "Leave the Spot and Disks tabs at their defaults and select Next: Networking.",
      "Under Load balancing, select Azure load balancer. In Select a load balancer, choose an existing one or create a new one.",
      "Select Review + create, then Create.",
      "To autoscale later, open the scale set, select Scaling under Settings, choose Custom autoscale, then Add a rule for scale out and scale in. Set the instance limits and select Save.",
    ],
    cli: `az vmss create \\
  --resource-group rg-polaris-demo \\
  --name vmss-web \\
  --image Ubuntu2204 \\
  --vm-sku Standard_D2s_v5 \\
  --orchestration-mode Flexible \\
  --instance-count 2 \\
  --admin-username azureuser \\
  --generate-ssh-keys

az monitor autoscale create \\
  --resource-group rg-polaris-demo \\
  --resource vmss-web \\
  --resource-type Microsoft.Compute/virtualMachineScaleSets \\
  --name autoscale-web \\
  --min-count 2 \\
  --max-count 10 \\
  --count 2

az monitor autoscale rule create \\
  --resource-group rg-polaris-demo \\
  --autoscale-name autoscale-web \\
  --condition "Percentage CPU > 70 avg 5m" \\
  --scale out 3

az monitor autoscale rule create \\
  --resource-group rg-polaris-demo \\
  --autoscale-name autoscale-web \\
  --condition "Percentage CPU < 30 avg 5m" \\
  --scale in 1`,
    powershell: `$cred = Get-Credential -UserName "azureuser"

New-AzVmss \`
  -ResourceGroupName "rg-polaris-demo" \`
  -VMScaleSetName "vmss-web" \`
  -Location "southeastasia" \`
  -OrchestrationMode "Flexible" \`
  -InstanceCount 2 \`
  -VmSize "Standard_D2s_v5" \`
  -ImageName "Ubuntu2204" \`
  -SecurityType "Standard" \`
  -Credential $cred`,
    bicep: `param location string = resourceGroup().location
param adminUsername string = 'azureuser'
@secure()
param adminPassword string

var vmssName = 'vmss-web'

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: 'vnet-polaris'
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.0.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'snet-web'
        properties: {
          addressPrefix: '10.0.1.0/24'
        }
      }
    ]
  }
}

resource pip 'Microsoft.Network/publicIPAddresses@2023-09-01' = {
  name: 'pip-lb-vmss'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource lb 'Microsoft.Network/loadBalancers@2023-09-01' = {
  name: 'lb-vmss-web'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Regional'
  }
  properties: {
    frontendIPConfigurations: [
      {
        name: 'fe'
        properties: {
          publicIPAddress: {
            id: pip.id
          }
        }
      }
    ]
    backendAddressPools: [
      {
        name: 'be'
      }
    ]
    probes: [
      {
        name: 'probe-http'
        properties: {
          protocol: 'Tcp'
          port: 80
          intervalInSeconds: 5
          numberOfProbes: 2
        }
      }
    ]
    loadBalancingRules: [
      {
        name: 'rule-http'
        properties: {
          protocol: 'Tcp'
          frontendPort: 80
          backendPort: 80
          frontendIPConfiguration: {
            id: resourceId('Microsoft.Network/loadBalancers/frontendIPConfigurations', 'lb-vmss-web', 'fe')
          }
          backendAddressPool: {
            id: resourceId('Microsoft.Network/loadBalancers/backendAddressPools', 'lb-vmss-web', 'be')
          }
          probe: {
            id: resourceId('Microsoft.Network/loadBalancers/probes', 'lb-vmss-web', 'probe-http')
          }
        }
      }
    ]
  }
}

resource vmss 'Microsoft.Compute/virtualMachineScaleSets@2024-03-01' = {
  name: vmssName
  location: location
  sku: {
    name: 'Standard_D2s_v5'
    capacity: 2
  }
  properties: {
    orchestrationMode: 'Flexible'
    platformFaultDomainCount: 1
    virtualMachineProfile: {
      osProfile: {
        computerNamePrefix: 'vmss'
        adminUsername: adminUsername
        adminPassword: adminPassword
      }
      storageProfile: {
        imageReference: {
          publisher: 'Canonical'
          offer: '0001-com-ubuntu-server-jammy'
          sku: '22_04-lts-gen2'
          version: 'latest'
        }
        osDisk: {
          createOption: 'FromImage'
          managedDisk: {
            storageAccountType: 'StandardSSD_LRS'
          }
        }
      }
      networkProfile: {
        networkApiVersion: '2020-11-01'
        networkInterfaceConfigurations: [
          {
            name: 'nic-vmss'
            properties: {
              primary: true
              ipConfigurations: [
                {
                  name: 'ipconfig1'
                  properties: {
                    subnet: {
                      id: vnet.properties.subnets[0].id
                    }
                    loadBalancerBackendAddressPools: [
                      {
                        id: lb.properties.backendAddressPools[0].id
                      }
                    ]
                  }
                }
              ]
            }
          }
        ]
      }
    }
  }
}

resource autoscale 'Microsoft.Insights/autoscalesettings@2022-10-01' = {
  name: 'autoscale-web'
  location: location
  properties: {
    enabled: true
    targetResourceUri: vmss.id
    profiles: [
      {
        name: 'default'
        capacity: {
          minimum: '2'
          maximum: '10'
          default: '2'
        }
        rules: [
          {
            metricTrigger: {
              metricName: 'Percentage CPU'
              metricResourceUri: vmss.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'GreaterThan'
              threshold: 70
            }
            scaleAction: {
              direction: 'Increase'
              type: 'ChangeCount'
              value: '3'
              cooldown: 'PT5M'
            }
          }
          {
            metricTrigger: {
              metricName: 'Percentage CPU'
              metricResourceUri: vmss.id
              timeGrain: 'PT1M'
              statistic: 'Average'
              timeWindow: 'PT5M'
              timeAggregation: 'Average'
              operator: 'LessThan'
              threshold: 30
            }
            scaleAction: {
              direction: 'Decrease'
              type: 'ChangeCount'
              value: '1'
              cooldown: 'PT5M'
            }
          }
        ]
      }
    ]
  }
}`,
  },
  examNotes: [
    "The orchestration mode is chosen when the scale set is created and cannot be changed or updated later. Learn recommends Flexible for new scale sets, and az vmss create defaults to Flexible. The portal, CLI and PowerShell quickstarts are labeled Uniform with a note recommending Flexible. Learn does not announce a Uniform retirement, and there is no tool to convert a Uniform scale set to Flexible.",
    "Flexible instances are standard VMs (Microsoft.Compute/virtualMachines) that you manage with the normal VM commands. Uniform instances are scale set VMs (Microsoft.Compute/virtualMachineScaleSets/virtualMachines) managed through the scale set VM API. Flexible also lets you add or remove an existing VM, and Uniform does not.",
    "Instance limits: a Flexible scale set holds up to 1,000 VMs. That falls to 200 for VM sizes without memory preserving updates when you use fixed fault domain spreading (more than one fault domain). With the portal quickstart you can set the initial count up to 1000. Learn also says the limit is 600 if you build from a managed image.",
    "Placement groups apply only to Uniform. A single placement group holds 0 to 100 VMs, and multiple placement groups allow 0 to 1,000. If you use max spreading you must use multiple placement groups.",
    "Fault domain spreading is set with platformFaultDomainCount. Max spreading (1) lets Azure spread VMs across as many fault domains as possible. Fixed spreading uses the number you set, and the request fails if it cannot be met. Learn recommends max spreading for most workloads. Flexible has no update domains, so maintenance runs one fault domain at a time.",
    "Availability zones: set zones to one zone for a zonal scale set, or several for a zone-spanning one. Spreading across zones meets the 99.99% SLA. Flexible instances spread across fault domains meet 99.95%. Without zones you get a regional (nonzonal) scale set with no guaranteed zone spread.",
    "Autoscale is an Azure Monitor feature. You can scale manually (sku.capacity, or az vmss scale --new-capacity), on a schedule, on metric rules, or with predictive autoscale. Autoscale is horizontal only. It adds and removes instances and never changes the VM size.",
    "An autoscale profile (shown as a scale condition in the portal) sets a minimum, maximum and default instance count, plus rules and an optional schedule. A setting can have up to 20 profiles, and a profile up to 10 rules. If you set the minimum equal to the maximum, no scale action can happen.",
    "With several rules, autoscale scales out when any rule is met (OR) and scales in only when all rules are met (AND). Use a scale-in rule that mirrors each scale-out rule on the same metric to avoid flapping. The default cool-down is five minutes.",
    "Host-based metrics need no extra agent, for example Percentage CPU, Network In and Out and disk read and write. For more detailed in-guest metrics you use the Azure diagnostics extension or Application Insights. Scale actions include Increase or Decrease count by, percent by and count to.",
    "Scale-in policy decides which instances go first: Default, NewestVM or OldestVM. Default balances across zones, then across fault domains, then removes the highest instance ID. A policy is set in the scale set model (Scaling, then Scale-in policy in the portal). An instance protected from scale-in is skipped.",
    "Upgrade policy modes are Automatic, Manual and Rolling. Automatic can take all VMs down at once and suits dev and test. Manual leaves existing VMs until you update them. Rolling updates in batches and suits production. On Flexible, Rolling also requires the Application Health Extension.",
    "Networking: a scale set works with a Standard load balancer for layer 4 or Application Gateway for layer 7 and TLS termination. Flexible does not support the Basic load balancer or NAT pools (use NAT rules). Flexible does not get default outbound access, so give it explicit outbound access such as a NAT gateway.",
    "Flexible scale sets monitor application health with the Application Health Extension, not a load balancer health probe. Flexible supports user assigned managed identity only. Uniform allows system assigned or user assigned.",
  ],

  related: [
    "resource-group",
    "virtual-machine",
    "virtual-network",
    "subnet",
    "load-balancer",
    "network-security-group",
    "public-ip-address",
    "app-service-plan",
  ],
  docsUrl: "https://learn.microsoft.com/azure/virtual-machine-scale-sets/overview",

  simulator: [
    { key: "name", label: "Scale set name", type: "text", required: true, default: "vmss-web" },
    { key: "region", label: "Region", type: "select", required: true, default: "southeastasia", options: regionIds },
    { key: "orchestrationMode", label: "Orchestration mode", type: "select", required: true, default: "Flexible", options: ["Flexible", "Uniform"], help: "Cannot be changed after creation. Flexible is the recommended mode." },
    { key: "image", label: "Image", type: "select", required: true, default: "Ubuntu 22.04 LTS", options: ["Ubuntu 22.04 LTS", "Windows Server 2022"] },
    { key: "size", label: "Size", type: "select", required: true, default: "Standard_D2s_v5", options: ["Standard_D2s_v5", "Standard_D4s_v5"] },
    { key: "instanceCount", label: "Instance count", type: "number", required: true, default: 2, help: "The initial number of instances." },
  ],
};
