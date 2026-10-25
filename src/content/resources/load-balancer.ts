import type { ResourceInput } from "../schema";

export const loadBalancer: ResourceInput = {
  slug: "load-balancer",
  name: "Load Balancer",
  type: "Microsoft.Network/loadBalancers",
  category: "networking",
  scope: "resource",
  icon: "Split",

  tagline: "Spreads TCP and UDP traffic across healthy VMs behind one address.",
  definition:
    "Azure Load Balancer works at layer 4. Clients connect to one frontend IP address, and the load balancer sends each new connection to a healthy VM in the backend pool. It does not read HTTP or URLs. A public load balancer faces the internet. An internal load balancer has a private IP in a subnet and is reachable only from the VNet, peered VNets or connected networks.",
  analogy:
    "A receptionist who sends each new visitor to a free desk. A health probe is the check that a desk is staffed, and the receptionist skips any desk that is not.",
  whenToUse: [
    "Spreading TCP or UDP traffic across several VMs in one region for capacity and availability.",
    "Putting an internal load balancer in front of a database or app tier that only the VNet should reach.",
    "Passing all ports through an NVA pair with HA ports on an internal Standard load balancer.",
  ],
  notFor: [
    "Routing by URL path, TLS offload or a web application firewall. That is Application Gateway.",
    "Web traffic that must be spread across regions with fast failover and caching. That is Azure Front Door. Traffic Manager does the same by DNS only. A regional load balancer stays inside one region; spreading TCP or UDP across regions needs the Global tier.",
    "Giving users on the internet access to an internal load balancer. It has no internet-facing address.",
  ],

  prerequisites: [
    {
      name: "A Standard SKU",
      why: "Standard is the current SKU. The Basic Load Balancer was retired on 30 September 2025 and only appears on the exam as a distractor.",
    },
    {
      name: "A frontend IP configuration",
      slug: "public-ip-address",
      why: "A public load balancer needs a Standard public IP. An internal one uses a private IP from a subnet instead.",
    },
    {
      name: "Backend VMs in one virtual network",
      slug: "virtual-machine",
      why: "You add the VM's network interface (or an IP address) to the backend pool. All backends must be in the same VNet.",
    },
    {
      name: "A health probe",
      why: "The load balancer only sends new connections to instances that pass the probe, such as an HTTP check on port 80 that must return 200.",
    },
    {
      name: "A load-balancing rule",
      why: "Maps a frontend port and protocol to a backend port and pool, and names the probe to use.",
    },
    {
      name: "An NSG that allows the traffic",
      slug: "network-security-group",
      why: "Standard is closed by default. The backend subnet or NIC must allow the data port, and must not block the probe source.",
    },
  ],

  example: {
    portal: [
      "Search for Load balancers, then select + Create, then Standard Load Balancer.",
      "On Basics, select the Resource group, enter a Name such as lb-web and choose a Region. Leave SKU as Standard, set Type to Public and leave Tier as Regional.",
      "On Frontend IP configuration, select + Add a frontend IP configuration. Name it fe, choose IPv4 and IP address, then select Create new for the public IP.",
      "On Backend pools, select + Add a backend pool. Name it be, pick the virtual network, and choose NIC or IP address as the configuration. Add the VMs.",
      "On Inbound rules, select + Add a load balancing rule. Choose TCP, port 80, backend port 80, frontend fe and backend pool be.",
      "In the same rule, for Health probe select Create new, name it probe-http and set Protocol to HTTP.",
      "Keep Session persistence as None. Leave the outbound SNAT setting on its recommended default, which uses outbound rules, and select Save.",
      "Select Review + create, then Create. Make sure an NSG on the backend subnet or NICs allows port 80.",
    ],
    cli: `az network public-ip create \\
  --resource-group rg-polaris-demo \\
  --name pip-lb \\
  --sku Standard \\
  --allocation-method Static

az network lb create \\
  --resource-group rg-polaris-demo \\
  --name lb-web \\
  --sku Standard \\
  --public-ip-address pip-lb \\
  --frontend-ip-name fe \\
  --backend-pool-name be

az network lb probe create \\
  --resource-group rg-polaris-demo \\
  --lb-name lb-web \\
  --name probe-http \\
  --protocol Http \\
  --port 80 \\
  --path /

az network lb rule create \\
  --resource-group rg-polaris-demo \\
  --lb-name lb-web \\
  --name rule-http \\
  --protocol Tcp \\
  --frontend-port 80 \\
  --backend-port 80 \\
  --frontend-ip-name fe \\
  --backend-pool-name be \\
  --probe-name probe-http \\
  --disable-outbound-snat true \\
  --enable-tcp-reset true

az network nic ip-config address-pool add \\
  --resource-group rg-polaris-demo \\
  --nic-name nic-web-01 \\
  --ip-config-name ipconfig1 \\
  --lb-name lb-web \\
  --address-pool be`,
    powershell: `$pip = New-AzPublicIpAddress \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "pip-lb" \`
  -Location "southeastasia" \`
  -Sku Standard \`
  -AllocationMethod Static

$fe = New-AzLoadBalancerFrontendIpConfig -Name "fe" -PublicIpAddress $pip
$be = New-AzLoadBalancerBackendAddressPoolConfig -Name "be"

$probe = New-AzLoadBalancerProbeConfig \`
  -Name "probe-http" \`
  -Protocol Http \`
  -Port 80 \`
  -RequestPath "/" \`
  -IntervalInSeconds 5 \`
  -ProbeCount 2

$rule = New-AzLoadBalancerRuleConfig \`
  -Name "rule-http" \`
  -Protocol Tcp \`
  -FrontendPort 80 \`
  -BackendPort 80 \`
  -FrontendIpConfiguration $fe \`
  -BackendAddressPool $be \`
  -Probe $probe \`
  -DisableOutboundSNAT \`
  -EnableTcpReset

New-AzLoadBalancer \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "lb-web" \`
  -Location "southeastasia" \`
  -Sku Standard \`
  -FrontendIpConfiguration $fe \`
  -BackendAddressPool $be \`
  -Probe $probe \`
  -LoadBalancingRule $rule`,
    bicep: `param location string = resourceGroup().location

var lbName = 'lb-web'

resource pip 'Microsoft.Network/publicIPAddresses@2023-09-01' = {
  name: 'pip-lb'
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource lb 'Microsoft.Network/loadBalancers@2023-09-01' = {
  name: lbName
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
          protocol: 'Http'
          port: 80
          requestPath: '/'
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
          disableOutboundSnat: true
          enableTcpReset: true
          frontendIPConfiguration: {
            id: resourceId('Microsoft.Network/loadBalancers/frontendIPConfigurations', lbName, 'fe')
          }
          backendAddressPool: {
            id: resourceId('Microsoft.Network/loadBalancers/backendAddressPools', lbName, 'be')
          }
          probe: {
            id: resourceId('Microsoft.Network/loadBalancers/probes', lbName, 'probe-http')
          }
        }
      }
    ]
  }
}`,
  },
  examNotes: [
    "Load Balancer works at layer 4 (TCP and UDP). It cannot route by URL path, offload TLS or act as a WAF. Application Gateway does layer 7.",
    "Basic Load Balancer was retired on 30 September 2025. The current SKUs are Standard and Gateway (Gateway is for chaining network virtual appliances). The tier is Regional, or Global for cross-region load balancing.",
    "A Standard load balancer needs a Standard public IP, and is closed to inbound traffic until an NSG allows it. Traffic is blocked if no NSG exists on the subnet or NIC.",
    "The frontend IP decides the type. A public IP makes a public load balancer. A private IP from a subnet makes an internal one, which cannot accept traffic from the internet.",
    "Load-balancing rules apply to inbound traffic only. Each rule needs a health probe. The portal validates this, but the CLI, PowerShell and templates do not check it. Inbound NAT rules do not need a probe.",
    "Probe protocols are TCP, HTTP and HTTPS. An HTTP or HTTPS probe is healthy only on a 200 response. When a probe fails, the load balancer stops sending new connections to that instance, and established TCP connections continue.",
    "Probes come from 168.63.129.16. The AzureLoadBalancer service tag allows it by default. Blocking it makes probes fail and is not a supported configuration.",
    "The backend pool holds NICs or IP addresses of VMs or scale sets in one virtual network. VMs do not need a public IP, and a Private Endpoint cannot be a backend.",
    "Default distribution is a hash of source IP, source port, destination IP, destination port and protocol. In the portal, Session persistence None is that hash, Client IP is source and destination IP, and Client IP and protocol adds the protocol.",
    "HA ports is a rule with protocol All and port 0. It is available only on an internal Standard load balancer, and is how you balance NVAs.",
    "For outbound internet access Learn ranks NAT Gateway best, then an instance-level public IP, then load balancer outbound rules. Outbound rules need a Standard public load balancer. Default outbound access is not recommended.",
  ],

  related: ["public-ip-address", "virtual-machine", "network-security-group", "network-virtual-appliance"],
  docsUrl: "https://learn.microsoft.com/azure/load-balancer/load-balancer-overview",
};
