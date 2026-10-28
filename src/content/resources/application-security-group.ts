import type { ResourceInput } from "../schema";

export const applicationSecurityGroup: ResourceInput = {
  slug: "application-security-group",
  name: "Application Security Group",
  type: "Microsoft.Network/applicationSecurityGroups",
  category: "networking",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 1,
  scope: "resource",
  icon: "Users",

  tagline: "A name for a group of VMs, so NSG rules read like roles instead of IP lists.",
  definition:
    "An application security group (ASG) lets you group network interfaces by their role, such as web servers or database servers, and then use that group as the source or destination of an NSG rule. When a VM is added to or removed from the group, the rules follow it automatically, so you never edit IP addresses by hand.",
  analogy:
    "A name tag on a team. Instead of listing every person by address, the rule says \"the web team may talk to the database team\".",
  whenToUse: [
    "Writing NSG rules like \"web servers may reach database servers on 1433\" without listing IP addresses.",
    "Scaling a tier up or down without touching the NSG.",
  ],
  notFor: [
    "Grouping network interfaces from different VNets. All NICs in an ASG must be in the same VNet as the first NIC added.",
    "Anything that is not a rule source or destination. An ASG is not a general-purpose tag.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The ASG is a resource and needs a group.",
    },
    {
      name: "A network security group",
      slug: "network-security-group",
      why: "An ASG does nothing alone. It is referenced by rules inside an NSG.",
    },
    {
      name: "A VM (network interface) to add to the group",
      slug: "virtual-machine",
      why: "Membership is set on the VM's network interface. All members must be in the same virtual network.",
    },
  ],

  example: {
    portal: [
      "Search for Application security groups and select Create.",
      "Select the Resource group, enter a Name such as asg-web, and choose a Region.",
      "Create a second group named asg-db.",
      "Open a VM, expand Networking, select Application security groups, then Add application security groups and pick asg-web.",
      "In your NSG, open Inbound security rules and select + Add.",
      "Set Source to Application security group and select asg-web.",
      "Set Destination to Application security group and select asg-db, Destination port ranges 1433, Protocol TCP, Action Allow.",
    ],
    cli: `az network asg create \\
  --resource-group rg-polaris-demo \\
  --name asg-web \\
  --location southeastasia

az network asg create \\
  --resource-group rg-polaris-demo \\
  --name asg-db \\
  --location southeastasia

az network nic ip-config update \\
  --resource-group rg-polaris-demo \\
  --nic-name nic-web-01 \\
  --name ipconfig1 \\
  --application-security-groups asg-web

az network nsg rule create \\
  --resource-group rg-polaris-demo \\
  --nsg-name nsg-data \\
  --name Allow-SQL-From-Web \\
  --priority 100 \\
  --direction Inbound \\
  --access Allow \\
  --protocol Tcp \\
  --source-asgs asg-web \\
  --destination-asgs asg-db \\
  --destination-port-ranges 1433`,
    powershell: `$asgWeb = New-AzApplicationSecurityGroup \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "asg-web" \`
  -Location "southeastasia"

$asgDb = New-AzApplicationSecurityGroup \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "asg-db" \`
  -Location "southeastasia"

$rule = New-AzNetworkSecurityRuleConfig \`
  -Name "Allow-SQL-From-Web" \`
  -Priority 100 \`
  -Direction Inbound \`
  -Access Allow \`
  -Protocol Tcp \`
  -SourceApplicationSecurityGroup $asgWeb \`
  -SourcePortRange "*" \`
  -DestinationApplicationSecurityGroup $asgDb \`
  -DestinationPortRange 1433`,
    bicep: `resource asgWeb 'Microsoft.Network/applicationSecurityGroups@2023-09-01' = {
  name: 'asg-web'
  location: resourceGroup().location
}

resource asgDb 'Microsoft.Network/applicationSecurityGroups@2023-09-01' = {
  name: 'asg-db'
  location: resourceGroup().location
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: 'nsg-data'
  location: resourceGroup().location
  properties: {
    securityRules: [
      {
        name: 'Allow-SQL-From-Web'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceApplicationSecurityGroups: [
            {
              id: asgWeb.id
            }
          ]
          sourcePortRange: '*'
          destinationApplicationSecurityGroups: [
            {
              id: asgDb.id
            }
          ]
          destinationPortRange: '1433'
        }
      }
    ]
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "An ASG is attached to a network interface, not to a subnet.",
    "All network interfaces in one ASG must be in the same virtual network.",
    "A rule can use an ASG as both source and destination, but the NICs in both ASGs must be in the same VNet.",
    "A NIC can be in more than one ASG, up to the Azure limit.",
    "ASGs let you add a VM to a tier by changing its NIC, with no edits to the NSG.",
  ],
    },
  ],

  related: ["network-security-group", "virtual-machine"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/application-security-groups",
  simulator: {
    armType: "Microsoft.Network/applicationSecurityGroups",
    apiVersion: "2023-09-01",
    nameRule: "application-security-group",
  },
};
