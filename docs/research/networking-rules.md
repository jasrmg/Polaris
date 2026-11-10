# Azure networking rules for the Polaris reachability checker

**Status:** research output for roadmap checkpoint 16 (networking behaviour and reachability checker). The checker answers three questions: a new inbound TCP connection from the internet to a virtual machine's public IP, a new outbound TCP connection from that virtual machine to the internet, and a new TCP connection to an IPv4 address in the same virtual network. The destination network interface is checked when it has that address. The sandbox assigns the lowest free address in the subnet. A rule can target virtual-network traffic or internet traffic. A virtual-network rule does not decide an internet check. The outbound internet check uses one 0.0.0.0/0 user route after the security groups allow the traffic. Next hop None drops that traffic. The same-network check keeps the longer system route unless a user route has a longer prefix. A direct peering with both links Connected is included. A virtual appliance next hop sends traffic to a network interface in this virtual network or a peered one. The check then uses that interface's outbound security group and one route on its subnet, and stops. If that subnet has no winning user route, the virtual network system route can deliver the address. Traffic forwarded across a peering needs both links to allow it. Gateway transit can be recorded on one link and does not carry traffic, because the sandbox has no gateway. The same-network check resolves a running virtual machine's Azure-provided name in that virtual network. A linked private DNS zone is checked first. An A record answers the name, and no record ends the check. Auto-registration is not part of the check. A second appliance is not followed. The guest operating system is not part of the check. The rest of this file is still research.
**Accessed:** 2026-10-27 (all URLs fetched that day, `en-us` locale).
**Sources:** `learn.microsoft.com` only (docs, REST reference, Learn training). No third-party pages were used.
**Method:** every fact below carries a source ID such as `[S1]`. The ID table is in section 9. If a fact could not be verified, it is tagged `[Unverified]`. If two Learn pages disagree, it is tagged `[Conflict]`. A choice the owner should make is tagged `[Decision]`.

Tag legend:

| Tag | Meaning |
|---|---|
| (no tag) | Stated by Learn at the cited source. |
| `[Conflict]` | Two Learn pages say different things. Both are quoted. |
| `[Unverified]` | Learn does not state it. The sandbox must not invent it. |
| `[Decision]` | The sandbox needs a rule here. The owner confirms before it is built. |

---

## 0. Summary for the implementer

1. NSG rules: lowest priority number wins, first match stops processing, default rules at 65000/65001/65500. Inbound order is subnet NSG then NIC NSG. Outbound order is NIC NSG then subnet NSG. A packet must be allowed by every NSG layer that exists. [S1][S2][S9]
2. Routing: longest prefix match, then UDR over BGP over system route for the same prefix. [S5]
3. Peering: needs two links both `Connected`, never transitive, address spaces must not overlap. [S7][S9]
4. DNS: Azure-provided DNS (`168.63.129.16`) checks linked private DNS zones first, then Azure-provided names. A custom DNS server replaces that order. [S12][S11]
5. Internet: new VNets created with the API version released after 2026-03-31 have private subnets (`defaultOutboundAccess = false`), so a VM needs an explicit outbound method. [S22]
6. Network Watcher has four tools that the sandbox trace should mirror: IP flow verify, next hop, effective security rules, effective routes. Field names are in section 6. [S34][S39][S40][S41]
7. The biggest places where Learn is silent or contradicts itself are listed in section 8. Read that before building.

---

## 1. NSG evaluation

### 1.1 Rule properties

| Property | Documented behaviour | Source |
|---|---|---|
| Name | Unique within the NSG, up to 80 characters, starts with a word character, ends with a word character or `_`, may contain word characters, `.`, `-`, `_`. | [S1] |
| Priority | A number between 100 and 4096. Lower number is processed first. Once traffic matches a rule, processing stops. | [S1] |
| Same priority | You can't create two rules with the same priority **and** direction. | [S1] |
| Source / destination | `Any`, an IP address, a CIDR block, a service tag, or an application security group. | [S1] |
| Protocol | `TCP`, `UDP`, `ICMP`, `ESP`, `AH`, or `Any`. ESP and AH are not available in the portal, only in ARM templates. `Any` covers TCP, UDP and ICMP. | [S1] |
| Direction | Inbound or outbound. | [S1] |
| Port range | A single port, a range (`10000-10005`), or a comma-separated mix (`80, 10000-10005`). | [S1] |
| Action | Allow or Deny. | [S1] |
| Evaluation inputs | Five-tuple: source, source port, destination, destination port, protocol. | [S1] |

Public IP translation and NSGs [S1]:

- Inbound: NSGs process traffic **after** Azure translates the public IP to the private IP. So a rule's destination is the VM's private IP.
- Outbound: NSGs process traffic **before** the private IP is translated to a public IP. So a rule's source is the VM's private IP.

Load-balanced pools: the source address and port a rule sees are those of the originating computer, not the load balancer. The destination port and address are those of the destination computer. [S1]

### 1.2 Default rules

Azure creates these in every NSG. You can't remove them, but you can override them with a lower priority number. [S1]

Inbound:

| Name (as spelled in S1) | Priority | Source | Source ports | Destination | Dest ports | Protocol | Access |
|---|---|---|---|---|---|---|---|
| AllowVNetInBound | 65000 | VirtualNetwork | 0-65535 | VirtualNetwork | 0-65535 | Any | Allow |
| AllowAzureLoadBalancerInBound | 65001 | AzureLoadBalancer | 0-65535 | 0.0.0.0/0 | 0-65535 | Any | Allow |
| DenyAllInbound | 65500 | 0.0.0.0/0 | 0-65535 | 0.0.0.0/0 | 0-65535 | Any | Deny |

Outbound:

| Name (as spelled in S1) | Priority | Source | Source ports | Destination | Dest ports | Protocol | Access |
|---|---|---|---|---|---|---|---|
| AllowVnetOutBound | 65000 | VirtualNetwork | 0-65535 | VirtualNetwork | 0-65535 | Any | Allow |
| AllowInternetOutBound | 65001 | 0.0.0.0/0 | 0-65535 | Internet | 0-65535 | Any | Allow |
| DenyAllOutBound | 65500 | 0.0.0.0/0 | 0-65535 | 0.0.0.0/0 | 0-65535 | Any | Deny |

`[Conflict]` (cosmetic) Rule-name capitalisation differs between pages. S1 writes `AllowVNetInBound` and `DenyAllInbound`. The Network Watcher quickstart outputs `defaultSecurityRules/AllowVnetOutBound`, `defaultSecurityRules/AllowInternetOutBound`, `defaultSecurityRules/DenyAllOutBound` and `defaultSecurityRules/DenyAllInBound`. [S32] For trace output copy the S32 spellings, because they come from real tool output. Compare names case-insensitively internally. Inbound `AllowVNetInBound` and `AllowAzureLoadBalancerInBound` have no real tool output on the pages read, so their exact prefixed spelling is `[Unverified]` (assume the same `defaultSecurityRules/` prefix).

### 1.3 Statefulness

- A flow record is created for existing connections. Communication is allowed or denied based on the connection state of the flow record. That is what makes an NSG stateful. [S1]
- If an outbound rule allows traffic to any address on port 80, you don't need an inbound rule for the response. The reverse also holds. [S1]
- Removing a rule that allowed a connection does not break existing connections. New or updated rules only affect new connections. [S1]

Sandbox implication: the checker answers "can a **new** connection from A to B on port P be opened". It evaluates the **forward** direction only. Return traffic is allowed by the flow record and is not evaluated. `[Unverified]` Learn does not describe how flow records interact with asymmetric routing through an NVA, so that case is "not simulated" (section 7.2).

### 1.4 Subnet-level and NIC-level NSGs

| Direction | Order | Source |
|---|---|---|
| Inbound | Subnet NSG first, then NIC NSG | [S2], [S9], [S48] |
| Outbound | NIC NSG first, then subnet NSG | [S2], [S9], [S48] |

- If the first NSG denies, the second never sees the traffic. [S2]
- To allow traffic where both exist, **both** must allow it. [S2]
- The same order applies to **intra-subnet** traffic. [S2]
- The same NSG can be associated with as many subnets and NICs as you choose. [S2]
- A subnet NSG applies to every resource in that subnet. If the NIC has no NSG, it gets whatever the subnet NSG allows. [S2]

What if there is no NSG at all?

- `[Conflict]` S2 (the VM4 example) says: "All network traffic is blocked through a subnet and network interface if they don't have a network security group associated to them. The virtual machine with a standard public IP address is secure by default." [S2] The Learn training module says: "security groups are optional at both levels. If no security group is applied, then all traffic is allowed by Azure." [S47] The same S2 page says VM4 outbound "flows freely" with no NSG. [S2]
- Reading that reconciles them (this is the only way both pages stay true) `[Decision]`:
  - Inbound from the **internet** to a **Standard** public IP (or Standard load balancer frontend) with no NSG on the subnet or NIC: **denied**. [S2][S23][S25]
  - Any other flow (outbound, intra-VNet, peered VNet) with no NSG at a layer: that layer **does not filter**. [S47] `[Unverified]` for inbound VNet-to-VNet in S2 itself, only S47 says it. The trace should print "no NSG at this layer".

### 1.5 Service tags (only what Learn states)

A service tag is a group of IP address prefixes from an Azure service. Microsoft manages and updates it. [S4]

| Tag | What Learn says | Source |
|---|---|---|
| `VirtualNetwork` | The VNet address space (all ranges), all connected on-premises address spaces, peered VNets, VNets connected to a VNet gateway, the virtual IP of the host, and address prefixes used on UDRs. "This tag might also contain default routes." | [S4] |
| `Internet` | "The IP address space that's outside the virtual network and reachable by the public internet. The address range includes the Azure-owned public IP address space." | [S4] |
| `AzureLoadBalancer` | The Azure infrastructure load balancer. Translates to the host virtual IP `168.63.129.16` where health probes originate. Only probe traffic, not real traffic to the backend. | [S4] |
| `Storage`, `Sql`, `AzureKeyVault`, `AzureCosmosDB`, `AzureCloud`, ... | Represents the service for the whole cloud. `Storage` "represents the service, but not specific instances". Some tags have a regional form (`Storage.WestUS`). | [S4] |
| `AzurePlatformDNS`, `AzurePlatformIMDS`, `AzurePlatformLKM` | Let a rule deny the platform DNS, IMDS and Windows licensing traffic that NSGs normally skip. | [S4][S1] |
| `GatewayManager` | Management traffic for VPN Gateway and Application Gateway. Used by Bastion rules. | [S4][S29] |

Rules about tags:

- You can't specify multiple service tags in one rule. [S1]
- Tags NOT usable as a UDR address prefix: `AzurePlatformDNS`, `AzurePlatformIMDS`, `AzurePlatformLKM`, `VirtualNetwork`, `AzureLoadBalancer`, `Internet`. [S4]
- Tag contents are published as IP ranges (JSON file and Service Tag Discovery API). The sandbox has no real ranges. [S4]

Edge cases:

- The `Internet` tag includes Azure-owned public IPs. So traffic to a public Storage endpoint matches `Internet` (and also `Storage`). [S4]
- Documented example of what is **not** `Internet`: from a VM in `10.0.0.0/16`, destination `10.10.10.10` (private, not in the VNet) is denied by `DenyAllOutBound`. Destination `10.0.1.10` (in the VNet) is allowed by `AllowVnetOutBound`. Destination `13.107.21.200` is allowed by `AllowInternetOutBound`. [S31][S32][S33]
- The sample expanded `Internet` list in the effective-security-rules output starts at `1.0.0.0/8`, includes `13.104.0.0/13`, and ends at `208.0.0.0/4`, with some gaps (for example `4.128.0.0/12` is absent between `4.0.0.0/9` and `4.144.0.0/12`). The list on the page is truncated. [S32] `[Unverified]` The exact exclusion set. `[Decision]` Approximate `Internet` as "any IPv4 address that is not in the VirtualNetwork set and not in `0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, or `224.0.0.0/3` (multicast and above)", and say "approximation" in the UI. The prefixes `10/8`, `100.64/10`, `127/8`, `172.16/12` and `192.168/16` are documented system routes or reserved ranges [S5]. `169.254/16` and `224.0.0.0/4` are documented as address ranges you can't add to a VNet [S9]. Only `0.0.0.0/8` and the `224+` upper bound come from the truncated sample (it starts at `1.0.0.0/8` and ends at `208.0.0.0/4`) [S32].
- `VirtualNetwork` includes "address prefixes used on user-defined routes" and "might also contain default routes". [S4] `[Unverified]` Learn gives no further detail (for example whether a UDR `0.0.0.0/0` to an NVA makes everything match `VirtualNetwork`). `[Decision]` Implement the documented set (VNet space plus peered VNet space when allowed, section 3.3) and add the prefixes of UDRs whose prefix is not `/0`. Flag a trace warning "VirtualNetwork tag may include UDR prefixes (Learn S4); simulated partially". Do not model the `/0` case.

### 1.6 Application security groups (ASGs)

- An ASG groups NICs. A NIC can be in several ASGs. Rules that name an ASG as source or destination apply only to NICs that are members. A NIC that isn't a member isn't affected, even though the NSG is on the subnet. [S3]
- All NICs in one ASG must be in the same VNet as the first NIC added. [S3]
- If an ASG is source and another is destination in the same rule, the NICs in both must be in the same VNet. [S3]
- Worked example from Learn: priorities 100 (Internet to AsgWeb 80), 110 (AsgLogic to AsgDb 1433 Allow), 120 (any to AsgDb 1433 Deny). The deny is needed because `AllowVNetInBound` would otherwise allow all VNet traffic. [S3]
- Private endpoint NICs: no more than 50 members in an ASG tied to the NSG on the PE subnet, or connection failures may occur. [S18]

### 1.7 Augmented rules and limits (as stated)

Augmented rules let one rule hold multiple ports, multiple IP addresses and ranges. [S1] Limits per region per subscription [S44]:

| Limit | Value |
|---|---|
| NSGs | 5,000 |
| Rules per NSG | 2,000 |
| IP addresses and ranges in a rule's source or destination (counted separately) | 6,000 |
| ASGs per subscription | 3,000 |
| ASGs per IP configuration per NIC | 20 |
| ASGs referenced as source or destination per NSG rule | 10 |
| IP configurations per ASG | 4,000 |
| ASGs that can be specified within all rules of an NSG | 100 |

`[Conflict]` S1 says "you can't specify multiple service tags or application groups in a single rule". S44 and S48 say up to 10 ASGs can be referenced as source or destination per rule. `[Decision]` One service tag per field. Up to 10 ASGs per field (the limits page is the dedicated numeric source). Mention the conflict in a code comment.

Private-endpoint NSG limits (subnet of a private endpoint): destination port ranges count as sources x destinations x ports, valid up to 250K. Source port filtering is interpreted as `*`. [S18]

### 1.8 Intra-subnet traffic

- By default, VMs in the same subnet can communicate because of the default rule that allows intra-subnet (VNet) traffic. Adding a rule to the subnet NSG that denies all inbound and outbound blocks them. [S2]
- It is still evaluated through both NSG layers in the normal order (outbound at the source, inbound at the destination). [S2]

### 1.9 Platform exceptions (Learn states these; most are "not simulated")

- DHCP, DNS, IMDS and health monitoring use host virtual IPs `168.63.129.16` and `169.254.169.254`. By default they are not subject to NSGs, unless targeted by the `AzurePlatformDNS`, `AzurePlatformIMDS`, `AzurePlatformLKM` tags. [S1][S10]
- Windows licensing (KMS, outbound port 1688): the platform rule is disabled when the default route `0.0.0.0/0` configuration is used. [S1]
- After custom DNS servers are set on a network, port 53 traffic bypasses the NSGs of the subnet and the NIC. [S11]
- Outbound port 25 is blocked or allowed depending on subscription type. [S1] (Not simulated, section 7.2.)
- Azure Virtual Network Manager security admin rules always evaluate before NSG rules. "Always allow" and "Deny" end evaluation. "Allow" continues to NSG rules. [S1] (Not simulated.)

---

## 2. Routing

### 2.1 Route table basics

- Azure creates a route table per subnet and adds default system routes. You can't create or remove system routes, but you can override some with custom routes. Azure routes **outbound** traffic from a subnet by the routes in that subnet's table. [S5]
- A route table can be associated with zero or more subnets. A subnet has zero or one. Route tables associate with subnets, not VNets. The route table must be in the same region and subscription as the subnet's VNet. [S5][S43]
- A route's address prefix can't be duplicated within one route table. A prefix can sit inside another prefix. [S43]
- You can't delete a route table that is associated with a subnet. [S43]
- Dissociating a route table makes Azure route by default routes again. [S43]

### 2.2 Default system routes

When a VNet is created, each subnet gets: [S5]

| Source | Address prefix | Next hop type |
|---|---|---|
| Default | One per address range of the VNet (unique to the VNet) | Virtual network (`VnetLocal`) |
| Default | `0.0.0.0/0` | Internet |
| Default | `10.0.0.0/8` | None |
| Default | `172.16.0.0/12` | None |
| Default | `192.168.0.0/16` | None |
| Default | `100.64.0.0/10` | None |
| Default | `157.59.0.0/16` | None |
| Default | `127.0.0.0/8` | None |
| Default | `104.147.0.0/16` | None |
| Default | `104.146.0.0/17` | None |

- Azure does not create default routes for subnet ranges. Each subnet range is inside a VNet address range. [S5]
- Traffic to the None next hop is dropped. [S5]
- `[Conflict]` (low impact) The effective-routes sample output in the REST reference and the PowerShell tutorial list only six default routes (VNet range, `0.0.0.0/0`, `10/8`, `100.64/10`, `172.16/12`, `192.168/16`) and omit `157.59/16`, `127/8`, `104.147/16`, `104.146/17`. [S40][S37] The prose list in S5 has all ten. `[Decision]` Model all ten from S5, but do not print the four rare ones in the default effective-routes view (they look like the Learn samples). Either way the next hop for those four is None.
- If a VNet address range equals one of the reserved prefixes (`10/8`, `172.16/12`, `192.168/16`, `100.64/10`), the next hop of that route changes from None to Virtual network. [S5] Example: VNet `192.168.0.0/16` shows `192.168.0.0/16` `VnetLocal`, others None. [S37]
- If a VNet range **includes but isn't the same as** a reserved prefix, "Azure removes the route for the prefix and adds a route for the address prefix you added, with Virtual network as the next hop type". [S5] `[Unverified]` how to read "includes". The Learn examples with `10.0.0.0/16` (smaller than `10/8`) keep a `10.0.0.0/8` None route in the effective table. [S5 routing example][S36] So implement it as: a VNet range that is a **supernet** of a reserved prefix replaces that route. A VNet range that is a **subnet** of a reserved prefix (the common case) leaves the None route in place. Longest prefix match then picks the VNet route.
- Example from the next hop tutorial: VNet `10.0.0.0/16`. Destination `10.1.0.5` (private, not in the VNet) gives next hop None, because `10.0.0.0/8` is None. Adding an address prefix containing `10.1.0.5` to the VNet address space changes it to Virtual network. [S36]
- Removing the None routes: "Default Route (0.0.0.0/0) with Next Hop Type = Virtual Network Gateway will cause these Default System Routes with Next Hop Type = None to be removed." [S5] In the routing example, a UDR `0.0.0.0/0` to a **virtual appliance** also removed the `10.0.0.0/8`, `192.168.0.0/16` and `100.64.0.0/10` routes from that subnet's table. [S5] `[Decision]` Remove the None routes of the three prefixes listed in the example when a UDR or gateway-learned `0.0.0.0/0` exists with next hop VirtualAppliance or VirtualNetworkGateway. `[Unverified]` the example does not mention `172.16.0.0/12`, and does not mention the other six.

### 2.3 Optional default routes

| Capability | Route added | Added to | Source |
|---|---|---|---|
| VNet peering | One route per address range of each peered VNet, next hop `Virtual network peering` | All subnets of the VNet | [S5] |
| VNet gateway | Routes advertised via BGP or configured in the local network gateway, next hop `Virtual network gateway` | All subnets (unless propagation is disabled) | [S5] |
| Service endpoint | Public prefixes of the service, next hop `VirtualNetworkServiceEndpoint` | Only the subnet with the endpoint | [S5][S21] |
| Private endpoint | A `/32` route to the endpoint IP | See section 5.4 | [S19] |

Peering and service endpoint next hop types are added only for VNets created through Resource Manager. [S5]

### 2.4 User-defined routes (UDRs)

- A route table's routes are combined with the subnet's default routes. If conflicting, UDRs override default routes. [S5]
- Default limit: 400 UDRs per route table; with Azure Virtual Network Manager routing configuration it can be 1,000. [S5] `[Conflict]` S44 says "User-defined routes per route table: 1,000" and "User-defined route tables: 600". `[Decision]` Use 400 as the sandbox limit with the S5 explanation, or 1,000 per S44. Neither affects reachability.
- UDRs with a service tag as prefix: at most 25 per route table. Exact-match preference: explicit prefix beats service tag; among tags the order is regional tag (`Storage.EastUS`), top-level (`Storage`), `AzureCloud` regional, `AzureCloud`. [S5][S44]
- Next hop types you can set in a UDR: [S5]

| Portal / API name | CLI / PowerShell name | Notes |
|---|---|---|
| Virtual appliance | `VirtualAppliance` | Needs a next hop IP address. See 2.7. |
| Virtual network gateway | `VirtualNetworkGateway` | UDRs with this hop are supported only when the VNet's gateway is a VPN gateway (not ExpressRoute, Route Server or Virtual WAN). |
| None | `None` | Drops traffic. |
| Virtual network | `VnetLocal` | Overrides default routing inside the VNet. |
| Internet | `Internet` | Also keeps traffic for Azure public services on the backbone. |

- You can't set `Virtual network peering` or `VirtualNetworkServiceEndpoint` as a UDR next hop. Azure creates those only when you configure a peering or a service endpoint. [S5]
- Name mapping between tools: virtual network = `VNetLocal`/`VnetLocal`. [S5] The Network Watcher portal tutorial shows `VirtualNetwork`. [S36] The REST reference shows `VnetLocal`. [S39][S40] `[Conflict]` (cosmetic) Use `VnetLocal` in API-shaped output and "Virtual network" in portal-style output.

### 2.5 BGP routes and "Propagate gateway routes"

- BGP between an on-premises gateway and an Azure VNet gateway: a separate route for each advertised prefix is added to the route table of all subnets of the VNet. Source and next hop type are `Virtual network gateway`. [S5]
- A route table property disables propagation. Portal label when creating a route table: **Propagate gateway routes**, with the sub-option "Virtual network gateway route propagation" set to Disabled. [S43][S36] When disabled, no routes from the gateway (static or BGP) are added to subnets that use that table. [S5]
- The effective-route field is `disableBgpRoutePropagation`. [S40]
- Do not disable propagation on `GatewaySubnet`. The gateway stops working. [S5]
- Sandbox: VPN and ExpressRoute are "not simulated" (section 7.2). The sandbox can still keep the `Propagate gateway routes` property, validate it and show it in the effective-routes output. No BGP routes ever exist.

### 2.6 Route selection (longest prefix match and tie-breaking)

Documented algorithm [S5]:

1. Pick the route whose address prefix contains the destination IP and has the longest prefix.
2. If several routes have the **same prefix**, pick by source priority: **User-defined route**, then **BGP route**, then **System route**.

Notes from the same page [S5]:

- Example: routes `10.0.0.0/24` and `10.0.0.0/16`. Destination `10.0.0.5` uses the `/24`. Destination `10.0.1.5` uses the `/16`.
- Example: system `0.0.0.0/0` to Internet and user `0.0.0.0/0` to Virtual network gateway. Traffic outside every other prefix uses the User route.
- "System routes for traffic related to virtual network, virtual network peerings, or virtual network service endpoints are preferred routes. They're preferred, even if BGP routes are more specific. Routes with a virtual network service endpoint as the next hop type can't be overridden, even when you use a route table." `[Conflict]` with the later statement that UDRs override default routes with the same prefix and with the routing example, where a UDR with the same prefix as a VNet or peering route changes the default route to state **Invalid**. The reading that fits every example: UDRs override VNet and peering system routes **of the same prefix**. Service endpoint routes can't be overridden by a UDR. [S5][S21] `[Decision]`: implement exactly that, and for the BGP statement only note it as "not simulated (no BGP)".
- Routing example state column: when a UDR overrides a default route of the same prefix, the default route's `State` becomes `Invalid`. In other subnets that don't have the route table, it stays `Active`. [S5]
- Tie-breaking **between two routes of the same prefix and the same source** (for example two UDRs, which can't exist in one table, or two BGP routes) is `[Unverified]`. Within one route table a prefix can't be duplicated. [S43] Only BGP can produce such a tie, and BGP is not simulated.
- Tie between a UDR and a service-tag UDR: see the exact-match rules above. [S5]

Where the next hop is **Internet** and the destination is an Azure service public IP: traffic goes over the Azure backbone, not the internet, in every region combination. [S5]

### 2.7 The 0.0.0.0/0 route and virtual appliance next hops

Overriding `0.0.0.0/0` [S5]:

- All traffic not matching a longer prefix goes to the specified next hop, including traffic to public IPs of Azure services that do not have a service endpoint.
- If a service endpoint is enabled for a service, its prefixes are longer than `/0`, so that traffic does **not** go to the `/0` next hop.
- You can no longer reach resources in the subnet **directly** from the internet. Inbound traffic must go via the device in the next hop. For a virtual appliance it must: be reachable from the internet, have a public IP, not be blocked by an NSG, and be able to NAT and forward or proxy traffic to the resource and return it.
- Don't associate a route table with a `0.0.0.0/0` route to the **gateway subnet** of a VPN gateway.

Virtual appliance next hop [S5][S42]:

- The next hop IP can be the private IP of a NIC attached to a VM, or the private IP of an Azure internal load balancer.
- A NIC that forwards traffic to an address other than its own must have **Enable IP forwarding** turned on. The Azure setting disables Azure's source and destination check for the NIC.
- IP forwarding is also needed inside the VM operating system. "You might need to enable IP forwarding within the VM's operating system". [S5]
- If the appliance routes to a public IP, it must proxy or NAT to **its own private IP**. Azure then NATs to a public IP. [S5]
- A next hop IP that has no direct connectivity (needs to go through an ExpressRoute gateway or Virtual WAN) is an invalid UDR. [S5]
- Deploy the appliance in a **different subnet** from the traffic sources. Same subnet plus a route table pointing at itself can cause routing loops. [S5]
- If the next hop device is "not running or isn't fully configured", effective routes can show next hop IP `None` for `Virtual network gateway` or `Virtual appliance`. [S5]
- Tutorial: UDR `0.0.0.0/0` to a VM that is not set up to forward: traffic to the internet is dropped. [S36]
- `[Unverified]` Whether the **platform** (not the OS) drops a packet delivered to an appliance NIC whose Azure IP forwarding is off. S42 says IP forwarding "enables a NIC to" forward and S5 says the setting disables the source/destination check. `[Decision]` Report this case as a block with the wording "IP forwarding is disabled on the next hop NIC. Learn: a NIC that forwards traffic to an address other than its own must have it enabled" and label the verdict "Learn does not say explicitly that Azure drops the packet".
- The OS-level forwarding switch and the appliance's own rules are **not simulated**. `[Decision]` Give each NVA VM a user setting "forwards traffic (OS level): yes/no" so the walker can continue or stop. Default yes.

### 2.8 Effect of peering, service endpoints, gateways on routes (summary)

| Feature | Effect on the effective route table | Source |
|---|---|---|
| Peering | Adds a `Virtual network peering` route per remote address range to every subnet. UDRs with the same prefix make it `Invalid`. | [S5][S6] |
| Service endpoint | Adds `VirtualNetworkServiceEndpoint` routes with the service's prefixes to the subnet only. Overrides BGP and UDR for those prefixes. Next hop shown is `VirtualNetworkServiceEndpoint`. | [S5][S21][S20] |
| Gateway | Adds `Virtual network gateway` routes. Disabled per route table by the propagation setting. | [S5] |
| Disable peering route propagation (preview) | Route table property `disablePeeringRoute` (`None` default, `All`) suppresses system peering routes for supported workloads. | [S6] |

---

## 3. VNet peering

### 3.1 Requirements and constraints

- You can peer VNets in the same region or different regions (**global peering**). [S7]
- The VNets must have **non-overlapping** address spaces. "You can't enable virtual network peering if address spaces overlap." [S7][S9]
- A peering is configured on each VNet (two links). Status: **Initiated** after the first link, **Connected** after the second, for both links. "The peering isn't successfully established until the peering status for both virtual network peerings is Connected." [S7][S9]
- **Disconnected**: one of the two links was deleted. Traffic can't flow. You must delete the remaining link and recreate both. [S8][S9]
- `[Conflict]` S7 (portal delete note): "When you delete a virtual network peering from a virtual network, the peering from the remote virtual network is also deleted." S8 and S9 say the remaining link goes to Disconnected. `[Decision]` Model deletion as the S8/S9 behaviour (remaining link becomes Disconnected, user deletes it), since it is the documented state machine. Note the conflict in a comment.
- Peering state values (REST): `Initiated`, `Connected`, `Disconnected`. Sync level values: `FullyInSync`, `RemoteNotInSync`, `LocalNotInSync`, `LocalAndRemoteNotInSync`. [S46]
- After changing a peered VNet's address space, run a **sync**. Without it, traffic might not route correctly and the peering can show Disconnected. [S6][S8] `[Decision]` Not simulated. Treat every peering as in sync.
- You can't move a VNet that is in a peering. [S7][S9]
- A VNet can be peered across subscriptions and Microsoft Entra tenants. [S7][S9] Not relevant to the single-subscription sandbox.
- Can't peer across clouds (public to 21Vianet, etc.). [S7]
- Peering across regions (for example Southeast Asia and East Asia) is allowed. [S7]
- Global peering only: the front-end IP of a **Basic** load balancer (internal or public) in the remote VNet can't be reached. Standard works. [S6][S7][S9] Basic LB and Basic public IP were retired on 2025-09-30, so the sandbox only needs Standard. [S25][S23]
- Peering can't be made as part of a `PUT` VNet operation (global peering constraint). [S6]
- Limits: 650 peerings per VNet. [S44]

### 3.2 Not transitive

"Peerings by themselves aren't transitive." VNet1-VNet2 and VNet2-VNet3 gives no connectivity between VNet1 and VNet3 through VNet2. Options: a direct peering, or an NVA in the hub. [S7] FAQ: "Transitive peering is not supported." [S9]

Service chaining: UDRs can point to a VM IP in a peered VNet, or to a VPN gateway, as the next hop. A UDR next hop can't be an ExpressRoute gateway for VNet-to-VNet routing. [S6]

### 3.3 Link settings and what they control

Portal labels, for the link created on local VNet `vnet-1` (the portal also creates the remote link in the same wizard). [S7]

| Portal label (local settings) | API property | Default | Documented meaning |
|---|---|---|---|
| Allow 'vnet-1' to access the peered virtual network | `allowVirtualNetworkAccess` | Selected (true) | Allows traffic from `vnet-1` to the peered VNet. REST: whether VMs in the local VNet space can access VMs in the remote VNet space. [S7][S46] |
| Allow 'vnet-1' to receive forwarded traffic from the peered virtual network | `allowForwardedTraffic` | Not selected (false) | See below, the direction is described inconsistently. [S7][S46] |
| Allow gateway or route server in 'vnet-1' to forward traffic to the peered virtual network | `allowGatewayTransit` | false | Needs a gateway or route server in `vnet-1`. [S7][S46] |
| Enable 'vnet-1' to use the peered virtual networks' remote gateway or route server | `useRemoteGateways` | false | Only one peering may set it. Can't be set if the VNet already has a gateway. Needs `allowGatewayTransit` on the remote link. [S7][S46][S9] |

- When `Allow ... access` is selected, the `VirtualNetwork` service tag for NSGs includes the VNet and the peered VNet. [S7][S4]
- "If you open full connectivity between peered virtual networks, you can apply network security groups to block or deny specific access. Full connectivity is the default option." NSGs in either VNet can block access. [S6]
- To block traffic temporarily, clear **Allow traffic to remote virtual network** instead of deleting the peering. [S7]
- Gateway transit works for both local and global peering. [S6]
- If two VNets are connected by **both** a peering and a gateway-based VNet-to-VNet connection, traffic flows through the peering. [S6][S7]

`[Conflict]` Direction of **forwarded traffic**. The portal text for `vnet-1`'s link says "Enabling this option allows 'vnet-1' to receive traffic from virtual networks peered to the peered virtual network" [S7] (setting on the receiving side). The REST description says "Whether the forwarded traffic from the VMs in the local virtual network will be allowed/disallowed in remote virtual network." [S46] (setting on the sending side). PLAN.md section 8 already records that the content is deliberately non-directional.
`[Decision]` for the owner. Options: (a) require `allowForwardedTraffic` on **both** links when the packet is forwarded (most conservative, contradicts neither page), or (b) follow the REST meaning. Recommended: (a), with the trace line "Forwarded traffic: Learn describes the direction inconsistently, both links must allow it in the sandbox".

What counts as "forwarded"? `[Unverified]` Learn's example is an NVA in `vnet-2` that forwards traffic that came from outside `vnet-2` (for example from another peered VNet) to `vnet-1`. `[Decision]` Treat a packet as forwarded when the sender into the peering is an NVA hop (the walker came through a VirtualAppliance next hop) and the original source is not in the VNet that sends it across the peering. For the NVA with a **same-VNet source**, the packet is NVA-originated after NAT and counts as normal.

`[Unverified]` Whether the **receiving** VNet's link also needs `allowVirtualNetworkAccess = true` for a connection from A to B. S46 describes the property only for the local-to-remote direction. `[Decision]` A connection from A to B requires the link on A's side (A to B) to allow VNet access. Do not require B's link. Add a trace note "only the source-side link setting is documented".

### 3.4 Gateway transit rules (validation only)

- The VNet that uses a remote gateway can't have its own gateway. A VNet can have only one gateway. [S6][S7]
- `useRemoteGateways` can be on only one of a VNet's peerings. [S9][S46]
- Gateway transit across deployment models is supported if the gateway is in the Resource Manager VNet. [S6]
- The function of the gateway (VPN, ExpressRoute) is "not simulated".

---

## 4. DNS

### 4.1 Azure-provided DNS

- Azure-provided DNS: static IP `168.63.129.16`, doesn't change. Basic authoritative DNS only. [S11][S10]
- The IP is a virtual public IP. It serves DNS (filtered name resolution), DHCP, VM agent, load balancer probes. It isn't subject to UDRs. [S10]
- The IP doesn't support reverse DNS lookup of itself. [S10]
- Hostnames: DNS-compatible only (0-9, a-z, `-`, not starting or ending with `-`). A distinct name for each VM in a VNet. [S11]
- The DNS suffix is `internal.cloudapp.net` for Resource Manager VNets. It can't be modified. A VM gets a short-name and FQDN `[vmname].internal.cloudapp.net`. [S11] (The VNet FAQ also says you can't bring your own suffix. [S9])
- DNS lookup is scoped to a VNet. "DNS names created for one virtual network can't be resolved from other virtual networks." [S11]
- You can't resolve names in peered VNets using default Azure name resolution. Use Azure Private DNS or a custom DNS server. [S7]
- Manual registration of records in Azure-provided DNS isn't allowed. [S11]
- Reverse DNS (PTR) for `[vmname].internal.cloudapp.net` is added when a VM starts and removed when stopped (deallocated). Reverse queries for VMs in a peered VNet return `NXDOMAIN`. [S11]
- DNS query traffic is throttled per VM (not simulated). [S11]

### 4.2 Private DNS zones, VNet links, autoregistration

- Private DNS zone records resolve only from VNets linked to the zone. They aren't resolvable from the internet. [S12]
- Resolution order with **default** VNet DNS settings: private DNS zones linked to the VNet first, then Azure-provided DNS. With a **custom DNS server** on the VNet, the system doesn't automatically query linked private zones. The custom setting overrides the order. [S12]
- To let a custom DNS server resolve a private zone: use an Azure DNS Private Resolver in a linked VNet, or, if the server is a VM, a conditional forwarder to `168.63.129.16`. [S12]
- Link rules: [S13]

| Rule | Source |
|---|---|
| A VNet link has autoregistration on (registration VNet) or off (resolution VNet). | [S13] |
| A zone can have multiple registration VNets. A VNet can have only **one** registration zone. | [S13][S14][S12] |
| A zone can have multiple resolution VNets. A VNet can have multiple resolution zones. | [S13] |
| Only **one link** between a given zone and a given VNet. | [S13] |
| Each link has a unique name within the zone. | [S13] |
| Classic VNets are not supported. | [S13] |
| Deleting a VNet deletes its links and its autoregistered records. | [S13] |

- Limits: 1,000 private zones per subscription; 25,000 record sets per zone; 20 records per record set; 1,000 VNet links per zone; 100 links with autoregistration per zone; a VNet can link to 1 zone with autoregistration and up to 1,000 zones in total. [S12]
- Zone rules: at least **two labels** (single-label zones aren't supported); max 34 labels; no NS delegations inside a private zone (create the child as its own zone instead); a list of reserved names can't be created (for example `azure.com`, `microsoft.com`, `core.windows.net`, `windows.net`, `cloudapp.net`, `trafficmanager.net`). [S12]
- Autoregistration: [S14]
  - Works for **virtual machines only**. Other resources (for example an internal load balancer) need manual records.
  - Creates an A record for the **primary NIC** only.
  - Records are removed when the VM is **deleted or stopped**.
  - A VNet can link to only one zone with autoregistration. Many VNets can link to one zone.
  - No autoregistration of reverse (PTR) records. [S14][S11]
- Private zones are global, so one reverse zone can span VNets (`in-addr.arpa` zones created manually). [S11]
- Private DNS zone with a record for a name that isn't in the zone: the zone answers `NXDOMAIN`, **unless** the link has the fallback-to-internet resolution policy or a manual record is added. [S17]
  `[Unverified]` The exact property name of the fallback setting. S17 says "Fallback to Internet for Private DNS Zone Virtual Network Links". Not enough to name an API field.

### 4.3 Custom DNS servers

- DNS servers can be set per VNet and per NIC. NIC-level servers take precedence over VNet-level servers. [S11]
- If you choose custom DNS you must give at least one IP, otherwise the VNet ignores the setting and uses Azure-provided DNS. [S11]
- A change to the list takes effect after the VMs renew their DHCP lease. [S11][S9] (Sandbox: apply immediately, say so.)
- Up to 20 DNS servers per VNet and per NIC. [S44]
- The DNS server must serve TCP and UDP on port 53 and recursively resolve external names. [S11]
- With a custom DNS server, Azure does not give VMs the `internal.cloudapp.net` suffix. FQDNs are needed. [S11]
- To resolve a VM hostname the DNS server VM must be in the **same** VNet and forward to Azure. [S11]
- With a VPN gateway and custom DNS, `168.63.129.16` must be in the server list for uninterrupted service. [S11]
- Port 53 traffic to custom DNS servers bypasses the NSGs of the subnet and the NIC after custom DNS servers are set on the network. [S11]

### 4.4 Public DNS zones and delegation

- Azure DNS public zones host a domain. You create the zone, create records, retrieve the four Azure name servers, then **delegate** at the registrar by setting NS records. [S15]
- Use all four Azure name servers. Vanity name servers (inside your own zone) are not supported. [S15]
- Public zones aren't region-bound (global). [S15]
- Delegation can take at least 10 minutes to verify. [S15]
- Sandbox: there is no internet, so each public zone carries a user flag `delegated: true/false` (the sandbox can't know registrar state). `[Decision]` A name in an undelegated zone resolves nothing from the "internet". Cloud-scope names (`<label>.<region>.cloudapp.azure.com`) resolve for public IPs with a DNS label. [S23]

### 4.5 Private endpoint DNS

- Azure creates a CNAME in public DNS that redirects the service name to a `privatelink` name. A private DNS zone with that name, linked to the VNet, can override it with the private IP. [S17]
- Recommended zone names (commercial cloud) include: Storage blob `privatelink.blob.core.windows.net` (forwarder zone `blob.core.windows.net`); Storage file `privatelink.file.core.windows.net`; SQL Database `privatelink.database.windows.net`; Key Vault, Cosmos DB and the rest are listed on the page. [S17]
- Don't associate one private zone with private endpoints of two different services (A-records get deleted). [S17]
- The DNS resolution and the network access control are independent. A successful public lookup doesn't prove a private endpoint exists. If public network access is **Disabled**, the service rejects the connection at the front door. [S17]
- Private endpoints work from the same VNet, regionally peered VNets and globally peered VNets, and on-premises over VPN/ExpressRoute. [S18]
- A private DNS zone only helps VNets **linked** to it. A peered VNet that is not linked resolves the public record unless a custom DNS or Private Resolver is used. [S12][S7] (Combination of two documented facts.)

### 4.6 DNS resolution algorithm the sandbox can run

Input: source VM NIC `N` in VNet `V`, name `q`.

1. Choose the DNS server list: NIC custom list if set, else VNet custom list if non-empty, else Azure-provided (`168.63.129.16`). [S11]
2. **Azure-provided path:**
   a. For each private DNS zone linked to `V` whose name is a suffix of `q`, use the longest matching suffix. If it has a record for `q`, return it. If it has no record, return `NXDOMAIN` (or fall through when fallback is set). [S12][S17]
   b. Otherwise, if `q` is a hostname or `<vm>.internal.cloudapp.net` of a VM in `V`, return its private IP (VM must be running). [S11]
   c. Otherwise recurse to public DNS: public IP labels (`*.cloudapp.azure.com`), delegated public zones, Azure CNAME chains for PaaS names. If `q` has a CNAME into a `privatelink` name and step (a) had a matching record it was already returned. [S17][S23][S15] `[Unverified]` Longest-suffix zone selection among several linked zones is not stated by Learn, only that linked zones are queried first. Treat as an implementation choice.
3. **Custom server path:** the query goes to the server IP. The server must be a running VM (or a Private Resolver). Port 53 isn't filtered by NSGs. [S11] If the server has "forwards to Azure" set, resolve as in step 2 **in the context of the server's VNet** (that VNet's linked zones, that VNet's hostnames). If not, only the server's own records apply (user-defined). [S11][S12]
4. Result carries: the server that answered, the zone or rule that matched, and the IP. Name resolution across a peering with default DNS returns "not found". [S7]

---

## 5. Internet connectivity, load balancers, Bastion, endpoints

### 5.1 Default outbound access

What Learn says (page checked 2026-10-27) [S22]:

- If a VM is deployed in a VNet without an explicit outbound method, Azure assigns an outbound public IP. That is **default outbound access**. The IP is owned by Microsoft, can change without notice.
- Explicit outbound methods: NAT gateway on the subnet; backend pool of a Standard LB with outbound rules; backend pool of a basic public LB; VM with an associated public IP.
- **"For the API released after March 31, 2026, new virtual networks default to using private subnets."** VMs in those subnets need an explicit outbound method to reach public endpoints on the internet and within Microsoft. This doesn't change existing VNets.
- For the API version released after March 31, 2026, subnets in new VNets have `defaultOutboundAccess = false` by default. The portal already defaults to private subnets. Earlier API versions keep the earlier default (`null`, which allows default outbound access). Tools that pin an older API (for example Terraform) keep the old behaviour.
- Existing VNets and new VMs in them keep default outbound access unless the subnet is changed to private.
- You can still create non-private subnets with any method (portal, CLI, PowerShell, ARM).
- Changing a subnet between private and non-private needs existing VMs to be **stopped and deallocated** to take effect on their NICs.
- A default outbound IP can still be assigned in a non-private subnet even if an explicit method exists. The VM doesn't use it for egress unless the explicit method is removed.
- Default outbound IPs don't support ICMP pings and fragmented packets.
- Limits of private subnets: Windows activation and updates need an explicit method. **UDR routes with next hop `Internet` break in a private subnet** (unless an explicit method also exists). This doesn't apply to service endpoints. **VMs can still reach Azure Storage in the same region** from a private subnet without an explicit method. Private subnets don't apply to delegated or managed subnets.
- A load balancer backend pool configured **by IP address** uses default outbound access due to a known issue. [S22]
- Flexible-orchestration VM Scale Sets are secure by default (no default outbound IP). [S22]
- S24 summarises: "On March 31, 2026, new virtual networks default to using private subnets." and lists outbound methods in priority order: [S24]

| # | Method | Port allocation | Production | Source |
|---|---|---|---|---|
| 1 | NAT gateway on the subnet | Dynamic, explicit | Yes | [S24] |
| 2 | Public IP on the VM NIC | Static, explicit | Yes | [S24] |
| 3 | Load balancer frontend via outbound rules | Static, explicit | Yes, not at scale | [S24] |
| 4 | Load balancer frontend without outbound rules | Static, implicit | No | [S24] |
| 5 | Default outbound access | Implicit | No | [S24] |

- NAT gateway takes precedence over other methods, including the LB, instance public IPs and Azure Firewall. A public IP on a VM NIC takes precedence over the rest except NAT gateway. [S24]

`[Conflict]` (wording) S22 says the default changes for "the API version released after March 31, 2026". S24 says "On March 31, 2026, new virtual networks default to using private subnets". `[Decision]` Sandbox VNets default `defaultOutboundAccess=false` (the sandbox is always "the current API"). Provide a "legacy API behaviour" toggle on the subnet to set it to `null`. Show the Learn note in the create form.

### 5.2 Outbound to the internet: what must be true

For a VM to open a TCP connection to a public IP `X`:

1. NSG outbound layers allow it (the default `AllowInternetOutBound` allows). [S1]
2. The effective route for `X` is `Internet` (the system default), or a UDR/BGP route sends it to an appliance that does. [S5]
3. The subnet has an explicit outbound method, or `defaultOutboundAccess` is not `false`. [S22]
4. Exception: destination is Azure Storage in the same region and the subnet is private: still allowed. [S22]
5. The egress IP the destination sees: NAT gateway IPs, else the VM's public IP, else the LB frontend IP(s) from outbound rules (any of them), else the implicit LB IP or default outbound IP. [S24]

Egress details:

- A public IP on a VM NIC: SNAT isn't used. It is a stateless 1:1 NAT. All ephemeral ports are available. [S24]
- When no public IP, Azure assigns a dynamic outbound IP. It isn't dedicated and can change. [S23]
- Public IP SKUs: **Basic public IPs were retired on 2025-09-30**. Standard is static only, **closed to inbound by default** (an NSG must allow). Basic was open by default. Standard v2 can only be used with the Standard v2 NAT gateway. [S23] `[Decision]` The sandbox supports only Standard v1 public IPs and shows a note about Basic.
- Standard public IP: idle timeout for inbound-originated flows 4 to 30 minutes (default 4); outbound-originated 4 minutes fixed. [S23] (Not simulated.)

### 5.3 Inbound from the internet

For an internet client to open a connection to a VM:

1. A public IP is associated with the VM NIC (or the destination is a public load balancer frontend that has a rule to the VM). [S23][S26]
2. With a Standard public IP the destination is **closed by default**: an NSG on the subnet or NIC must allow the traffic. No NSG means blocked. [S2][S23][S25]
3. Where NSGs exist: subnet NSG first, then NIC NSG, both must allow; the rule destination is the VM's private IP (post-translation). [S1][S2]
4. The OS firewall isn't simulated. [S33]

Load balancer basics [S26][S25]:

- Frontend IP configuration: public IP = public LB, private IP = internal LB. An internal LB can't accept traffic from the internet. Standard SKU only (Basic is retired). [S26]
- Backend pool: VMs or VMSS in a single VNet. A load balancer rule can't span two VNets. [S26]
- Load balancer rules (frontend IP + port to backend IPs + port) apply to inbound traffic only. Inbound NAT rules forward a frontend port to one VM. [S26]
- Health probes: TCP, HTTP, HTTPS. Probes come from `168.63.129.16`. The default NSG rule `AllowAzureLoadBalancerInBound` allows them. If blocked, the probes fail. [S10][S26]
- Standard LB and public IPs are closed to inbound by default. NSGs must explicitly allow the traffic. "Traffic is blocked if no NSG exists on a subnet or NIC." [S25]
- Load balancing rules and inbound NAT rules don't support ICMP (except internal Standard LB with HA ports). [S26]
- Outbound flow from a backend VM to the frontend of an **internal** LB in the same pool fails. [S26]
- An LB backend pool can't contain a private endpoint. [S26]
- Outbound rules, SNAT: outbound rules define SNAT for a Standard public LB. Each frontend IP has about 64,000 SNAT ports. With default allocation, ports per VM are 1,024 for pools of 1-50, 512 for 51-100, and so on. [S24] Port exhaustion is "not simulated".
- NSG source for LB traffic is the original client IP (pass-through). [S1]

### 5.4 Service endpoints vs private endpoints

| Aspect | Service endpoint | Private endpoint |
|---|---|---|
| What it is | A subnet setting that extends the VNet identity to the service. Traffic goes over the Azure backbone. [S21] | A NIC with a private IP from your subnet that maps to one resource and subresource. [S18] |
| Destination address | Remains the service's **public** IP. DNS is unchanged and still returns public IPs. [S21][S20] | A **private** IP in the VNet. DNS must resolve to it. [S20][S18] |
| Route effect | Adds `VirtualNetworkServiceEndpoint` routes (service prefixes) to that subnet only. Overrides BGP and UDR for those prefixes. [S5][S21] | `/32` route to the endpoint IP, propagated by the endpoint. A UDR can override it only if network policies for UDR are enabled and the UDR prefix is equal to or smaller than the VNet address space (`0.0.0.0/0` can't). [S19] |
| Source IP the **service** sees | Switches from the VM's public IPv4 to the VNet **private** IP for service traffic from that subnet. Existing open TCP connections close during the switch. Firewall rules on the service using public IPs stop working. [S21][S9] | `[Unverified]` for PaaS targets. Learn says Private Link **service** (provider side) sees the consumer traffic as the **NAT IP** from the provider's chosen subnet. [S20] |
| NSG | NSG outbound must allow it. The default `AllowInternetOutBound` and `Storage` style service tags both work. [S21][S9] | NSG and UDR apply to the endpoint only if **network policies** are enabled on the subnet (`privateEndpointNetworkPolicies`: `Disabled` default, `NetworkSecurityGroupEnabled`, `RouteTableEnabled`, `Enabled`). [S19][S20] |
| Protocol | TCP only. ICMP from the subnet doesn't take the endpoint path. [S9] | Not stated per protocol. |
| Access control | Needs a **virtual network rule** on the service (VNet ACL). Access from outside returns HTTP 403 or 404. Enable on each subnet separately for peered VNets. [S21][S9] | Connection status must be **Approved**. Only approved endpoints send traffic. Public network access on the service is a separate setting. [S18][S17] |
| On-premises | Not reachable by default (needs the NAT IP in the IP firewall). [S21] | Reachable through VPN or ExpressRoute. [S18] |
| Direction | n/a | Connections can only be started by the client. The provider can't connect in. [S18] |
| Region | Azure SQL needs same region. Others can cross region. [S21] | The endpoint must be in the same region and subscription as the VNet. The resource can be in another region. [S18] |
| Limits | No limit on endpoints per VNet. Service-side VNet rule limits (Storage 200, SQL 128, Key Vault 200, Cosmos DB 64, Event Hubs 128, Service Bus 128). [S21][S9] | 1,000 per VNet, 4,000 across peered VNets, 64,000 per subscription. [S44] |

- Private Link is the recommended option over service endpoints. [S21][S24]
- A subnet that hosts private endpoints: effective routes and security rules aren't displayed for the private endpoint NIC. [S18]
- "Outbound traffic denied from a private endpoint isn't a valid scenario, as the service provider can't originate traffic." [S18]
- Traffic through an NVA to a private endpoint: SNAT is recommended for return traffic. [S18]

### 5.5 Bastion

- Basic, Standard and Premium need a dedicated subnet named `AzureBastionSubnet`, `/26` or larger, in the same VNet and resource group as the bastion host, with no other resources. [S28]
- They also need a public IP: SKU **Standard**, allocation **Static**. Premium can be private-only without a public IP. Developer SKU uses shared infrastructure with no VNet needed and supports one VM at a time. [S27][S28]
- Bastion reaches VMs by **private IP** over TLS on port 443 from the portal side; VMs need no public IP. [S27]
- Default ports to the VM are 3389 (RDP) and 22 (SSH). Custom ports need Standard or higher. [S28]
- Peering: "use virtual network peering to serve multiple networks". [S27]
- If an NSG is on `AzureBastionSubnet` the full rule set is required (inbound 443 from `Internet`, 443 from `GatewayManager`, 8080 and 5701 `VirtualNetwork` to `VirtualNetwork`, 443 from `AzureLoadBalancer`; outbound 22 and 3389 to `VirtualNetwork`, 443 to `AzureCloud`, 8080 and 5701 `VirtualNetwork` to `VirtualNetwork`, 80 to `Internet`). [S29]
- The target VM subnet's NSG must allow inbound 22/3389 (or the custom ports) from the AzureBastionSubnet range. "Without this rule, Bastion can't reach your VMs even when it's correctly configured." [S29]

Sandbox model: "Can Bastion reach VM on 22/3389" is the same algorithm as any VM-to-VM check, with source = the Bastion subnet and the bastion-subnet NSG rules above checked as a configuration validation. Bastion data-plane details are not simulated.

---

## 6. Network Watcher diagnostics (what the sandbox trace should resemble)

### 6.1 IP flow verify

What it does [S30]:

- Checks whether a packet is allowed or denied **to or from a VM** based on NSG rules and Azure Virtual Network Manager admin rules. It looks at all NSGs applied to the NIC, whether they are on the subnet or on the NIC.
- Inputs: direction, protocol, local IP, remote IP, local port, remote port.
- Outputs: Access denied or allowed, the name of the rule, the NSG with a link. No link when a **default** rule decided.
- Only tests **TCP and UDP** (ICMP needs NSG diagnostics). Only the NIC's rules (not VMSS, use NSG diagnostics).
- It does **not** do routing, DNS or peering checks. [S30]
- The VM must be running. "Stopped virtual machines aren't available to select". [S31]

REST request fields: `direction` (`Inbound`/`Outbound`), `localIPAddress`, `localPort`, `remoteIPAddress`, `remotePort`, `protocol` (`TCP`/`UDP`), `targetResourceId`, optional `targetNicResourceId`. [S34]

REST response: [S34]

```json
{
  "access": "Allow",
  "ruleName": "Rule1"
}
```

`ruleName`: "Name of the rule. If input is not matched against any security rule, it is not displayed." [S34] (The sample value `Rule1` is a placeholder.)

Real output examples (PowerShell and CLI table) [S32][S33]:

```text
Access RuleName
------ --------
Allow  defaultSecurityRules/AllowInternetOutBound
Allow  defaultSecurityRules/AllowVnetOutBound
Deny   defaultSecurityRules/DenyAllOutBound
Deny   defaultSecurityRules/DenyAllInBound
```

- These four lines come from four calls: outbound to `13.107.21.200:80`, outbound to `10.0.1.10:80`, outbound to `10.10.10.10:80`, inbound from `10.10.10.10:60000` to local port 80. The VM is `10.0.0.4` in `10.0.0.0/16`, local port 60000. [S32]
- CLI form: `az network watcher test-ip-flow --direction outbound --protocol TCP --local 10.0.0.4:60000 --remote 13.107.21.200:80 --vm myVM --nic myVmVMNic --resource-group myResourceGroup --out table`. PowerShell: `Test-AzNetworkWatcherIPFlow -Direction Outbound -Protocol TCP -RemoteIPAddress ... -RemotePort ... -LocalIPAddress ... -LocalPort ...`. [S33][S32]
- For custom rules the name is `securityRules/<rule name>` in effective-rule output (see 6.4). `[Unverified]` whether IP flow verify prints the `securityRules/` prefix for custom rules. Learn shows only `defaultSecurityRules/...` in tool output. Use the prefixed form in the trace.

### 6.2 Next hop

What it does: gives the next hop **type**, IP address and route table ID of a destination IP. If a UDR decided, it returns that route table; otherwise `System Route`. [S35]

REST request fields: `sourceIPAddress`, `destinationIPAddress`, `targetResourceId`, optional `targetNicResourceId` (needed if the VM has several NICs and IP forwarding on any). [S39]

REST response: [S39]

```json
{
  "nextHopIpAddress": "10.0.0.1",
  "nextHopType": "VnetLocal",
  "routeTableId": "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg2/providers/Microsoft.Network/routeTables/rt1"
}
```

`routeTableId`: "the resource identifier for the route table associated with the route being returned. If the route being returned does not correspond to any user created routes then this field will be the string 'System Route'." [S39]

Next hop types: the overview page lists `Internet`, `VirtualAppliance`, `VirtualNetworkGateway`, `VirtualNetwork`, `VirtualNetworkPeering`, `VirtualNetworkServiceEndpoint`, `MicrosoftEdge`, `None`. [S35] The REST enum lists `Internet`, `VirtualAppliance`, `VirtualNetworkGateway`, `VnetLocal`, `HyperNetGateway`, `VirtualApplianceEcmp`, `None`. [S39] `[Conflict]` (naming). The sandbox emits `VnetLocal`, `VirtualNetworkPeering`, `VirtualNetworkServiceEndpoint`, `Internet`, `VirtualAppliance`, `VirtualNetworkGateway`, `None`.

Examples [S36][S37][S38]:

| Destination (VM in 10.0.0.0/16 at 10.0.0.4) | nextHopType | routeTableId |
|---|---|---|
| `13.107.21.200` | Internet | System Route |
| `10.0.0.5` (in VNet) | VirtualNetwork (portal) / VnetLocal (API) | System Route |
| `10.1.0.5` (private, not in VNet) | None | System Route |
| `172.31.0.100` (private, not in VNet) | None | System Route |

CLI: `az network watcher show-next-hop --dest-ip 13.107.21.200 --source-ip 10.0.0.4 --vm myVm --nic myVmVMNic --out table`. PowerShell: `Get-AzNetworkWatcherNextHop -NetworkWatcher $nw -TargetVirtualMachineId $vm.Id -SourceIPAddress 192.168.1.4 -DestinationIPAddress 13.107.21.200`. Output has `NextHopType`, `NextHopIpAddress`, `RouteTableId`. [S38][S37]

### 6.3 Effective routes

Source: NIC of a **running** VM. Combines created route tables, default routes and BGP routes. [S43] `az network nic show-effective-route-table`, PowerShell `Get-AzEffectiveRouteTable`, REST `POST .../networkInterfaces/{nic}/effectiveRouteTable`. [S38][S37][S40]

Fields of one effective route: [S40]

| Field | Meaning |
|---|---|
| `name` | Name of the UDR. Optional (null for system routes). |
| `source` | `Default`, `User`, `VirtualNetworkGateway`, `Unknown`. |
| `state` | `Active` or `Invalid`. |
| `addressPrefix` | Array of CIDR strings. |
| `nextHopType` | `VnetLocal`, `Internet`, `VirtualAppliance`, `VirtualNetworkGateway`, `None` (and `VirtualApplianceEcmp`). |
| `nextHopIpAddress` | Array of IPs (empty for system routes). |
| `disableBgpRoutePropagation` | `true` if gateway routes are not propagated. |

PowerShell table example (from S37):

```text
Name State  Source  AddressPrefix           NextHopType NextHopIpAddress
---- -----  ------  -------------           ----------- ----------------
     Active Default {192.168.0.0/16}        VnetLocal   {}
     Active Default {0.0.0.0/0}             Internet    {}
     Active Default {10.0.0.0/8}            None        {}
     Active Default {100.64.0.0/10}         None        {}
     Active Default {172.16.0.0/12}         None        {}
```

JSON example (CLI, S38):

```json
{
  "additionalProperties": { "disableBgpRoutePropagation": false },
  "addressPrefix": ["0.0.0.0/0"],
  "name": null,
  "nextHopIpAddress": [],
  "nextHopType": "Internet",
  "source": "Default",
  "state": "Active"
}
```

The REST enum for `nextHopType` in effective routes doesn't list `VirtualNetworkPeering` or `VirtualNetworkServiceEndpoint`. [S40] Yet S5, S6 and S21 say effective routes show them for peering and endpoints (for example "Has a nextHopType of VirtualNetworkServiceEndpoint"). [S21] `[Conflict]` (reference enum incomplete). Use the names from S5/S21.

A routing example table with `ID, Source, State, Address prefixes, Next hop type, Next hop IP address, UDR name` is in S5 (12 rows). It is the best template for the portal-style effective-routes view. [S5]

### 6.4 Effective security rules

CLI `az network nic list-effective-nsg`, PowerShell `Get-AzEffectiveNetworkSecurityGroup`, REST `POST .../effectiveNetworkSecurityGroups`. [S33][S32][S41]

Structure [S41]:

- `value[]` has one entry per NSG that applies to the NIC:
  - `association`: `networkInterface.id`, `subnet.id`, `networkManager.id` (whichever applies).
  - `networkSecurityGroup.id`.
  - `effectiveSecurityRules[]`.
  - `tagMap`: mapping of tags to lists of IP addresses included in the tag.
- Each effective rule: `name`, `access`, `direction`, `priority`, `protocol` (`Tcp`, `Udp`, `All`), `sourceAddressPrefix`, `sourceAddressPrefixes[]`, `destinationAddressPrefix`, `destinationAddressPrefixes[]`, `sourcePortRange`, `sourcePortRanges[]`, `destinationPortRange`, `destinationPortRanges[]`, `expandedSourceAddressPrefix[]`, `expandedDestinationAddressPrefix[]`.
- Names: custom rules are `securityRules/<name>`, defaults are `defaultSecurityRules/<name>`. [S41]
- Port format `"3389-3389"`, `"0-65535"`. Protocol Any shows as `All`. [S41][S32]
- `destinationAddressPrefixes` values: CIDRs, default tags (`VirtualNetwork`, `AzureLoadBalancer`, `Internet`), system tags, `*`. [S41]

Example (default rule, S33):

```json
{
  "access": "Allow",
  "destinationAddressPrefix": "Internet",
  "destinationAddressPrefixes": ["Internet"],
  "destinationPortRange": "0-65535",
  "destinationPortRanges": ["0-65535"],
  "direction": "Outbound",
  "expandedDestinationAddressPrefix": ["1.0.0.0/8", "2.0.0.0/7", "..."],
  "name": "defaultSecurityRules/AllowInternetOutBound",
  "priority": 65001,
  "protocol": "All",
  "sourceAddressPrefix": "0.0.0.0/0",
  "sourceAddressPrefixes": ["0.0.0.0/0", "0.0.0.0/0"],
  "sourcePortRange": "0-65535",
  "sourcePortRanges": ["0-65535"]
}
```

Example custom rule (REST sample, S41): `name: "securityRules/default-allow-rdp"`, `access: Allow`, `direction: Inbound`, `priority: 1000`, `protocol: Tcp`, `sourceAddressPrefix: "1.1.1.1/32"`, `destinationAddressPrefix: "0.0.0.0/0"`, `destinationPortRange: "3389-3389"`, `sourcePortRange: "0-65535"`.

Other facts: effective security rules aren't shown for a private endpoint NIC. [S18] The NSG overview also names **NSG diagnostics** as the tool for ICMP, VMSS and Application Gateway checks. [S30][S45] `[Unverified]` NSG diagnostics output shape (the overview page doesn't give it).

### 6.5 Suggested trace shape (derived, not from Learn)

The sandbox trace is a list of hops. Each hop entry copies Learn's field names so the output feels familiar:

```text
1. DNS            name -> 10.1.0.4   (zone contoso.internal, link vnet-hub)
2. Egress NSG     nic nsg-app-nic   Allow  securityRules/allow-https-out        priority 200
3. Egress NSG     subnet nsg-app    Allow  defaultSecurityRules/AllowVnetOutBound   priority 65000
4. Next hop       nextHopType=VirtualNetworkPeering  nextHopIpAddress=  routeTableId=System Route
5. Peering        vnet-app-to-vnet-hub  state=Connected  allowVirtualNetworkAccess=true
6. Ingress NSG    subnet nsg-hub    Deny   securityRules/deny-443-from-app      priority 150   <-- decided
RESULT: Not reachable. Blocked by securityRules/deny-443-from-app in nsg-hub (Inbound, subnet).
```

---

## 7. The reachability algorithm

### 7.1 Algorithm (documented behaviours only)

Inputs: source (VM NIC, or `Internet` for inbound tests), destination (IP or name), protocol (`TCP` for v1, `UDP`; `ICMP` is out of v1), destination port, source port (use 60000, as the Learn examples do [S32], or `*`).

Output: `reachable | not reachable | not simulated`, a trace, and the **first deciding** item.

**Step 0. Preconditions.**
a. Source VM exists and is running. Stopped VMs aren't testable in Network Watcher and have no effective routes. [S31][S43]
b. Destination VM exists, is running, and has a private IP (or the destination is a public IP).
c. Protocol is TCP or UDP for NSG tests. ICMP: mark not simulated. [S30]

**Step 1. Resolve the destination.** If the target is a name, run the DNS algorithm (section 4.6) from the source NIC. `NXDOMAIN` ends the check with "name did not resolve" and the step that decided. If the answer is a private endpoint IP or any IP, continue with it.

**Step 2. Classify the destination IP** against the source subnet's effective routes (step 4 needs the route anyway). Do steps 3 and 4 in the order documented for outbound: NIC NSG, subnet NSG, then routing. [S2][S9]

**Step 3. Evaluate outbound NSGs at the source.** In this order: NIC-level NSG (if any), then subnet-level NSG (if any). [S2] For each NSG:
1. Collect rules with `direction = Outbound`; add the three default outbound rules. [S1]
2. Sort by priority ascending. [S1]
3. For each rule, test the five-tuple: source IP (private IP of the NIC), source port, destination IP, destination port, protocol. Expand service tags (section 1.5) and ASG membership (section 1.6). [S1][S3]
4. The first matching rule decides. Stop. [S1]
5. `Deny` ends the check: "blocked at outbound NSG X by rule Y". `Allow` goes to the next NSG layer.
6. No NSG at a layer: skip it and print "no NSG at this layer". [S47]

**Step 4. Build the effective route table for the source subnet and pick a route.** [S5]
1. Start with the system routes (section 2.2) for each VNet address range.
2. Add a `Virtual network peering` route for each address range of each peer VNet whose link is `Connected`. [S5][S8]
3. Add `VirtualNetworkServiceEndpoint` routes for each service endpoint on the subnet. [S5]
4. Add the UDRs of the associated route table. A UDR with the same prefix as a default route makes the default `Invalid`. [S5]
5. Pick the longest prefix containing the destination. On a tie, UDR over BGP over system. [S5]
6. Evaluate the next hop:

| Next hop type | What the walker does | Source |
|---|---|---|
| `VnetLocal` | The destination must be in a VNet address range, delivered inside the VNet. Go to step 6. If no VM or NIC has that IP: report "no resource at that address". `[Unverified]` Learn doesn't state what the platform does. | [S5] |
| `VirtualNetworkPeering` | Go to step 5. | [S5][S7] |
| `Internet` | Go to step 7 (internet path). | [S5] |
| `VirtualAppliance` | Next hop IP must match a NIC in the same VNet or a peered VNet that is reachable by steps 3 to 6 in turn. Check IP forwarding on that NIC (section 2.7). Then treat the appliance as a new source (its own NSGs, its own effective routes) and loop to step 3 with the same destination. Limit hops to 8, stop on a repeated (subnet, destination) pair and report "routing loop". | [S5][S42] |
| `VirtualNetworkGateway` | Stop with `not simulated` (VPN or ExpressRoute gateway). The trace says "traffic would go to the virtual network gateway". | [S5] |
| `VirtualNetworkServiceEndpoint` | Go to step 8. | [S21] |
| `None` | Stop: "dropped by next hop type None" and show the route that decided. | [S5][S36] |

**Step 5. Peering hop.** [S7][S46]
1. Find the link from the source VNet to the destination VNet and the reverse link. Both must exist and be `Connected`. Otherwise stop with the state (`Initiated` or `Disconnected`). [S8]
2. The source-side link must have `allowVirtualNetworkAccess = true`. `[Unverified]` that the other side is also checked. [S7][S46]
3. If the packet is **forwarded** (it came through an NVA hop and its original source isn't in the sending VNet), the rule in section 3.3 applies. `[Decision]`
4. Non-transitive: the destination VNet must be a **direct** peer. If the destination is in a VNet that is only peered with the peer, no route exists for it, so step 4 already selected a different route (system `0.0.0.0/0` or a UDR). [S7]
5. Continue to step 6.

**Step 6. Evaluate inbound NSGs at the destination.** In this order: subnet-level NSG (if any), then NIC-level NSG (if any). [S2][S9] Same sorting and matching as step 3 with `direction = Inbound`. The source IP seen is the packet's source IP. `[Unverified]` Learn doesn't say whether an NVA NATs, so the source seen is a property of the NVA (default: **no NAT**, so the original source address is kept) `[Decision]`. A VirtualNetwork-tag match for a peered source needs `allowVirtualNetworkAccess` as in section 3.3. [S4][S7] Intra-subnet traffic uses the same two steps. [S2] The walk ends with `reachable` if all layers allow. Stateful return traffic isn't evaluated. [S1]

**Step 7. Internet path.**
- Outbound to a public IP: require an explicit outbound method or `defaultOutboundAccess != false` (section 5.2). Exception: Storage in the same region. If none, stop with "no outbound path (private subnet, no explicit method)". [S22]
- If the destination is a public IP of a VM in the sandbox: apply the inbound rules of section 5.3 (public IP associated, NSG layers, Standard secure-by-default).
- If the destination is a name that resolves to a public IP of a service: reachable at the network level; service firewall is a service setting (step 8).

**Step 8. Service endpoint and PaaS service firewall.** [S21][S18][S17]
1. Service endpoint path: the subnet must have an endpoint for that service, the NSG allowed it in step 3, then the **service's VNet rule** must include the subnet, else HTTP 403/404. [S9]
2. Private endpoint path: the endpoint must be `Approved`. Network policies matter for NSG and UDR on the endpoint subnet (section 5.4). If the endpoint subnet has policies disabled, skip NSG evaluation at the endpoint subnet and print "network policies disabled on subnet, NSG not applied to the private endpoint". [S19]
3. Public network access disabled on the resource and the path is public: stop "service rejects at the front door". [S17]

**Step 9. Report.** Return the deciding hop and rule (rule name, priority, direction, layer, NSG, subnet), plus the trace.

### 7.2 Things the sandbox should declare "not simulated"

| Item | Why | Source |
|---|---|---|
| SNAT port exhaustion, SNAT port allocation | Depends on live connection counts. Learn gives tables but exhaustion is a runtime event. | [S24] |
| NAT gateway internals | Only its presence and the egress IP can be shown. | [S24] |
| ExpressRoute (circuits, gateways, private peering) | Needs real circuits and BGP. | [S5][S6] |
| VPN Gateway (S2S, P2S, VNet-to-VNet) | Needs real tunnels, IPsec and BGP. Gateway transit is validated but doesn't carry traffic. | [S5][S7] |
| BGP and learned routes, ECMP, `VirtualApplianceEcmp` | Needs live peers. Tie-breaking among BGP routes isn't documented. | [S5][S40] |
| Azure Firewall rule processing | Not documented in the pages used here. The firewall is a next hop only, and needs its own rule engine and docs. | [S5][S4] |
| Azure Virtual Network Manager (security admin rules, connectivity configs, routing config) | Evaluated before NSG in a separate system. | [S1][S6] |
| Application Gateway, WAF, Front Door, Traffic Manager | Layer 7 and global services. | [S4][S16] |
| Route Server, Virtual WAN | Out of scope. | [S5] |
| Subnet peering, disable peering route propagation (preview), service endpoint policies, standard service endpoint (preview) | Preview or advanced. | [S6][S21] |
| DNS Private Resolver and DNS Resolver Policy | Separate service. The sandbox only models "custom DNS server forwards to Azure: yes/no". | [S12][S16] |
| DNS throttling, client caching, TTL, DHCP lease renew | Runtime and OS behaviour. | [S11] |
| OS firewall, appliance rules, OS-level IP forwarding | Not in Azure. The sandbox has a user flag for NVA forwarding. | [S5][S33] |
| NSG flow logs, VNet flow logs, flow timeout | Logging and timing. | [S1] |
| Idle timeouts, MTU, fragmentation, bandwidth | Runtime. | [S23][S24][S22] |
| Outbound port 25 policy by subscription type, KMS (1688), Windows activation and updates | Depends on the offer type and OS. | [S1][S22] |
| ICMP behaviour | IP flow verify tests TCP and UDP only. Service endpoints don't carry ICMP. Default outbound IPs don't support ICMP. Mark ICMP "limited". | [S30][S9][S22] |
| IPv6 | Large extra rule surface. | [S23] |
| Classic deployment model | Retired path. | [S5][S13] |
| Multicast, broadcast, GRE, IP-in-IP | Blocked in VNets. | [S9] |
| Reverse DNS (PTR) beyond the stated NXDOMAIN-for-peers rule | Optional. | [S11] |
| Private Link service (provider side), Private Link service NAT IP | v1 handles private endpoints to PaaS. | [S20] |
| Cross-subscription and cross-tenant effects | Single subscription sandbox. | [S7] |
| Cloud boundaries (Government, China) | Public cloud only. | [S7] |

---

## 8. What I could not verify, and where Learn disagrees

### 8.1 Not stated by Learn (do not invent)

1. Exact `Internet` tag membership (only a truncated sample). Section 1.5.
2. What `VirtualNetwork` contains when UDRs have broad prefixes. Section 1.5.
3. Whether the platform itself drops a packet delivered to a NIC with IP forwarding off. Section 2.7.
4. Tie-breaking between two BGP routes with the same prefix. Section 2.6.
5. Whether the **remote** peering link also gates a connection from the local side. Section 3.3.
6. What "forwarded traffic" means exactly, and which link carries the setting. Section 3.3.
7. Source IP seen by the destination NSG after an NVA (NAT or not). Step 6.
8. The IP a PaaS service sees over a private endpoint. Section 5.4. (Learn does say it for a Private Link **service**.)
9. Longest-suffix selection among several linked private DNS zones. Section 4.6.
10. `securityRules/` prefix in IP flow verify output for custom rules. Section 6.1.
11. NSG diagnostics output shape. Section 6.4.
12. Prefixed spelling of inbound default rule names in tool output. Section 1.2.
13. What the platform returns when the destination IP inside a VNet range has no resource. Step 4.
14. How the "includes but isn't the same" reserved-prefix sentence should be read (a reading is given). Section 2.2.
15. API property name for private DNS "fallback to internet". Section 4.2.
16. NSG evaluation for VNet-internal traffic when neither subnet nor NIC has an NSG. S47 says all allowed, S2 only states the internet case. Section 1.4.

### 8.2 Learn pages that disagree

| # | Topic | Page A | Page B | Choice |
|---|---|---|---|---|
| 1 | No NSG, inbound | S2: blocked (Standard public IP VM) | S47: all traffic allowed | Block only internet to Standard public IP / Standard LB. Section 1.4. |
| 2 | Multiple ASGs in one rule | S1: can't | S44, S48: up to 10 | Allow up to 10. Section 1.7. |
| 3 | UDR limit per route table | S5: 400 (1,000 with AVNM) | S44: 1,000 | Pick one. Section 2.4. |
| 4 | Next hop name for VNet | S36 portal: VirtualNetwork | S39: VnetLocal | Emit `VnetLocal`. Section 6.2. |
| 5 | Which side "allow forwarded traffic" belongs to | S7 portal text | S46 REST | Require both. Section 3.3. |
| 6 | Deleting one peering link | S7: deletes the remote link too | S8, S9: remote becomes Disconnected | Disconnected. Section 3.1. |
| 7 | System routes preferred "even if BGP is more specific" | S5 note | S5 routing example, where UDRs override same-prefix default routes | Same prefix: UDR wins. Section 2.6. |
| 8 | Number of default routes in effective output | S5: ten | S37, S40: six | Model ten, show six. Section 2.2. |
| 9 | Date and wording of private-subnet default | S22: "API released after 2026-03-31" | S24: "On March 31, 2026" | Sandbox default is private, toggle for legacy. Section 5.1. |
| 10 | Effective route next hop enum | S40: no peering or service endpoint values | S5, S21: they appear | Use S5/S21 names. Section 6.3. |
| 11 | Rule-name case | S1 vs S32 | | Use S32 casing. Section 1.2. |

### 8.3 Things deliberately left out of the sandbox because they changed recently

- Basic SKU public IPs and Basic Load Balancer are retired (2025-09-30). [S23][S25]
- NSG flow logs retire 2027-09-30; VNet flow logs replace them. [S1] Not simulated either way.
- "Default outbound access" is changing for new VNets (section 5.1).

---

## 9. Source list (all accessed 2026-10-27)

| ID | Title (Learn) | URL |
|---|---|---|
| S1 | Azure network security groups overview | https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview |
| S2 | How network security groups filter network traffic | https://learn.microsoft.com/en-us/azure/virtual-network/network-security-group-how-it-works |
| S3 | Application security groups overview | https://learn.microsoft.com/en-us/azure/virtual-network/application-security-groups |
| S4 | Azure service tags overview | https://learn.microsoft.com/en-us/azure/virtual-network/service-tags-overview |
| S5 | Azure virtual network traffic routing | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-udr-overview |
| S6 | Virtual network peering | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-peering-overview |
| S7 | Create, change, or delete a virtual network peering | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-manage-peering |
| S8 | Troubleshoot virtual network peering issues | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-troubleshoot-peering-issues |
| S9 | Azure Virtual Network FAQ | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq |
| S10 | What is IP address 168.63.129.16 | https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16 |
| S11 | Name resolution for resources in Azure virtual networks | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-networks-name-resolution-for-vms-and-role-instances |
| S12 | Azure Private DNS zone overview | https://learn.microsoft.com/en-us/azure/dns/private-dns-privatednszone |
| S13 | Virtual network links for private DNS zones | https://learn.microsoft.com/en-us/azure/dns/private-dns-virtual-network-links |
| S14 | Autoregistration in private DNS zones | https://learn.microsoft.com/en-us/azure/dns/private-dns-autoregistration |
| S15 | Tutorial: host your domain in Azure DNS (delegation) | https://learn.microsoft.com/en-us/azure/dns/dns-delegate-domain-azure-dns |
| S16 | Azure DNS overview | https://learn.microsoft.com/en-us/azure/dns/dns-overview |
| S17 | Private endpoint private DNS zone values | https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-dns |
| S18 | What is a private endpoint | https://learn.microsoft.com/en-us/azure/private-link/private-endpoint-overview |
| S19 | Manage network policies for private endpoints | https://learn.microsoft.com/en-us/azure/private-link/disable-private-endpoint-network-policy |
| S20 | Azure Private Link FAQ | https://learn.microsoft.com/en-us/azure/private-link/private-link-faq |
| S21 | Virtual network service endpoints | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-service-endpoints-overview |
| S22 | Default outbound access in Azure | https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/default-outbound-access |
| S23 | Public IP addresses in Azure | https://learn.microsoft.com/en-us/azure/virtual-network/ip-services/public-ip-addresses |
| S24 | SNAT for outbound connections (Load Balancer) | https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-outbound-connections |
| S25 | What is Azure Load Balancer | https://learn.microsoft.com/en-us/azure/load-balancer/load-balancer-overview |
| S26 | Azure Load Balancer components | https://learn.microsoft.com/en-us/azure/load-balancer/components |
| S27 | What is Azure Bastion | https://learn.microsoft.com/en-us/azure/bastion/bastion-overview |
| S28 | About Azure Bastion configuration settings | https://learn.microsoft.com/en-us/azure/bastion/configuration-settings |
| S29 | Configure NSG rules for Azure Bastion | https://learn.microsoft.com/en-us/azure/bastion/bastion-nsg |
| S30 | IP flow verify overview | https://learn.microsoft.com/en-us/azure/network-watcher/ip-flow-verify-overview |
| S31 | Quickstart: diagnose a VM traffic filter problem (portal) | https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-traffic-filtering-problem |
| S32 | Quickstart: diagnose a VM traffic filter problem (PowerShell) | https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-traffic-filtering-problem-powershell |
| S33 | Quickstart: diagnose a VM traffic filter problem (CLI) | https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-traffic-filtering-problem-cli |
| S34 | REST: Network Watchers - Verify IP Flow | https://learn.microsoft.com/en-us/rest/api/network-watcher/network-watchers/verify-ip-flow |
| S35 | Next hop overview | https://learn.microsoft.com/en-us/azure/network-watcher/next-hop-overview |
| S36 | Tutorial: diagnose a VM network routing problem (portal) | https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-routing-problem |
| S37 | Diagnose a VM network routing problem (PowerShell) | https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-routing-problem-powershell |
| S38 | Diagnose a VM network routing problem (CLI) | https://learn.microsoft.com/en-us/azure/network-watcher/diagnose-vm-network-routing-problem-cli |
| S39 | REST: Network Watchers - Get Next Hop | https://learn.microsoft.com/en-us/rest/api/network-watcher/network-watchers/get-next-hop |
| S40 | REST: Network Interfaces - Get Effective Route Table | https://learn.microsoft.com/en-us/rest/api/virtualnetwork/network-interfaces/get-effective-route-table |
| S41 | REST: Network Interfaces - List Effective Network Security Groups | https://learn.microsoft.com/en-us/rest/api/virtualnetwork/network-interfaces/list-effective-network-security-groups |
| S42 | Create, change, or delete a network interface (IP forwarding) | https://learn.microsoft.com/en-us/azure/virtual-network/virtual-network-network-interface |
| S43 | Create, change, or delete an Azure route table | https://learn.microsoft.com/en-us/azure/virtual-network/manage-route-table |
| S44 | Azure subscription and service limits, quotas, and constraints (networking) | https://learn.microsoft.com/en-us/azure/azure-resource-manager/management/azure-subscription-service-limits |
| S45 | NSG diagnostics overview | https://learn.microsoft.com/en-us/azure/network-watcher/nsg-diagnostics-overview |
| S46 | REST: Virtual Network Peerings - Create Or Update | https://learn.microsoft.com/en-us/rest/api/virtualnetwork/virtual-network-peerings/create-or-update |
| S47 | Learn training: Configure Azure virtual machine network settings | https://learn.microsoft.com/en-us/training/modules/create-windows-virtual-machine-in-azure/6-manage-vm |
| S48 | Network security groups and application security groups (Azure networking design guide) | https://learn.microsoft.com/en-us/azure/networking/design-guide/network-application-security-groups |

Note on S47 and S48: both were read as search-result excerpts, not as full-page fetches. Re-fetch them in full before quoting them in the product.

---

## 10. Suggested follow-ups for the owner

1. Decide the `[Decision]` items: `Internet` tag approximation (1.5), `VirtualNetwork` and UDR prefixes (1.5), ASG count (1.7), forwarded-traffic rule (3.3), NVA source address (step 6), private subnet default (5.1).
2. Re-check S47 and S48 in full, and the four S5 default-route prefixes that no tool output shows (`157.59.0.0/16`, `127.0.0.0/8`, `104.147.0.0/16`, `104.146.0.0/17`).
3. Update PLAN.md section 7 and section 8 from this file when checkpoint 10 writes `docs/SIMULATOR.md`. This research task did not edit PLAN.md.
