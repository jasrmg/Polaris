# Backlog: Azure services not yet in the catalog

Seed list created 2026-10-27. This is a to-do list of **names only**. Nothing here has been verified yet, and exam relevance is a hint to check against the live skills-measured lists (AZ-104, AZ-400), not a fact.

How to use it: each catalog batch (about five entries, always after checkpoint 11 so they use the new schema) takes items from the top. Every entry follows the verification routine in `docs/PLAN.md` section 3. When an entry ships, delete it from this file and add it to the catalog table in `docs/PLAN.md` section 5.

Current catalog (29): Resource Group, Virtual Machine, VM Scale Set, App Service Plan, App Service, Container Instances, Container Apps, Storage Account, Blob Container, Azure Files Share, Log Analytics Workspace, Alert Rule, Action Group, Network Watcher, Recovery Services Vault, Virtual Network, Subnet, Public IP, NSG, ASG, Route Table, VNet Peering, NVA, Azure DNS Zone, Private DNS Zone, Load Balancer, Bastion, Service Endpoint, Private Endpoint.

## Priority 1: planned checkpoints (see `docs/PLAN.md` section 6)

- Tenant, Management group, Subscription (checkpoint 11)
- Role definition, Role assignment, Custom role, Managed identity, Service principal, User, Group (checkpoint 13)
- Tags, Resource locks, Azure Policy (checkpoint 14)

## Priority 2: likely on AZ-104 or AZ-400 (confirm against the live lists)

Networking
- Azure Firewall
- VPN Gateway (and local network gateway)
- NAT Gateway
- Application Gateway
- ExpressRoute
- Azure Front Door
- Traffic Manager
- Virtual WAN (check relevance)

Compute and containers
- Azure Kubernetes Service (AKS)
- Azure Container Registry
- Azure Functions
- Azure Virtual Machine extensions, disks and images (managed disk, snapshot, image gallery)
- Availability set, proximity placement group (check whether these are better as notes inside the VM entry)

Security and secrets
- Key Vault
- App Configuration (Feature Manager)
- Microsoft Defender for Cloud
- Azure Machine Configuration, Azure Automation State Configuration
- Azure Deployment Environments

Monitoring
- Application Insights
- VM insights and Container insights
- Azure Monitor metrics, diagnostic settings, data collection rule (check whether these are better as notes inside existing entries)
- Azure Backup vault (the newer vault type) and Azure Site Recovery

Management
- Cost Management: budgets, cost analysis
- Azure Resource Graph, Azure Advisor (check relevance)
- ARM template, Bicep file and deployment as concept entries (check how they fit the new `kind` field)

## Priority 3: AZ-400 tooling and practices (need the new `kind` field from checkpoint 11)

DevOps tools: Azure Pipelines, Azure Repos, Azure Boards, Azure Artifacts, Azure Test Plans, GitHub Actions, GitHub Packages, GitHub Advanced Security, Dependabot, service connections, self-hosted agents and runners, environments and approvals.

Concepts: branching strategies (trunk-based, feature branch, release branch), pull request workflows and branch policies, deployment strategies (blue-green, canary, ring, feature flags), semantic versioning, workload identity federation (OpenID Connect) for pipelines.

## Priority 4: the long tail

Anything else users commonly meet in Azure: Azure SQL Database, Cosmos DB, Service Bus, Event Hubs, Event Grid, Logic Apps, API Management, Azure Cache for Redis, Azure Data Factory, Azure Arc, Azure Migrate, Azure Virtual Desktop, and so on. Order by how common they are, and by what the owner is studying.
