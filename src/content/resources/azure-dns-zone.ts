import type { ResourceInput } from "../schema";

export const azureDnsZone: ResourceInput = {
  slug: "azure-dns-zone",
  name: "Azure DNS Zone",
  type: "Microsoft.Network/dnsZones",
  category: "networking",
  kind: "azure-resource",
  exams: ["az-104"],
  tier: 1,
  scope: "resource",
  icon: "BookOpen",

  tagline: "Hosts the public DNS records for your domain on Azure's name servers.",
  definition:
    "An Azure DNS public zone holds the DNS records for a domain such as example.com and answers queries about it from the internet. Azure DNS does not sell domains. You buy one from App Service domains or another registrar, then delegate it to Azure by setting the registrar's name server (NS) records to the four name servers Azure gives you.",
  analogy:
    "A public phone book for your domain. The registrar is the office that lists your name, and the zone is the page that says which number goes with each name.",
  whenToUse: [
    "Hosting DNS for a public domain next to the Azure resources it points at.",
    "Using alias records so a name follows an Azure public IP, Traffic Manager profile, Front Door endpoint or CDN endpoint when it changes.",
    "Managing DNS with the same RBAC, templates and tooling as the rest of Azure.",
  ],
  notFor: [
    "Names that must only resolve inside your VNets. Use a private DNS zone.",
    "Registering a domain name. Azure DNS hosts DNS but does not sell domains.",
  ],

  prerequisites: [
    {
      name: "A resource group",
      slug: "resource-group",
      why: "The DNS zone is a resource and needs a group.",
    },
    {
      name: "A domain name you own",
      why: "You can create a zone for any name, but you must own the domain to delegate it. Examples here use example.com as a placeholder.",
    },
    {
      name: "Delegation at the registrar",
      why: "Copy the four Azure name servers from the zone's Overview page into the registrar's NS records.",
    },
  ],

  example: {
    portal: [
      "Search for DNS zones and select Create.",
      "Select the Resource group and enter the domain as the Name, for example example.com.",
      "Select Review + create, then Create.",
      "Open the zone, select Record sets, then + Add.",
      "Enter Name www, Type A, Alias record set No, and the IP address, then select Add.",
      "On the zone's Overview page, copy the four name servers into your registrar's NS records.",
    ],
    cli: `az network dns zone create \\
  --resource-group rg-polaris-demo \\
  --name example.com

az network dns record-set a add-record \\
  --resource-group rg-polaris-demo \\
  --zone-name example.com \\
  --record-set-name www \\
  --ipv4-address 203.0.113.10`,
    powershell: `New-AzDnsZone \`
  -ResourceGroupName "rg-polaris-demo" \`
  -Name "example.com"

New-AzDnsRecordSet \`
  -ResourceGroupName "rg-polaris-demo" \`
  -ZoneName "example.com" \`
  -Name "www" \`
  -RecordType A \`
  -Ttl 3600 \`
  -DnsRecords (New-AzDnsRecordConfig -IPv4Address "203.0.113.10")`,
    bicep: `resource zone 'Microsoft.Network/dnsZones@2018-05-01' = {
  name: 'example.com'
  location: 'global'
}

resource www 'Microsoft.Network/dnsZones/A@2018-05-01' = {
  parent: zone
  name: 'www'
  properties: {
    TTL: 3600
    ARecords: [
      {
        ipv4Address: '203.0.113.10'
      }
    ]
  }
}`,
  },
  examNotes: [
    {
      exam: "az-104",
      points: [
    "A DNS zone is a global service, not bound to a region. The resource group location does not affect it, and Bicep/ARM use location 'global'.",
    "After creating the zone you must delegate the domain: set the registrar's NS records to all four Azure name servers. Until you do, internet users are not directed to your zone.",
    "The apex NS and SOA record sets are created automatically. You cannot remove or change the Azure name servers in the apex NS record set.",
    "A record set is all records with the same name and type. A CNAME cannot share a name with other record types, and cannot sit at the zone apex.",
    "Alias records (A, AAAA or CNAME) can point at a Standard SKU public IP, a Traffic Manager profile, a Front Door endpoint, a CDN endpoint, or another record set of the same type in the zone. A load balancer is not a listed target; alias its public IP resource instead.",
    "Alias records work at the zone apex, where a CNAME is not allowed. They update automatically if the target IP changes and become empty if the target is deleted.",
    "Azure DNS does not support buying domains. Buy through App Service domains or another registrar, then host the domain in Azure DNS.",
  ],
    },
  ],

  related: ["private-dns-zone", "public-ip-address"],
  docsUrl: "https://learn.microsoft.com/azure/dns/dns-zones-records",
  simulator: {
    armType: "Microsoft.Network/dnsZones",
    apiVersion: "2018-05-01",
    nameRule: "azure-dns-zone",
  },
};
