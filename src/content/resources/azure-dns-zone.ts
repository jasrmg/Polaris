import type { ResourceInput } from "../schema";

export const azureDnsZone: ResourceInput = {
  slug: "azure-dns-zone",
  name: "Azure DNS Zone",
  type: "Microsoft.Network/dnsZones",
  category: "networking",
  scope: "resource",
  icon: "BookOpen",

  tagline: "Hosts the public DNS records for your domain on Azure's name servers.",
  definition:
    "An Azure DNS public zone holds the DNS records for a domain such as example.com and answers queries about it from the internet. Azure DNS is not a domain registrar. You buy the domain elsewhere, then delegate it to Azure by pointing the registrar at the four name servers Azure gives you.",
  analogy:
    "A public phone book for your domain. The registrar is the office that lists your name, and the zone is the page that says which number goes with each name.",
  whenToUse: [
    "Hosting DNS for a public domain next to the Azure resources it points at.",
    "Using alias records so a name follows a public IP, load balancer or Traffic Manager profile when its address changes.",
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
      why: "Bought from a registrar. Examples here use example.com; that name is reserved and will not actually resolve.",
    },
    {
      name: "Delegation at the registrar",
      why: "Copy the four Azure name servers from the zone's overview page into the registrar's NS settings.",
    },
  ],

  example: {
    portal: [
      "Search for DNS zones and select Create.",
      "Select the Resource group and enter the domain as the Name, for example example.com.",
      "Select Review + create, then Create.",
      "Open the zone, choose Record sets, then Add.",
      "Enter Name www, Type A and the IP address, then select OK.",
      "Copy the four name servers into your registrar's NS settings.",
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
    "A DNS zone's location is global. You do not pick a region for it.",
    "After creating the zone you must delegate the domain by setting the registrar's name servers to the four Azure ones. Until then the zone does not answer public queries.",
    "A record set is all records with the same name and type. A CNAME cannot share a name with other record types, and cannot sit at the zone apex.",
    "Alias records let an apex name (example.com) point at a public IP or Traffic Manager profile. Use them where a CNAME is not allowed.",
    "Azure DNS does not register domains. Domains bought through App Service domains can be hosted in Azure DNS.",
  ],

  related: ["private-dns-zone", "public-ip-address"],
  docsUrl: "https://learn.microsoft.com/azure/dns/dns-zones-records",
};
