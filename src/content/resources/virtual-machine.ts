import { regionIds } from "../regions";
import type { ResourceInput } from "../schema";

export const virtualMachine: ResourceInput = {
  slug: "virtual-machine",
  name: "Virtual Machine",
  type: "Microsoft.Compute/virtualMachines",
  category: "compute",
  scope: "resource",
  icon: "Server",

  tagline: "A computer you rent by the second, running Windows or Linux.",
  definition:
    "An Azure Virtual Machine (VM) is an on-demand server running in Microsoft's datacenters. You pick the operating system image and a size (CPU and memory), and Azure runs it for you. You are responsible for the guest OS: patching, software and configuration. A VM never stands alone: it needs a network interface, an OS disk and a virtual network.",
  analogy:
    "Renting a computer in someone else's data center. You choose its specs and install what you like, and you pay while it is switched on.",
  whenToUse: [
    "Lift-and-shift of an existing app that needs full control of the operating system.",
    "Running software that is not available as a managed service.",
    "Dev and test machines you can stop (deallocate) when you are not using them.",
  ],
  notFor: [
    "Simple web apps. App Service removes the OS patching work.",
    "Short-lived containers. Container Instances or Container Apps are cheaper and faster to start.",
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
      why: "The OS image (for example Ubuntu 22.04) and a size available in your chosen region, such as Standard_B2s.",
    },
    {
      name: "An admin credential",
      why: "An SSH public key for Linux or a strong password for Windows.",
    },
  ],

  example: {
    portal: [
      "Search for Virtual machines and select Create, then Azure virtual machine.",
      "Select the Subscription and Resource group.",
      "Enter a Virtual machine name, for example vm-web-01, and choose a Region.",
      "Pick an Image (Ubuntu Server 22.04 LTS) and a Size (Standard_B2s).",
      "Set the Administrator account to SSH public key and enter a username.",
      "Under Inbound port rules allow SSH (22) only if you need it.",
      "On Networking confirm the virtual network, subnet and public IP.",
      "Select Review + create, then Create.",
    ],
    cli: `az vm create \\
  --resource-group rg-polaris-demo \\
  --name vm-web-01 \\
  --image Ubuntu2204 \\
  --size Standard_B2s \\
  --admin-username azureuser \\
  --generate-ssh-keys`,
    powershell: `$cred = Get-Credential -UserName "azureuser"

New-AzVM \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "vm-web-01" \`
  -Location "southeastasia" \`
  -Image "Ubuntu2204" \`
  -Size "Standard_B2s" \`
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
    hardwareProfile: { vmSize: 'Standard_B2s' }
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
    "Stopping a VM from inside the OS keeps billing for compute. Only Stopped (deallocated) from the portal or CLI stops the compute charge.",
    "The availability zone or availability set of a VM is chosen at creation. You cannot change it in place; moving means recreating the VM (or using a move tool that does so for you).",
    "Resizing may require the VM to restart, and the target size must be available on the VM's current hardware cluster.",
    "To get ARM from an existing VM, use Export template on the resource group, then az bicep decompile to convert it to Bicep.",
  ],

  related: ["resource-group", "storage-account"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-machines/windows/quick-create-portal",

  simulator: [
    { key: "name", label: "Virtual machine name", type: "text", required: true, default: "vm-web-01" },
    { key: "region", label: "Region", type: "select", required: true, default: "southeastasia", options: regionIds },
    { key: "image", label: "Image", type: "select", required: true, default: "Ubuntu 22.04 LTS", options: ["Ubuntu 22.04 LTS", "Windows Server 2022"] },
    { key: "size", label: "Size", type: "select", required: true, default: "Standard_B2s", options: ["Standard_B1s", "Standard_B2s", "Standard_D2s_v5"] },
  ],
};
