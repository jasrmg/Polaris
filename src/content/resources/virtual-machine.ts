import type { ResourceInput } from "../schema";

export const virtualMachine: ResourceInput = {
  slug: "virtual-machine",
  name: "Virtual Machine",
  type: "Microsoft.Compute/virtualMachines",
  category: "compute",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 2,
  scope: "resource",
  icon: "Server",

  tagline: "A computer you rent from Azure, billed by the minute while allocated.",
  definition:
    "An Azure Virtual Machine (VM) is an on-demand server running in Microsoft's datacenters. You pick the operating system image and a size (CPU and memory), and Azure runs it for you. You are responsible for the guest OS: patching, software and configuration. A VM never stands alone: it needs a network interface, an OS disk and a virtual network.",
  analogy:
    "Renting a computer in someone else's data center. You choose its specs and install what you like, and you pay for compute while it is allocated. A VM that is only stopped is still billed.",
  whenToUse: [
    "Lift-and-shift of an existing app that needs full control of the operating system.",
    "Running software that is not available as a managed service.",
    "Dev and test machines you can stop (deallocate) when you are not using them.",
  ],
  notFor: [
    "Simple web apps. App Service removes the OS patching work.",
    "Short-lived containers. Container Instances starts containers in seconds with no VM to manage.",
  ],

  prerequisites: [
    {
      name: "An Azure subscription with enough vCPU quota",
      why: "Each region and VM family has a vCPU quota. A deployment fails if it would exceed it.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The VM and its disk, network interface and IP all need a group to live in.",
    },
    {
      name: "A virtual network and subnet",
      slug: "virtual-network",
      why: "The VM's network interface is attached to a subnet. The portal can create one for you.",
      autoCreated: true,
    },
    {
      name: "A network interface (NIC)",
      why: "How the VM connects to the subnet. It holds the private IP address.",
      autoCreated: true,
    },
    {
      name: "An OS disk",
      why: "A managed disk created from the image you pick.",
      autoCreated: true,
    },
    {
      name: "An image and a size",
      why: "The OS image (for example Ubuntu 22.04) and a size available in your chosen region, such as Standard_D2s_v5. Check that the size is not retired.",
    },
    {
      name: "An admin credential",
      why: "Linux uses an SSH public key by default, and a password also works. Windows needs a password of at least 12 characters.",
    },
  ],

  example: {
    portal: [
      "Search for Virtual machines, select Create, then Virtual machine.",
      "Select the Subscription and Resource group.",
      "Enter a Virtual machine name, for example vm-web-01, and choose a Region.",
      "Pick an Image (Ubuntu Server 22.04 LTS - Gen2) and a Size (Standard_D2s_v5).",
      "Under Administrator account, set Authentication type to SSH public key and enter a username.",
      "Choose Generate new key pair and enter a Key pair name. You download the private key when you select Create.",
      "Under Inbound port rules allow SSH (22) only if you need it.",
      "Leave the other defaults, then select Review + create, then Create.",
    ],
    cli: `az vm create \\
  --resource-group rg-polaris-demo \\
  --name vm-web-01 \\
  --image Ubuntu2204 \\
  --size Standard_D2s_v5 \\
  --admin-username azureuser \\
  --generate-ssh-keys`,
    powershell: `$cred = Get-Credential -UserName "azureuser"

New-AzVM \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "vm-web-01" \`
  -Location "southeastasia" \`
  -Image "Ubuntu2204" \`
  -Size "Standard_D2s_v5" \`
  -Credential $cred`,
    bicep: `param location string = resourceGroup().location
@secure()
param adminPassword string

var vnetName = 'vnet-polaris'
var subnetName = 'snet-web'
var nicName = 'nic-web-01'

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: { addressPrefixes: [ '10.0.0.0/16' ] }
    subnets: [
      {
        name: subnetName
        properties: { addressPrefix: '10.0.1.0/24' }
      }
    ]
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2023-09-01' = {
  name: nicName
  location: location
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: { id: vnet.properties.subnets[0].id }
        }
      }
    ]
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2024-03-01' = {
  name: 'vm-web-01'
  location: location
  properties: {
    hardwareProfile: { vmSize: 'Standard_D2s_v5' }
    osProfile: {
      computerName: 'vm-web-01'
      adminUsername: 'azureuser'
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
        managedDisk: { storageAccountType: 'StandardSSD_LRS' }
      }
    }
    networkProfile: {
      networkInterfaces: [ { id: nic.id } ]
    }
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "Shutting down from inside the OS, or running az vm stop, leaves the VM Stopped (allocated) and compute is still billed. Use az vm deallocate, or Stop in the portal, to reach Stopped (deallocated) and stop the compute charge. Disks and public IPs are still billed.",
    "You set the availability zone or availability set when you create the VM. A zonal VM cannot be moved to another zone, and an availability set can only be set at creation. You must redeploy the VM to change either.",
    "Resizing a running VM always restarts it. If the new size is not available on the current hardware cluster, you must deallocate the VM first.",
    "To get ARM from an existing VM, use Export template on the resource group, then az bicep decompile to convert it to Bicep.",
  ],
    },
  ],

  related: [
    "resource-group",
    "storage-account",
    "virtual-network",
    "network-security-group",
    "public-ip-address",
    "virtual-machine-scale-set",
    "container-instances",
    "recovery-services-vault",
    "network-watcher",
  ],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-machines/linux/quick-create-portal",

  simulator: {
    armType: "Microsoft.Compute/virtualMachines",
    apiVersion: "2024-03-01",
    nameRule: "virtual-machine",
    provisioning: ["Creating", "Updating", "Failed", "Succeeded", "Deleting"],
    provisioningSource: "https://learn.microsoft.com/en-us/azure/virtual-machines/states-billing",
  },
};
