import type { ResourceInput } from "../schema";

export const networkWatcher: ResourceInput = {
  slug: "network-watcher",
  name: "Network Watcher",
  type: "Microsoft.Network/networkWatchers",
  category: "networking",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 1,
  scope: "resource",
  icon: "Radar",

  tagline: "A regional toolbox to diagnose and monitor network problems between your Azure resources.",
  definition:
    "Azure Network Watcher is a regional service with a suite of tools to monitor, diagnose, view metrics and turn logs on or off for Azure IaaS resources such as virtual machines, virtual networks and load balancers. It is enabled in a region by creating a Network Watcher instance there, and that instance gives you access to the tools in that region. The tools fall into three groups: monitoring (topology and connection monitor), network diagnostic tools (IP flow verify, NSG diagnostics, next hop, effective security rules, connection troubleshoot, packet capture and VPN troubleshoot) and traffic (flow logs and traffic analytics). It is a diagnostic service, not a device that your traffic flows through. Learn says it is not designed for PaaS monitoring or web analytics.",
  analogy:
    "A repair crew's diagnostic kit that Azure keeps in each region. When a call fails you do not guess: one tool tells you which firewall rule said no, another tells you which road the packet took, and another keeps watching the link over time.",
  whenToUse: [
    "A VM cannot reach something, or something cannot reach it, and you suspect a security rule. IP flow verify says whether a packet is allowed or denied and names the rule.",
    "Traffic seems to go the wrong way. Next hop shows the next hop type, IP address and route table ID for a destination IP address.",
    "You want to watch connectivity and latency over time between Azure VMs, scale sets, Azure Arc-enabled on-premises hosts and URLs, FQDNs or IP addresses. That is connection monitor.",
    "You need a one-time reachability test from a VM, scale set, application gateway or Bastion host to a VM, FQDN, URI or IPv4 address. That is connection troubleshoot.",
    "You need to record packets to and from a VM or scale set, or log the IP traffic that flows through a virtual network (flow logs, then traffic analytics for the visuals).",
  ],
  notFor: [
    "Monitoring PaaS services or web analytics. Learn says Network Watcher is not designed for either.",
    "Changing how traffic flows. The tools mostly show what is happening. The rules and routes themselves live in network security groups and route tables.",
    "Creating new NSG flow logs. Learn says the feature is retiring and no longer supports new NSG flow logs. Use virtual network flow logs.",
    "Troubleshooting ExpressRoute gateways. VPN troubleshoot supports VPN gateways only.",
  ],

  prerequisites: [
    {
      name: "Permissions to use the tools",
      why: "You need the Owner, Contributor or Network contributor built-in role, or a custom role with the actions for the tool you want. Network contributor does not include the Microsoft.Storage and Microsoft.Compute actions that some tools need, nor the Log Analytics workspace actions that traffic analytics needs.",
    },
    {
      name: "A virtual network",
      slug: "virtual-network",
      why: "The tools diagnose resources that live in virtual networks. Creating or updating a virtual network also enables Network Watcher in that network's region.",
    },
    {
      name: "A Network Watcher instance in the region",
      why: "By default it is created for you when you create or update a virtual network in your subscription, with no impact on your resources and no charge. You must create it yourself only if you opted out of automatic enablement. There is at most one instance per region per subscription.",
      autoCreated: true,
    },
    {
      name: "The NetworkWatcherRG resource group",
      slug: "resource-group",
      why: "The portal puts the instance in a group named NetworkWatcherRG and creates the group if it does not exist. With PowerShell or the CLI you can pick the group name, but the group must exist first.",
      autoCreated: true,
    },
    {
      name: "A running virtual machine",
      slug: "virtual-machine",
      why: "IP flow verify and next hop test from a VM's network interface. Learn notes that stopped VMs are not available to select for IP flow verify.",
    },
    {
      name: "The Network Watcher Agent VM extension (for some tools)",
      why: "Packet capture needs the AzureNetworkWatcherExtension extension. Connection monitor needs it on Azure VM and scale set sources. Connection troubleshoot used to need it too, and Learn now describes an agentless experience in preview. Installing it does not need a reboot.",
    },
    {
      name: "A storage account (for flow logs and saved captures)",
      slug: "storage-account",
      why: "Flow logs are stored in Azure Storage. For virtual network flow logs the account must be in the same region as the virtual network and must be a standard account. Packet capture can save to a storage blob, which needs key access enabled for its SAS tokens.",
    },
    {
      name: "A Log Analytics workspace (for connection monitor and traffic analytics)",
      slug: "log-analytics-workspace",
      why: "Connection monitor stores its data in a Log Analytics workspace, and traffic analytics sends processed flow log data to one.",
    },
  ],

  example: {
    portal: [
      "In the search box at the top of the portal, enter network watcher and select Network Watcher.",
      "On the Overview page you can see every Network Watcher instance in your subscription. If your region is missing, select + Create.",
      "On Add network watcher, select your Subscription and the Region, then select Add. The portal names the instance NetworkWatcher_ followed by the region and puts it in NetworkWatcherRG.",
      "To test a security rule, under Network diagnostic tools select IP flow verify.",
      "Set Target resource to Virtual machine, select the VM and its Network interface, set Protocol to TCP and Direction to Outbound, enter Local port 60000, Remote IP address 13.107.21.200 and Remote port 80, then select Verify IP flow. The result is Allowed or Denied, with the security rule that decided it.",
      "To test routing, under Network diagnostic tools select Next hop. Choose the Subscription, Resource group, Virtual machine and Network interface, enter the Source IP address and a Destination IP address, then select Next hop to see the next hop type, IP address and route table ID.",
    ],
    cli: `az group create \\
  --name NetworkWatcherRG \\
  --location southeastasia

az network watcher configure \\
  --resource-group NetworkWatcherRG \\
  --locations southeastasia \\
  --enabled

az network watcher show-next-hop \\
  --resource-group rg-polaris-demo \\
  --vm vm-web-01 \\
  --nic nic-web-01 \\
  --source-ip 10.0.1.4 \\
  --dest-ip 13.107.21.200 \\
  --out table

az network watcher test-ip-flow \\
  --resource-group rg-polaris-demo \\
  --vm vm-web-01 \\
  --nic nic-web-01 \\
  --direction Outbound \\
  --protocol TCP \\
  --local 10.0.1.4:60000 \\
  --remote 13.107.21.200:80 \\
  --out table`,
    powershell: `New-AzResourceGroup -Name "NetworkWatcherRG" -Location "southeastasia"

$networkWatcher = New-AzNetworkWatcher \`
  -Name "NetworkWatcher_southeastasia" \`
  -ResourceGroupName "NetworkWatcherRG" \`
  -Location "southeastasia"

$vm = Get-AzVM -ResourceGroupName "rg-polaris-demo" -Name "vm-web-01"

Get-AzNetworkWatcherNextHop \`
  -NetworkWatcher $networkWatcher \`
  -TargetVirtualMachineId $vm.Id \`
  -SourceIPAddress "10.0.1.4" \`
  -DestinationIPAddress "13.107.21.200"

Test-AzNetworkWatcherIPFlow \`
  -Location "southeastasia" \`
  -TargetVirtualMachineId $vm.Id \`
  -Direction "Outbound" \`
  -Protocol "TCP" \`
  -RemoteIPAddress "13.107.21.200" \`
  -RemotePort "80" \`
  -LocalIPAddress "10.0.1.4" \`
  -LocalPort "60000"`,
    bicep: `// Deploy this to a resource group, for example NetworkWatcherRG.
// Learn lists no properties to set on a network watcher.
resource networkWatcher 'Microsoft.Network/networkWatchers@2024-05-01' = {
  name: 'NetworkWatcher_southeastasia'
  location: 'southeastasia'
  properties: {}
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "Which tool answers which question. IP flow verify: is this packet allowed or denied, and by which security rule. Next hop: which route is used (type, IP address, route table ID). Connection troubleshoot: can A reach B right now. Connection monitor: can A reach B, and how is it doing over time. Packet capture: what packets cross a VM. Flow logs: which IP traffic crossed a network security group or virtual network. Topology: how resources relate to each other. VPN troubleshoot: is a VPN gateway or connection healthy.",
    "IP flow verify returns Access (Allow or Deny) and the rule name, for example defaultSecurityRules/DenyAllInBound. It checks the default and configured security rules only. If the result is as expected and traffic still fails, look for a firewall between the VM and the endpoint, or a firewall in the VM's operating system.",
    "Next hop: the route table ID shows System Route when no user-defined route applies. A next hop type of None means the traffic is dropped. A user-defined route to a virtual appliance changes the result, which is how Learn shows a routing problem. Compare with Effective routes on the NIC.",
    "Connection troubleshoot tests a connection at a point in time. Connection monitor runs the same kind of checks over time. Connection troubleshoot supports TCP or ICMP from VMs, scale sets, Bastion instances and application gateways v2, to VMs, FQDNs, URIs or IP addresses.",
    "Connection monitor (classic) and Network performance monitor are deprecated and no longer available. Learn's lifecycle page lists Connection Monitor (classic) retiring on February 29, 2024, and the older Learn notice told Network performance monitor users to migrate before that date. The current Connection monitor can import tests from both, and Azure VMs used as sources need the Network Watcher extension.",
    "Connection monitor limits per subscription per region: 100 connection monitors, 20 test groups per monitor, 100 sources and destinations per monitor and 20 test configurations per monitor. Checks use TCP, ICMP or HTTP. Sources can be Azure VMs, scale sets and Arc-enabled on-premises hosts. Destinations can also be URLs, FQDNs and IP addresses and do not need the extension.",
    "Per-region enablement: Network Watcher is created automatically in a region when you create or update a virtual network there, and there is one instance per region per subscription. The portal names it NetworkWatcher_region in NetworkWatcherRG. az network watcher configure names it region-watcher. PowerShell and the REST API let you choose the name.",
    "To stop automatic enablement, register the DisableNetworkWatcherAutocreation feature for Microsoft.Network and re-register the provider. Learn says opting out is permanent: you cannot opt back in without contacting Azure support. After that you must create an instance in each region you use.",
    "Deleting (disabling) a Network Watcher instance deletes all of its running operations, history and alerts with no undo. For example, deleting NetworkWatcher_eastus deletes the flow logs, connection monitors and packet captures in East US.",
    "NSG flow logs retire on September 30, 2027 and no longer support new NSG flow logs. Migrate to virtual network flow logs. After that date, traffic analytics for NSG flow logs is no longer supported and existing NSG flow log resources are deleted, though stored log records stay in Storage under their retention settings.",
    "Virtual network flow logs are enabled at the virtual network, so you do not need to enable them on each NSG at both the subnet and the NIC. Learn recommends disabling NSG flow logs before enabling virtual network flow logs on the same workloads, to avoid duplicate records and extra cost.",
    "Traffic analytics analyzes flow logs and needs a Log Analytics workspace. If a region supports flow logs but not a workspace, you can use a workspace from another supported region. Enabling it is part of the flow log resource, so you need the flow log permissions plus the traffic analytics permissions.",
    "Packet capture needs the AzureNetworkWatcherExtension VM extension. It can save to the VM's local disk or a storage blob, and it can be started by a VM alert. The default time limit per session is 18,000 seconds (5 hours) and the limit is 10,000 sessions per region per subscription. Filters use protocol, local and remote IP address and port.",
    "VPN troubleshoot supports route-based VPN gateways and IPsec and VNet2VNet connections. It does not support ExpressRoute, policy-based VPNs or VPNClient connections. Only one operation can run at a time per subscription. With the CLI, the gateway and the storage account must be in the same resource group.",
    "NSG diagnostics works at VM, scale set and application gateway level and can add a higher-priority rule. Effective security rules shows every rule applied to a NIC, to its subnet, and the combined result.",
    "Topology shows resources and relationships across subscriptions, regions and resource groups. It is drawn from Azure Resource Graph, so a configuration change can take up to 30 hours to appear.",
    "Permissions: Owner, Contributor or Network contributor, or a custom role with the actions for the tool. Network contributor lacks the Microsoft.Storage and Microsoft.Compute actions some tools need, and the Log Analytics actions that traffic analytics needs.",
    "Commands to know: az network watcher configure, list, show-next-hop, test-ip-flow, test-connectivity and show-topology. In PowerShell: New-AzNetworkWatcher, Get-AzNetworkWatcher, Get-AzNetworkWatcherNextHop and Test-AzNetworkWatcherIPFlow.",
  ],
    },
  ],

  related: [
    "virtual-network",
    "network-security-group",
    "route-table",
    "virtual-machine",
    "log-analytics-workspace",
    "vnet-peering",
    "load-balancer",
    "network-virtual-appliance",
    "alert-rule",
    "storage-account",
  ],
  docsUrl: "https://learn.microsoft.com/azure/network-watcher/network-watcher-overview",

  simulator: {
    armType: "Microsoft.Network/networkWatchers",
    apiVersion: "2024-05-01",
    nameRule: "network-watcher",
  },
};
