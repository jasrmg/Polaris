import type { ResourceInput } from "../schema";

export const networkSecurityGroup: ResourceInput = {
  slug: "network-security-group",
  name: "Network Security Group",
  type: "Microsoft.Network/networkSecurityGroups",
  category: "networking",
  scope: "resource",
  icon: "ShieldCheck",

  tagline: "A list of allow and deny rules for traffic in and out of a subnet or NIC.",
  definition:
    "A network security group (NSG) is a stateful firewall rule list. Each rule matches traffic by source, destination, port and protocol and either allows or denies it. Rules are checked in priority order, lowest number first, and the first match wins. You attach an NSG to a subnet, a network interface, or both.",
  analogy:
    "A bouncer with a clipboard. The rules are checked from the top of the list, and the first rule that matches the visitor decides whether they get in.",
  whenToUse: [
    "Allowing only the ports you need, for example HTTPS to a web subnet.",
    "Blocking traffic between tiers, such as keeping the data subnet closed to the internet.",
    "Making a Standard public IP usable, since it blocks inbound traffic until a rule allows it.",
  ],
  notFor: [
    "Deep inspection such as full-path URL filtering or intrusion detection. NSGs work on IPs, ports and protocols only; use Azure Firewall Premium or an NVA.",
  ],

  prerequisites: [
    {
      name: "An Azure subscription",
      why: "NSGs are created inside a subscription.",
    },
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The NSG is a resource and needs a group.",
    },
    {
      name: "A region",
      why: "An NSG must be in the same subscription and region as the virtual network of any subnet you associate it with.",
    },
    {
      name: "A subnet or NIC to attach it to",
      slug: "subnet",
      why: "An NSG that is not associated with anything filters nothing.",
    },
  ],

  example: {
    portal: [
      "Search for Network security groups and select Create.",
      "Select the Subscription and Resource group.",
      "Enter a Name, for example nsg-web, and choose a Region.",
      "Select Review + create, then Create.",
      "Open the NSG, choose Inbound security rules, then Add.",
      "Set Source to Service Tag and Source service tag to Internet. Set Destination port ranges to 443, Protocol to TCP, Action to Allow and Priority to 100, then select Add.",
      "Choose Subnets, select + Associate, pick vnet-sea and snet-web, then select OK.",
    ],
    cli: `az network nsg create \\
  --resource-group rg-polaris-demo \\
  --name nsg-web \\
  --location southeastasia

az network nsg rule create \\
  --resource-group rg-polaris-demo \\
  --nsg-name nsg-web \\
  --name Allow-HTTPS-Inbound \\
  --priority 100 \\
  --direction Inbound \\
  --access Allow \\
  --protocol Tcp \\
  --source-address-prefixes Internet \\
  --source-port-ranges '*' \\
  --destination-address-prefixes '*' \\
  --destination-port-ranges 443

az network vnet subnet update \\
  --resource-group rg-polaris-demo \\
  --vnet-name vnet-sea \\
  --name snet-web \\
  --network-security-group nsg-web`,
    powershell: `$rule = New-AzNetworkSecurityRuleConfig \`
  -Name "Allow-HTTPS-Inbound" \`
  -Priority 100 \`
  -Direction Inbound \`
  -Access Allow \`
  -Protocol Tcp \`
  -SourceAddressPrefix "Internet" \`
  -SourcePortRange "*" \`
  -DestinationAddressPrefix "*" \`
  -DestinationPortRange 443

New-AzNetworkSecurityGroup \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "nsg-web" \`
  -Location "southeastasia" \`
  -SecurityRules $rule`,
    bicep: `resource nsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: 'nsg-web'
  location: resourceGroup().location
  properties: {
    securityRules: [
      {
        name: 'Allow-HTTPS-Inbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: 'Internet'
          sourcePortRange: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '443'
        }
      }
    ]
  }
}`,
    arm: `{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "resources": [
    {
      "type": "Microsoft.Network/networkSecurityGroups",
      "apiVersion": "2023-09-01",
      "name": "nsg-web",
      "location": "[resourceGroup().location]",
      "properties": {
        "securityRules": [
          {
            "name": "Allow-HTTPS-Inbound",
            "properties": {
              "priority": 100,
              "direction": "Inbound",
              "access": "Allow",
              "protocol": "Tcp",
              "sourceAddressPrefix": "Internet",
              "sourcePortRange": "*",
              "destinationAddressPrefix": "*",
              "destinationPortRange": "443"
            }
          }
        ]
      }
    }
  ]
}`,
  },
  examNotes: [
    "Rule priorities run from 100 to 4096. The lowest number is evaluated first and the first match wins.",
    "Default rules have priorities 65000, 65001 and 65500 and cannot be deleted. The 65500 rule denies all traffic. Override them with a lower-numbered rule.",
    "With NSGs on both a subnet and a NIC, inbound traffic is checked by the subnet NSG first, then the NIC NSG. Outbound is the reverse. Both must allow it.",
    "NSGs are stateful: if a connection is allowed in one direction, the reply traffic is allowed automatically.",
    "Use Effective security rules on a NIC (or IP flow verify in Network Watcher) to see which rule is actually blocking traffic.",
    "Rules can use service tags (Internet, VirtualNetwork, AzureLoadBalancer, Storage) and application security groups instead of raw IP ranges.",
  ],

  related: ["subnet", "application-security-group", "public-ip-address"],
  docsUrl:
    "https://learn.microsoft.com/azure/virtual-network/network-security-groups-overview",
};
