"use strict";

// -----------------------------------------------------------------------------
// Defaults, templates, and configuration
// -----------------------------------------------------------------------------

const DEFAULT_LAYOUT_ENGINE = "elk";
const DIAGRAM_LAYOUT_ENGINES = new Set(["elk", "dagre"]);

function getEmbeddedDiagramLayout(code) {
  const frontmatter = String(code || "").match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  const layout = frontmatter?.[1].match(/^[ \t]*layout[ \t]*:[ \t]*(elk|dagre)[ \t]*$/im)?.[1].toLowerCase();
  return DIAGRAM_LAYOUT_ENGINES.has(layout) ? layout : null;
}

function stripEmbeddedDiagramLayout(code) {
  const source = String(code ?? "").replace(/^\uFEFF/, "");
  const frontmatter = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!frontmatter) return source;

  const lines = frontmatter[1].split(/\r?\n/);
  const layoutIndex = lines.findIndex(line => /^[ \t]*layout[ \t]*:/i.test(line));
  if (layoutIndex < 0) return source;
  lines.splice(layoutIndex, 1);

  const configIndex = lines.findIndex(line => /^config[ \t]*:[ \t]*$/i.test(line));
  if (configIndex >= 0) {
    const configIndent = lines[configIndex].match(/^[ \t]*/)?.[0].length || 0;
    const hasConfigValue = lines.slice(configIndex + 1).some(line => {
      if (!line.trim()) return false;
      const indentation = line.match(/^[ \t]*/)?.[0].length || 0;
      return indentation > configIndent;
    });
    if (!hasConfigValue) lines.splice(configIndex, 1);
  }

  const body = source.slice(frontmatter[0].length).replace(/^\r?\n/, "");
  const remainingFrontmatter = lines.filter(line => line.trim()).join("\n");
  return remainingFrontmatter ? `---\n${remainingFrontmatter}\n---${body ? `\n${body}` : ""}` : body;
}

function setEmbeddedDiagramLayout(code, layout) {
  const source = String(code ?? "").replace(/^\uFEFF/, "");
  if (!DIAGRAM_LAYOUT_ENGINES.has(layout)) return source;
  const frontmatter = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!frontmatter) return `---\nconfig:\n  layout: ${layout}\n---${source ? `\n${source}` : ""}`;

  const lines = frontmatter[1].split(/\r?\n/);
  const layoutIndex = lines.findIndex(line => /^[ \t]*layout[ \t]*:/i.test(line));
  if (layoutIndex >= 0) {
    const indentation = lines[layoutIndex].match(/^[ \t]*/)?.[0] || "  ";
    lines[layoutIndex] = `${indentation}layout: ${layout}`;
  } else {
    const configIndex = lines.findIndex(line => /^config[ \t]*:[ \t]*$/i.test(line));
    if (configIndex >= 0) lines.splice(configIndex + 1, 0, `  layout: ${layout}`);
    else lines.push("config:", `  layout: ${layout}`);
  }
  const body = source.slice(frontmatter[0].length).replace(/^\r?\n/, "");
  return `---\n${lines.join("\n")}\n---${body ? `\n${body}` : ""}`;
}

const DEFAULT_CODE = `flowchart TD
    welcome(["Welcome to Mermaid Flow Editor"])
    choose{"How would you like to begin?"}
    code@{ shape: doc, label: "Write Mermaid code" }
    shapes@{ shape: processes, label: "Drag flowchart shapes" }
    preview@{ shape: rounded, label: "See the live preview" }
    customize@{ shape: hex, label: "Click nodes and arrows to customize" }
    saved[("Auto-saved in your browser")]
    export(["Export as SVG, PNG, JPG or PDF"])

    welcome --> choose
    choose -->|Use the editor| code
    choose -->|Use the shape library| shapes
    code --> preview
    shapes --> preview
    preview --> customize
    customize --> saved
    saved --> export

    style welcome fill:#5271ff,color:#ffffff,stroke:#2948b8
    style choose fill:#ffde59,color:#1f2937,stroke:#c69000
    style preview fill:#5ce1e6,color:#083344,stroke:#0891a6
    style customize fill:#8c52ff,color:#ffffff,stroke:#5e17a8
    style saved fill:#00bf63,color:#ffffff,stroke:#08783f
    style export fill:#ff66c4,color:#ffffff,stroke:#c02682`;

const TEMPLATE_CATEGORIES = [
  { id: "getting-started", name: "Getting Started", description: "Simple examples for new users." },
  { id: "business-processes", name: "Business Processes", description: "Workflows, approvals and operational procedures." },
  { id: "system-architecture", name: "System Architecture", description: "Applications, services, databases and integrations." },
  { id: "cloud-infrastructure", name: "Cloud Infrastructure", description: "Cloud-specific deployments and environments." },
  { id: "network-security", name: "Network & Security", description: "Connectivity, access control and security architecture." },
  { id: "devops-software-delivery", name: "DevOps & Software Delivery", description: "Development, deployment and release workflows." },
  { id: "it-operations", name: "IT Operations", description: "Monitoring, incidents, changes and service management." },
  { id: "project-team-collaboration", name: "Project & Team Collaboration", description: "Planning, ownership and communication." },
  { id: "data-integration", name: "Data & Integration", description: "Data movement, processing and application integrations." }
];

function createTemplate({ id, name, description, category, tags, diagramType = "flowchart", order, code }) {
  return { id, name, description, category, tags, diagramType, order, code: code.trim() };
}

function createFlowTemplate(metadata, lines, direction = "LR") {
  const body = lines.map(line => `    ${line}`).join("\n");
  return createTemplate({ ...metadata, diagramType: "flowchart", code: `flowchart ${direction}\n${body}` });
}

function createLinearTemplate(metadata, steps, direction = "LR") {
  const nodes = steps.map((label, index) => {
    const id = `step${index + 1}`;
    if (index === 0) return `${id}(["${label}"])`;
    if (index === steps.length - 1) return `${id}(("${label}"))`;
    return `${id}["${label}"]`;
  });
  const edges = steps.slice(1).map((_, index) => `step${index + 1} --> step${index + 2}`);
  return createFlowTemplate(metadata, [...nodes, "", ...edges], direction);
}

const templates = [
  // Getting Started
  createFlowTemplate({
    id: "quick-start", name: "Quick Start", description: "A small connected flow for learning the editor.",
    category: "getting-started", tags: ["beginner", "starter", "flow"], order: 10
  }, [
    'start(("Start")) --> request["Customer request"]',
    'request --> review["Review request"]',
    'review --> decision{"Ready to proceed?"}',
    'decision -->|Yes| deliver["Deliver solution"]',
    'decision -->|No| improve["Request changes"]',
    'improve --> review',
    'deliver --> complete(("Complete"))'
  ]),
  createLinearTemplate({
    id: "basic-process-flow", name: "Basic Process Flow", description: "A straightforward process from input to outcome.",
    category: "getting-started", tags: ["beginner", "process", "workflow"], order: 20
  }, ["Start", "Receive input", "Perform task", "Review result", "Complete"]),
  createFlowTemplate({
    id: "decision-tree", name: "Decision Tree", description: "Branch through choices and possible outcomes.",
    category: "getting-started", tags: ["beginner", "decision", "branches"], order: 30
  }, [
    'start(["Start"]) --> first{"Is the request urgent?"}',
    'first -->|Yes| capacity{"Is capacity available?"}',
    'first -->|No| queue["Add to standard queue"]',
    'capacity -->|Yes| expedite["Expedite request"]',
    'capacity -->|No| escalate["Escalate for support"]',
    'queue --> done(("Planned"))',
    'expedite --> done',
    'escalate --> done'
  ], "TD"),
  // Business Processes
  createFlowTemplate({
    id: "approval", name: "Approval Workflow", description: "Route a request through review, approval and revision.",
    category: "business-processes", tags: ["approval", "decision", "request"], order: 10
  }, [
    'request["Submit request"] --> review["Manager review"]',
    'review --> decision{"Approved?"}',
    'decision -->|Yes| approved["Process request"]',
    'decision -->|No| changes["Request changes"]',
    'changes --> request',
    'approved --> done(("Done"))'
  ], "TD"),
  createLinearTemplate({
    id: "employee-onboarding", name: "Employee Onboarding", description: "Coordinate hiring, access, equipment and orientation.",
    category: "business-processes", tags: ["hr", "employee", "onboarding", "access"], order: 20
  }, ["Offer accepted", "Collect details", "Create accounts", "Prepare equipment", "Orientation", "Onboarding complete"]),
  createFlowTemplate({
    id: "purchase-request", name: "Purchase Request Process", description: "Review budget and approvals before placing an order.",
    category: "business-processes", tags: ["purchase", "procurement", "budget", "approval"], order: 30
  }, [
    'request["Submit purchase request"] --> budget{"Budget available?"}',
    'budget -->|No| reject["Return to requester"]',
    'budget -->|Yes| approve{"Approval granted?"}',
    'approve -->|No| reject',
    'approve -->|Yes| order["Create purchase order"]',
    'order --> receive["Receive goods"]',
    'receive --> close(("Close request"))'
  ], "TD"),
  createFlowTemplate({
    id: "change-request-workflow", name: "Change Request Workflow", description: "Assess, approve, schedule and verify a business change.",
    category: "business-processes", tags: ["change", "approval", "risk", "review"], order: 40
  }, [
    'submit["Submit change"] --> assess["Assess impact and risk"]',
    'assess --> board{"Change approved?"}',
    'board -->|No| revise["Revise or close"]',
    'revise --> submit',
    'board -->|Yes| schedule["Schedule change"]',
    'schedule --> implement["Implement"]',
    'implement --> verify{"Successful?"}',
    'verify -->|Yes| close(("Close change"))',
    'verify -->|No| rollback["Roll back"]'
  ], "TD"),
  createFlowTemplate({
    id: "customer-support-escalation", name: "Customer Support Escalation", description: "Move unresolved cases through support tiers.",
    category: "business-processes", tags: ["support", "customer", "escalation", "ticket"], order: 50
  }, [
    'ticket["Customer ticket"] --> triage["Tier 1 triage"]',
    'triage --> solved{"Resolved?"}',
    'solved -->|Yes| confirm["Confirm with customer"]',
    'solved -->|No| tier2["Escalate to Tier 2"]',
    'tier2 --> specialist{"Specialist needed?"}',
    'specialist -->|Yes| tier3["Escalate to engineering"]',
    'specialist -->|No| confirm',
    'tier3 --> confirm',
    'confirm --> close(("Close ticket"))'
  ], "TD"),
  createFlowTemplate({
    id: "document-review", name: "Document Review Process", description: "Draft, review and publish a controlled document.",
    category: "business-processes", tags: ["document", "review", "publish", "approval"], order: 60
  }, [
    'draft["Create draft"] --> peer["Peer review"]',
    'peer --> changes{"Changes required?"}',
    'changes -->|Yes| revise["Revise document"]',
    'revise --> peer',
    'changes -->|No| owner["Owner approval"]',
    'owner --> publish["Publish and notify"]',
    'publish --> archive(("Archive version"))'
  ], "TD"),
  createFlowTemplate({
    id: "vendor-selection", name: "Vendor Selection Workflow", description: "Compare suppliers through evaluation and due diligence.",
    category: "business-processes", tags: ["vendor", "supplier", "procurement", "evaluation"], order: 70
  }, [
    'needs["Define requirements"] --> rfp["Issue RFP"]',
    'rfp --> proposals["Collect proposals"]',
    'proposals --> score["Score vendors"]',
    'score --> shortlist["Shortlist vendors"]',
    'shortlist --> diligence{"Due diligence passed?"}',
    'diligence -->|No| score',
    'diligence -->|Yes| negotiate["Negotiate contract"]',
    'negotiate --> select(("Select vendor"))'
  ]),

  // System Architecture
  createFlowTemplate({
    id: "system", name: "Basic System Architecture", description: "A basic web application connected to backend services and data.",
    category: "system-architecture", tags: ["system", "application", "services", "database"], order: 10
  }, [
    'user(["User"]) --> web["Web application"]',
    'subgraph backend["Backend services"]',
    '    api["API service"]',
    '    worker["Background worker"]',
    '    db[("Database")]',
    '    api --> db',
    '    api --> worker',
    '    worker --> db',
    'end',
    'web --> api'
  ]),
  createTemplate({
    id: "prod-system-architecture", name: "Production System Architecture", description: "A production application platform with edge, messaging, data and operations layers.",
    category: "system-architecture", tags: ["production", "system", "architecture", "waf", "queue", "monitoring", "backup"], diagramType: "flowchart", order: 15,
    code: `flowchart LR
    user(["End User"])
    admin(["Administrator"])

    subgraph edge["Edge and Access Layer"]
        dns["DNS"]
        waf["CDN / WAF"]
        lb["Load Balancer"]
    end

    subgraph application["Application Layer"]
        web["Web Application"]
        api["API Service"]
        auth["Authentication Service"]
        scheduler["Job Scheduler"]
        worker["Background Worker"]
    end

    subgraph messaging["Messaging Layer"]
        queue[["Message Queue"]]
    end

    subgraph data["Data Layer"]
        cache[("Cache")]
        db[("Primary Database")]
        storage[("Object Storage")]
    end

    subgraph operations["Monitoring and Operations"]
        logs["Centralized Logging"]
        monitoring["Monitoring and Alerts"]
        backup["Database Backup"]
    end

    user --> dns
    dns --> waf
    waf --> lb
    lb --> web

    web --> api
    web --> auth
    admin --> auth

    api --> auth
    api --> cache
    api --> db
    api --> storage
    api --> queue

    scheduler --> queue
    queue --> worker
    worker --> db
    worker --> storage

    api -.-> logs
    worker -.-> logs
    web -.-> monitoring
    api -.-> monitoring
    worker -.-> monitoring

    db -.-> backup`
  }),
  createFlowTemplate({
    id: "three-tier-application", name: "Three-Tier Application", description: "Presentation, application and data tiers.",
    category: "system-architecture", tags: ["three tier", "web", "application", "database"], order: 20
  }, [
    'client(["Client"]) --> presentation["Presentation tier"]',
    'presentation --> application["Application tier"]',
    'application --> data[("Data tier")]',
    'data -. response .-> application',
    'application -. response .-> presentation'
  ]),
  createFlowTemplate({
    id: "microservices-architecture", name: "Microservices Architecture", description: "Services communicating through APIs and events.",
    category: "system-architecture", tags: ["microservices", "api", "events", "database"], order: 30
  }, [
    'client(["Client"]) --> gateway["API gateway"]',
    'gateway --> auth["Identity service"]',
    'gateway --> orders["Order service"]',
    'gateway --> catalog["Catalog service"]',
    'orders --> orderdb[("Order DB")]',
    'catalog --> catalogdb[("Catalog DB")]',
    'orders --> bus{{"Event bus"}}',
    'bus --> notify["Notification service"]'
  ]),
  createFlowTemplate({
    id: "web-application-architecture", name: "Web Application Architecture", description: "Browser traffic through delivery, application and storage layers.",
    category: "system-architecture", tags: ["web", "cdn", "api", "cache", "database"], order: 40
  }, [
    'browser(["Browser"]) --> cdn["CDN"]',
    'cdn --> loadbalancer["Load balancer"]',
    'loadbalancer --> app1["App instance 1"]',
    'loadbalancer --> app2["App instance 2"]',
    'app1 --> cache[("Cache")]',
    'app2 --> cache',
    'app1 --> database[("Database")]',
    'app2 --> database'
  ]),
  createFlowTemplate({
    id: "api-integration-architecture", name: "API Integration Architecture", description: "Connect consumers to internal and partner services.",
    category: "system-architecture", tags: ["api", "integration", "gateway", "partner"], order: 50
  }, [
    'consumer(["Consumer"]) --> gateway["API gateway"]',
    'gateway --> auth["Authentication"]',
    'gateway --> service["Integration service"]',
    'service --> internal["Internal system"]',
    'service --> partner["Partner API"]',
    'service --> audit[("Audit log")]'
  ]),
  createFlowTemplate({
    id: "event-driven-architecture", name: "Event-Driven Architecture", description: "Publish events to independent asynchronous consumers.",
    category: "system-architecture", tags: ["event", "queue", "stream", "asynchronous"], order: 60
  }, [
    'producer1["Order service"] --> broker{{"Event broker"}}',
    'producer2["Inventory service"] --> broker',
    'broker --> consumer1["Billing consumer"]',
    'broker --> consumer2["Notification consumer"]',
    'broker --> consumer3["Analytics consumer"]',
    'consumer1 --> ledger[("Ledger")]',
    'consumer3 --> lake[("Data lake")]'
  ]),
  createFlowTemplate({
    id: "high-availability-architecture", name: "High-Availability Architecture", description: "Distribute traffic across redundant application and data nodes.",
    category: "system-architecture", tags: ["high availability", "redundancy", "load balancer", "failover"], order: 70
  }, [
    'users(["Users"]) --> dns["Health-aware DNS"]',
    'dns --> lb1["Load balancer A"]',
    'dns --> lb2["Load balancer B"]',
    'lb1 --> app1["App node A"]',
    'lb2 --> app2["App node B"]',
    'app1 --> primary[("Primary DB")]',
    'app2 --> primary',
    'primary <-->|Replication| standby[("Standby DB")]'
  ]),
  createFlowTemplate({
    id: "disaster-recovery-architecture", name: "Disaster Recovery Architecture", description: "Replicate production services to a recovery site.",
    category: "system-architecture", tags: ["disaster recovery", "dr", "replication", "failover"], order: 80
  }, [
    'traffic(["User traffic"]) --> dns["Global DNS"]',
    'subgraph primarySite["Primary site"]',
    '    primaryApp["Application cluster"] --> primaryDb[("Primary database")]',
    'end',
    'subgraph recoverySite["Recovery site"]',
    '    recoveryApp["Standby application"] --> recoveryDb[("Recovery database")]',
    'end',
    'dns --> primaryApp',
    'dns -. failover .-> recoveryApp',
    'primaryDb -->|Replication| recoveryDb'
  ]),

  // Cloud Infrastructure
  createFlowTemplate({
    id: "azure-application-architecture", name: "Azure Application Architecture", description: "A resilient Azure web application deployment.",
    category: "cloud-infrastructure", tags: ["azure", "application gateway", "app service", "sql"], order: 10
  }, [
    'users(["Users"]) --> frontdoor["Azure Front Door"]',
    'frontdoor --> appgw["Application Gateway + WAF"]',
    'appgw --> app["App Service"]',
    'app --> cache[("Azure Cache")]',
    'app --> sql[("Azure SQL")]',
    'app --> monitor["Azure Monitor"]',
    'vault["Key Vault"] --> app'
  ]),
  createFlowTemplate({
    id: "aws-landing-zone", name: "AWS Landing Zone", description: "Organize shared, security and workload accounts.",
    category: "cloud-infrastructure", tags: ["aws", "landing zone", "accounts", "governance"], order: 20
  }, [
    'organization["AWS Organizations"] --> security["Security account"]',
    'organization --> logging["Log archive account"]',
    'organization --> network["Network account"]',
    'organization --> workloads["Workload OU"]',
    'workloads --> dev["Development account"]',
    'workloads --> prod["Production account"]',
    'network --> dev',
    'network --> prod',
    'dev --> logging',
    'prod --> logging'
  ], "TD"),
  createFlowTemplate({
    id: "multi-cloud-architecture", name: "Multi-Cloud Architecture", description: "Connect shared services across two cloud providers.",
    category: "cloud-infrastructure", tags: ["multi cloud", "azure", "aws", "connectivity"], order: 30
  }, [
    'users(["Users"]) --> traffic["Global traffic manager"]',
    'traffic --> azureApp["Azure application"]',
    'traffic --> awsApp["AWS application"]',
    'azureApp --> azureData[("Azure data store")]',
    'awsApp --> awsData[("AWS data store")]',
    'azureApp <-->|Private connectivity| awsApp',
    'azureData <-->|Data replication| awsData',
    'identity["Shared identity"] --> azureApp',
    'identity --> awsApp'
  ]),
  createFlowTemplate({
    id: "dev-uat-production-environments", name: "Development–UAT–Production Environments", description: "Promote releases through isolated cloud environments.",
    category: "cloud-infrastructure", tags: ["development", "uat", "production", "environments", "promotion"], order: 40
  }, [
    'source["Source repository"] --> build["Build artifact"]',
    'build --> dev["Development environment"]',
    'dev --> devGate{"Developer tests pass?"}',
    'devGate -->|Yes| uat["UAT environment"]',
    'uat --> uatGate{"Business approval?"}',
    'uatGate -->|Yes| prod["Production environment"]',
    'devGate -->|No| source',
    'uatGate -->|No| source'
  ]),
  createFlowTemplate({
    id: "cloud-migration-architecture", name: "Cloud Migration Architecture", description: "Move workloads from discovery through cutover.",
    category: "cloud-infrastructure", tags: ["cloud", "migration", "cutover", "on premises"], order: 50
  }, [
    'onprem["On-premises workloads"] --> discover["Discover and assess"]',
    'discover --> landing["Cloud landing zone"]',
    'landing --> migrate["Migrate application"]',
    'migrate --> sync["Synchronize data"]',
    'sync --> validate{"Validation passed?"}',
    'validate -->|No| migrate',
    'validate -->|Yes| cutover["Cut over traffic"]',
    'cutover --> optimize(("Optimize"))'
  ]),
  createFlowTemplate({
    id: "hub-spoke-network", name: "Hub-and-Spoke Network", description: "Centralize shared network services for isolated spokes.",
    category: "cloud-infrastructure", tags: ["hub", "spoke", "network", "firewall", "vnet"], order: 60
  }, [
    'internet(["Internet"]) --> firewall["Hub firewall"]',
    'onprem["On-premises"] --> gateway["VPN / ExpressRoute gateway"]',
    'gateway --> hub["Hub network"]',
    'firewall --> hub',
    'hub --> spoke1["Application spoke"]',
    'hub --> spoke2["Data spoke"]',
    'hub --> spoke3["Shared services spoke"]',
    'spoke1 -. peering .-> spoke2'
  ]),
  createFlowTemplate({
    id: "active-active-deployment", name: "Active-Active Deployment", description: "Serve traffic from two simultaneously active regions.",
    category: "cloud-infrastructure", tags: ["active active", "regions", "availability", "traffic"], order: 70
  }, [
    'users(["Users"]) --> global["Global load balancer"]',
    'global --> regionA["Active region A"]',
    'global --> regionB["Active region B"]',
    'regionA --> dataA[("Regional data A")]',
    'regionB --> dataB[("Regional data B")]',
    'dataA <-->|Multi-master replication| dataB',
    'health["Health monitoring"] --> global'
  ]),
  createFlowTemplate({
    id: "active-passive-dr", name: "Active-Passive DR Setup", description: "Fail over from an active region to a warm standby.",
    category: "cloud-infrastructure", tags: ["active passive", "dr", "standby", "failover"], order: 80
  }, [
    'users(["Users"]) --> dns["Failover DNS"]',
    'dns --> active["Active region"]',
    'dns -. failover .-> passive["Passive region"]',
    'active --> primary[("Primary data")]',
    'passive --> replica[("Replica data")]',
    'primary -->|Asynchronous replication| replica',
    'monitor["Health monitor"] --> dns'
  ]),

  // Network & Security
  createFlowTemplate({
    id: "vpn-connectivity", name: "VPN Connectivity", description: "Secure connection between on-premises and cloud.",
    category: "network-security", tags: ["vpn", "azure", "network", "ipsec"], order: 10
  }, [
    'onPrem["On-Premises Network"] --> vpn1["VPN Gateway"]',
    'vpn1 <-->|IPsec Tunnel| vpn2["Cloud VPN Gateway"]',
    'vpn2 --> cloud["Cloud Network"]'
  ]),
  createFlowTemplate({
    id: "site-to-site-vpn", name: "Site-to-Site VPN", description: "Connect two private sites over an encrypted tunnel.",
    category: "network-security", tags: ["site to site", "vpn", "ipsec", "branch"], order: 20
  }, [
    'subgraph headquarters["Headquarters"]',
    '    hqLan["HQ LAN"] --> hqGateway["VPN gateway"]',
    'end',
    'subgraph branch["Branch office"]',
    '    branchGateway["VPN gateway"] --> branchLan["Branch LAN"]',
    'end',
    'hqGateway <-->|Encrypted IPsec tunnel| branchGateway'
  ]),
  createFlowTemplate({
    id: "remote-access-vpn", name: "Remote-Access VPN", description: "Authenticate remote users before granting private access.",
    category: "network-security", tags: ["remote access", "vpn", "user", "mfa"], order: 30
  }, [
    'user(["Remote user"]) --> client["VPN client"]',
    'client --> gateway["Remote-access gateway"]',
    'gateway --> identity["Identity + MFA"]',
    'identity --> decision{"Access allowed?"}',
    'decision -->|Yes| private["Private applications"]',
    'decision -->|No| deny["Deny and log"]'
  ]),
  createFlowTemplate({
    id: "expressroute-direct-connect", name: "ExpressRoute / Direct Connect", description: "Private dedicated connectivity from a data center to cloud.",
    category: "network-security", tags: ["expressroute", "direct connect", "private", "network"], order: 40
  }, [
    'datacenter["Enterprise data center"] --> edge["Customer edge router"]',
    'edge --> provider["Connectivity provider"]',
    'provider --> cloudEdge["Cloud edge"]',
    'cloudEdge --> privateNetwork["Private cloud network"]',
    'privateNetwork --> workloads["Cloud workloads"]',
    'monitor["Network monitoring"] -. telemetry .-> edge',
    'monitor -. telemetry .-> cloudEdge'
  ]),
  createFlowTemplate({
    id: "firewall-traffic-flow", name: "Firewall Traffic Flow", description: "Inspect and route traffic according to security policy.",
    category: "network-security", tags: ["firewall", "traffic", "policy", "inspection"], order: 50
  }, [
    'source(["Source"]) --> edge["Edge router"]',
    'edge --> firewall["Firewall inspection"]',
    'firewall --> policy{"Policy allows traffic?"}',
    'policy -->|Yes| destination["Destination service"]',
    'policy -->|No| block["Block request"]',
    'firewall --> log[("Security logs")]',
    'block --> log'
  ]),
  createFlowTemplate({
    id: "zero-trust-access", name: "Zero-Trust Access", description: "Continuously verify identity, device and policy context.",
    category: "network-security", tags: ["zero trust", "identity", "device", "policy"], order: 60
  }, [
    'user(["User + device"]) --> identity["Verify identity"]',
    'identity --> posture["Check device posture"]',
    'posture --> policy["Evaluate access policy"]',
    'policy --> allow{"Least-privilege access?"}',
    'allow -->|Yes| app["Protected application"]',
    'allow -->|No| deny["Deny access"]',
    'app --> monitor["Continuous monitoring"]',
    'monitor --> policy'
  ]),
  createFlowTemplate({
    id: "dmz-architecture", name: "DMZ Architecture", description: "Separate public services from trusted internal systems.",
    category: "network-security", tags: ["dmz", "firewall", "public", "internal"], order: 70
  }, [
    'internet(["Internet"]) --> outer["External firewall"]',
    'subgraph dmz["DMZ"]',
    '    proxy["Reverse proxy"] --> web["Public web server"]',
    'end',
    'outer --> proxy',
    'web --> inner["Internal firewall"]',
    'inner --> app["Application service"]',
    'app --> database[("Internal database")]'
  ]),
  createFlowTemplate({
    id: "waf-cdn-traffic-flow", name: "WAF and CDN Traffic Flow", description: "Accelerate and protect inbound web requests.",
    category: "network-security", tags: ["waf", "cdn", "web", "security", "cache"], order: 80
  }, [
    'user(["User"]) --> dns["DNS"]',
    'dns --> cdn{"CDN cache hit?"}',
    'cdn -->|Yes| response["Return cached content"]',
    'cdn -->|No| waf["Web application firewall"]',
    'waf --> safe{"Request allowed?"}',
    'safe -->|Yes| origin["Origin application"]',
    'safe -->|No| block["Block and log"]',
    'origin --> cdn'
  ]),
  createFlowTemplate({
    id: "identity-mfa-flow", name: "Identity and MFA Flow", description: "Authenticate a user with a second factor.",
    category: "network-security", tags: ["identity", "mfa", "authentication", "security"], order: 90
  }, [
    'user(["User"]) --> login["Enter credentials"]',
    'login --> identity["Identity provider"]',
    'identity --> valid{"Credentials valid?"}',
    'valid -->|No| deny["Deny access"]',
    'valid -->|Yes| challenge["Send MFA challenge"]',
    'challenge --> verified{"Factor verified?"}',
    'verified -->|Yes| token["Issue access token"]',
    'verified -->|No| deny',
    'token --> app["Open application"]'
  ], "TD"),
  createFlowTemplate({
    id: "network-segmentation", name: "Network Segmentation", description: "Control traffic between trust zones and workloads.",
    category: "network-security", tags: ["segmentation", "zones", "vlan", "firewall"], order: 100
  }, [
    'users["User zone"] --> firewall["Segmentation firewall"]',
    'guest["Guest zone"] --> firewall',
    'firewall --> app["Application zone"]',
    'firewall --> admin["Management zone"]',
    'app --> dataFirewall["Data firewall"]',
    'dataFirewall --> data["Data zone"]',
    'firewall --> logs[("Flow logs")]'
  ]),

  // DevOps & Software Delivery
  createLinearTemplate({
    id: "ci-cd-pipeline", name: "CI/CD Pipeline", description: "Build, test and deploy code through an automated pipeline.",
    category: "devops-software-delivery", tags: ["ci", "cd", "pipeline", "automation"], order: 10
  }, ["Commit code", "Build", "Unit tests", "Security scan", "Deploy to staging", "Approval", "Deploy to production"]),
  createFlowTemplate({
    id: "git-branching-workflow", name: "Git Branching Workflow", description: "Move feature work through review and release branches.",
    category: "devops-software-delivery", tags: ["git", "branch", "pull request", "release"], order: 20
  }, [
    'main["main"] --> feature["Create feature branch"]',
    'feature --> commits["Commit changes"]',
    'commits --> pr["Open pull request"]',
    'pr --> review{"Review approved?"}',
    'review -->|No| commits',
    'review -->|Yes| merge["Merge to main"]',
    'merge --> release["Tag release"]'
  ], "TD"),
  createLinearTemplate({
    id: "application-deployment-flow", name: "Application Deployment Flow", description: "Promote a tested application release to production.",
    category: "devops-software-delivery", tags: ["application", "deployment", "release", "validation"], order: 30
  }, ["Package release", "Deploy to staging", "Run smoke tests", "Approve release", "Deploy to production", "Verify health"]),
  createFlowTemplate({
    id: "blue-green-deployment", name: "Blue-Green Deployment", description: "Switch traffic between identical production environments.",
    category: "devops-software-delivery", tags: ["blue green", "deployment", "traffic", "rollback"], order: 40
  }, [
    'users(["Users"]) --> router["Traffic router"]',
    'router --> blue["Blue: current version"]',
    'deploy["Deploy new release"] --> green["Green: new version"]',
    'green --> test{"Validation passed?"}',
    'test -->|Yes| switch["Switch traffic to green"]',
    'switch --> router',
    'test -->|No| fix["Fix release"]',
    'switch -. rollback .-> blue'
  ]),
  createFlowTemplate({
    id: "canary-deployment", name: "Canary Deployment", description: "Release gradually while monitoring a small traffic cohort.",
    category: "devops-software-delivery", tags: ["canary", "deployment", "traffic", "monitoring"], order: 50
  }, [
    'release["New release"] --> canary["Deploy canary"]',
    'router["Traffic router"] -->|5%| canary',
    'router -->|95%| stable["Stable version"]',
    'canary --> monitor["Monitor metrics"]',
    'monitor --> healthy{"Healthy?"}',
    'healthy -->|Yes| increase["Increase traffic"]',
    'increase --> full["Complete rollout"]',
    'healthy -->|No| rollback["Roll back canary"]'
  ]),
  createLinearTemplate({
    id: "infrastructure-as-code", name: "Infrastructure-as-Code Workflow", description: "Plan, review and apply version-controlled infrastructure.",
    category: "devops-software-delivery", tags: ["iac", "terraform", "infrastructure", "automation"], order: 60
  }, ["Edit infrastructure code", "Validate", "Create plan", "Peer review", "Apply changes", "Verify resources"]),
  createFlowTemplate({
    id: "container-deployment", name: "Container Deployment", description: "Build, publish and run a container image.",
    category: "devops-software-delivery", tags: ["container", "image", "registry", "deployment"], order: 70
  }, [
    'source["Application source"] --> build["Build container image"]',
    'build --> scan["Scan image"]',
    'scan --> registry[("Container registry")]',
    'registry --> deploy["Deployment platform"]',
    'deploy --> instance1["Container instance A"]',
    'deploy --> instance2["Container instance B"]',
    'monitor["Runtime monitoring"] --> deploy'
  ]),
  createFlowTemplate({
    id: "kubernetes-architecture", name: "Kubernetes Architecture", description: "A cluster with control plane, workloads and services.",
    category: "devops-software-delivery", tags: ["kubernetes", "cluster", "pods", "ingress"], order: 80
  }, [
    'users(["Users"]) --> ingress["Ingress controller"]',
    'subgraph cluster["Kubernetes cluster"]',
    '    control["Control plane"] --> node1["Worker node A"]',
    '    control --> node2["Worker node B"]',
    '    service["Service"] --> pod1["Pod A"]',
    '    service --> pod2["Pod B"]',
    '    node1 --> pod1',
    '    node2 --> pod2',
    'end',
    'ingress --> service',
    'pod1 --> data[("Persistent storage")]',
    'pod2 --> data'
  ]),
  createFlowTemplate({
    id: "release-approval", name: "Release Approval Workflow", description: "Gather technical and business approval before release.",
    category: "devops-software-delivery", tags: ["release", "approval", "change", "deployment"], order: 90
  }, [
    'candidate["Release candidate"] --> qa["QA sign-off"]',
    'qa --> security["Security sign-off"]',
    'security --> business["Business approval"]',
    'business --> approved{"All approvals complete?"}',
    'approved -->|No| remediate["Resolve findings"]',
    'remediate --> candidate',
    'approved -->|Yes| schedule["Schedule release"]',
    'schedule --> deploy(("Deploy"))'
  ], "TD"),
  createFlowTemplate({
    id: "rollback-process", name: "Rollback Process", description: "Restore a stable release after a failed deployment.",
    category: "devops-software-delivery", tags: ["rollback", "deployment", "recovery", "release"], order: 100
  }, [
    'alert["Deployment issue detected"] --> assess{"Rollback required?"}',
    'assess -->|No| fix["Apply forward fix"]',
    'assess -->|Yes| stop["Stop rollout"]',
    'stop --> restore["Restore previous version"]',
    'restore --> data["Reverse data changes"]',
    'data --> verify{"Service healthy?"}',
    'verify -->|No| escalate["Escalate incident"]',
    'verify -->|Yes| close(("Close and review"))'
  ], "TD"),

  // IT Operations
  createFlowTemplate({
    id: "incident", name: "Incident Response", description: "Triage, resolve and verify an operational incident.",
    category: "it-operations", tags: ["incident", "alert", "triage", "recovery"], order: 10
  }, [
    'alert["Alert received"] --> triage{"Critical incident?"}',
    'triage -->|Yes| team["Activate response team"]',
    'team --> fix["Apply mitigation"]',
    'fix --> verify["Verify recovery"]',
    'verify --> closed(("Closed"))',
    'triage -->|No| queue["Standard support queue"]',
    'queue --> closed'
  ], "TD"),
  createFlowTemplate({
    id: "major-incident-management", name: "Major Incident Management", description: "Coordinate leadership, communications and technical recovery.",
    category: "it-operations", tags: ["major incident", "war room", "communications", "recovery"], order: 20
  }, [
    'detect["Major incident declared"] --> command["Assign incident commander"]',
    'command --> bridge["Open response bridge"]',
    'bridge --> technical["Technical workstream"]',
    'bridge --> comms["Stakeholder communications"]',
    'technical --> restore["Restore service"]',
    'comms --> updates["Publish status updates"]',
    'restore --> validate["Validate stability"]',
    'validate --> review(("Post-incident review"))'
  ], "TD"),
  createLinearTemplate({
    id: "problem-management", name: "Problem Management", description: "Find root cause and prevent recurring incidents.",
    category: "it-operations", tags: ["problem", "root cause", "known error", "prevention"], order: 30
  }, ["Identify recurring incidents", "Open problem record", "Analyze root cause", "Document known error", "Implement permanent fix", "Review effectiveness"]),
  createFlowTemplate({
    id: "change-management", name: "Change Management", description: "Control operational changes from assessment to closure.",
    category: "it-operations", tags: ["change", "cab", "risk", "implementation"], order: 40
  }, [
    'raise["Raise change record"] --> classify["Classify and assess risk"]',
    'classify --> approve{"CAB approval?"}',
    'approve -->|No| rework["Rework or reject"]',
    'approve -->|Yes| schedule["Schedule change"]',
    'schedule --> implement["Implement change"]',
    'implement --> success{"Successful?"}',
    'success -->|Yes| close(("Review and close"))',
    'success -->|No| backout["Execute backout plan"]'
  ], "TD"),
  createFlowTemplate({
    id: "service-request-workflow", name: "Service Request Workflow", description: "Fulfill a standard request with approvals and tracking.",
    category: "it-operations", tags: ["service request", "catalog", "fulfillment", "approval"], order: 50
  }, [
    'submit["Submit catalog request"] --> validate["Validate details"]',
    'validate --> approval{"Approval required?"}',
    'approval -->|Yes| manager["Manager approval"]',
    'approval -->|No| assign["Assign fulfillment team"]',
    'manager --> assign',
    'assign --> fulfill["Fulfill request"]',
    'fulfill --> confirm["Confirm with requester"]',
    'confirm --> close(("Close request"))'
  ]),
  createFlowTemplate({
    id: "monitoring-alerting", name: "Monitoring and Alerting Flow", description: "Turn telemetry into actionable, routed alerts.",
    category: "it-operations", tags: ["monitoring", "alerting", "metrics", "on call"], order: 60
  }, [
    'systems["Applications and infrastructure"] --> telemetry["Collect telemetry"]',
    'telemetry --> rules["Evaluate alert rules"]',
    'rules --> breach{"Threshold breached?"}',
    'breach -->|No| telemetry',
    'breach -->|Yes| alert["Create alert"]',
    'alert --> route["Route to on-call team"]',
    'route --> incident["Open incident"]',
    'incident --> dashboard["Update status dashboard"]'
  ]),
  createLinearTemplate({
    id: "backup-restore", name: "Backup and Restore Process", description: "Create, verify and restore protected data.",
    category: "it-operations", tags: ["backup", "restore", "recovery", "data"], order: 70
  }, ["Select protected data", "Run backup", "Encrypt and store", "Verify backup", "Receive restore request", "Restore data", "Validate recovery"]),
  createLinearTemplate({
    id: "patch-management", name: "Patch Management", description: "Assess, test and deploy operating system or application patches.",
    category: "it-operations", tags: ["patch", "vulnerability", "testing", "maintenance"], order: 80
  }, ["Discover missing patches", "Assess risk", "Test in staging", "Approve maintenance", "Deploy patches", "Verify systems", "Report compliance"]),
  createFlowTemplate({
    id: "disaster-recovery-invocation", name: "Disaster Recovery Invocation", description: "Declare a disaster and coordinate service failover.",
    category: "it-operations", tags: ["disaster recovery", "invocation", "failover", "business continuity"], order: 90
  }, [
    'event["Severe outage"] --> assess["Assess scope and duration"]',
    'assess --> invoke{"Invoke DR?"}',
    'invoke -->|No| incident["Continue incident response"]',
    'invoke -->|Yes| declare["Declare disaster"]',
    'declare --> failover["Fail over critical services"]',
    'failover --> validate["Validate recovery site"]',
    'validate --> communicate["Communicate service status"]',
    'communicate --> operate(("Operate in DR mode"))'
  ], "TD"),
  createFlowTemplate({
    id: "capacity-escalation", name: "Capacity Escalation Workflow", description: "Respond when demand approaches a service limit.",
    category: "it-operations", tags: ["capacity", "threshold", "scaling", "escalation"], order: 100
  }, [
    'metric["Capacity threshold alert"] --> analyze["Analyze demand trend"]',
    'analyze --> immediate{"Immediate risk?"}',
    'immediate -->|Yes| scale["Apply emergency scaling"]',
    'immediate -->|No| plan["Create capacity plan"]',
    'scale --> approve["Notify service owner"]',
    'plan --> approve',
    'approve --> optimize["Optimize or expand"]',
    'optimize --> monitor(("Continue monitoring"))'
  ]),

  // Project & Team Collaboration
  createFlowTemplate({
    id: "collaboration", name: "Team Collaboration", description: "Coordinate design and engineering work toward a release.",
    category: "project-team-collaboration", tags: ["team", "collaboration", "design", "engineering"], order: 10
  }, [
    'subgraph design["Design team"]',
    '    brief["Project brief"] --> mockup["Create mockup"]',
    'end',
    'subgraph engineering["Engineering team"]',
    '    build["Build feature"] --> test["Test feature"]',
    'end',
    'mockup <--> build',
    'test --> release(("Release"))'
  ]),
  createLinearTemplate({
    id: "project-lifecycle", name: "Project Lifecycle", description: "Move a project from initiation to closure.",
    category: "project-team-collaboration", tags: ["project", "lifecycle", "planning", "delivery"], order: 20
  }, ["Initiate", "Plan", "Execute", "Monitor and control", "Deliver", "Close"]),
  createFlowTemplate({
    id: "raci-workflow", name: "RACI Workflow", description: "Clarify responsible, accountable, consulted and informed roles.",
    category: "project-team-collaboration", tags: ["raci", "roles", "ownership", "governance"], order: 30
  }, [
    'activity["Define project activity"] --> accountable["Accountable: approves outcome"]',
    'accountable --> responsible["Responsible: performs work"]',
    'responsible --> consulted["Consulted: provides input"]',
    'consulted --> deliverable["Complete deliverable"]',
    'deliverable --> informed["Informed: receives update"]',
    'accountable --> deliverable'
  ], "TD"),
  createFlowTemplate({
    id: "stakeholder-communication", name: "Stakeholder Communication", description: "Plan, tailor and track project communications.",
    category: "project-team-collaboration", tags: ["stakeholder", "communication", "reporting", "feedback"], order: 40
  }, [
    'update["Collect project update"] --> audience["Identify audience"]',
    'audience --> tailor["Tailor message"]',
    'tailor --> channel{"Choose channel"}',
    'channel -->|Executive| briefing["Executive briefing"]',
    'channel -->|Team| meeting["Team meeting"]',
    'channel -->|Broad| newsletter["Status newsletter"]',
    'briefing --> feedback["Capture feedback"]',
    'meeting --> feedback',
    'newsletter --> feedback'
  ], "TD"),
  createFlowTemplate({
    id: "task-dependency-map", name: "Task Dependency Map", description: "Show parallel tasks, dependencies and milestones.",
    category: "project-team-collaboration", tags: ["tasks", "dependencies", "milestones", "planning"], order: 50
  }, [
    'start(("Project start")) --> requirements["Requirements"]',
    'requirements --> design["Design"]',
    'requirements --> procurement["Procurement"]',
    'design --> build["Build"]',
    'procurement --> build',
    'build --> test["Test"]',
    'training["Training materials"] --> launch',
    'test --> launch(("Launch"))',
    'design --> training'
  ]),
  createFlowTemplate({
    id: "project-escalation", name: "Project Escalation Flow", description: "Escalate blocked issues through project governance.",
    category: "project-team-collaboration", tags: ["project", "escalation", "issue", "governance"], order: 60
  }, [
    'issue["Issue identified"] --> owner["Task owner attempts resolution"]',
    'owner --> resolved{"Resolved in team?"}',
    'resolved -->|Yes| track["Document resolution"]',
    'resolved -->|No| manager["Escalate to project manager"]',
    'manager --> impact{"High impact?"}',
    'impact -->|No| plan["Agree recovery plan"]',
    'impact -->|Yes| sponsor["Escalate to sponsor"]',
    'sponsor --> decision["Governance decision"]',
    'decision --> track'
  ], "TD"),
  createFlowTemplate({
    id: "sprint-workflow", name: "Sprint Workflow", description: "Plan, execute and review an agile sprint.",
    category: "project-team-collaboration", tags: ["sprint", "agile", "scrum", "retrospective"], order: 70
  }, [
    'backlog["Product backlog"] --> planning["Sprint planning"]',
    'planning --> sprint["Sprint backlog"]',
    'sprint --> daily["Daily delivery cycle"]',
    'daily --> done{"Sprint goal met?"}',
    'done -->|No| daily',
    'done -->|Yes| review["Sprint review"]',
    'review --> retro["Retrospective"]',
    'retro --> backlog'
  ]),
  createFlowTemplate({
    id: "risk-management", name: "Risk Management Process", description: "Identify, assess, treat and monitor project risks.",
    category: "project-team-collaboration", tags: ["risk", "mitigation", "impact", "monitoring"], order: 80
  }, [
    'identify["Identify risk"] --> assess["Assess likelihood and impact"]',
    'assess --> priority{"Above tolerance?"}',
    'priority -->|No| accept["Accept and monitor"]',
    'priority -->|Yes| response["Plan risk response"]',
    'response --> owner["Assign risk owner"]',
    'owner --> actions["Implement mitigations"]',
    'actions --> monitor["Monitor indicators"]',
    'accept --> monitor',
    'monitor --> assess'
  ]),
  createFlowTemplate({
    id: "project-governance", name: "Project Governance Structure", description: "Map decision and reporting paths across project roles.",
    category: "project-team-collaboration", tags: ["governance", "sponsor", "steering committee", "project"], order: 90
  }, [
    'sponsor["Executive sponsor"] --> steering["Steering committee"]',
    'steering --> pm["Project manager"]',
    'pm --> workstream1["Business workstream"]',
    'pm --> workstream2["Technical workstream"]',
    'pm --> assurance["Project assurance"]',
    'workstream1 --> pm',
    'workstream2 --> pm',
    'assurance -. independent report .-> steering'
  ], "TD"),

  // Data & Integration
  createFlowTemplate({
    id: "data-pipeline", name: "Data Pipeline", description: "Ingest, process, store and serve analytical data.",
    category: "data-integration", tags: ["data", "pipeline", "ingestion", "analytics"], order: 10
  }, [
    'sources["Source systems"] --> ingest["Ingestion layer"]',
    'ingest --> raw[("Raw storage")]',
    'raw --> process["Transform and validate"]',
    'process --> curated[("Curated data")]',
    'curated --> warehouse[("Data warehouse")]',
    'warehouse --> bi["BI and analytics"]',
    'process --> quality["Data quality monitoring"]'
  ]),
  createLinearTemplate({
    id: "etl-workflow", name: "ETL Workflow", description: "Extract, transform and load data into an analytics store.",
    category: "data-integration", tags: ["etl", "extract", "transform", "load"], order: 20
  }, ["Extract source data", "Stage records", "Validate quality", "Transform fields", "Load warehouse", "Reconcile totals"]),
  createFlowTemplate({
    id: "application-integration", name: "Application Integration", description: "Coordinate applications through an integration layer.",
    category: "data-integration", tags: ["application", "integration", "api", "message"], order: 30
  }, [
    'crm["CRM"] --> integration["Integration platform"]',
    'erp["ERP"] --> integration',
    'portal["Customer portal"] --> integration',
    'integration --> api["API services"]',
    'integration --> queue{{"Message queue"}}',
    'api --> billing["Billing system"]',
    'queue --> fulfillment["Fulfillment system"]',
    'integration --> audit[("Audit store")]'
  ]),
  createFlowTemplate({
    id: "database-replication", name: "Database Replication", description: "Replicate primary data to read and recovery replicas.",
    category: "data-integration", tags: ["database", "replication", "primary", "replica"], order: 40
  }, [
    'application["Application writes"] --> primary[("Primary database")]',
    'primary -->|Synchronous| local[("Local standby")]',
    'primary -->|Asynchronous| remote[("Remote replica")]',
    'readers["Read-only clients"] --> remote',
    'monitor["Replication monitoring"] --> primary',
    'monitor --> local',
    'monitor --> remote'
  ]),
  createFlowTemplate({
    id: "data-migration", name: "Data Migration", description: "Move data to a target platform with validation and cutover.",
    category: "data-integration", tags: ["data", "migration", "validation", "cutover"], order: 50
  }, [
    'source[("Source system")] --> profile["Profile and map data"]',
    'profile --> extract["Extract data"]',
    'extract --> transform["Clean and transform"]',
    'transform --> load[("Target system")]',
    'load --> validate{"Validation passed?"}',
    'validate -->|No| transform',
    'validate -->|Yes| cutover["Cut over applications"]',
    'cutover --> reconcile(("Reconcile and close"))'
  ]),
  createFlowTemplate({
    id: "message-queue-architecture", name: "Message Queue Architecture", description: "Decouple producers and consumers with durable messaging.",
    category: "data-integration", tags: ["message queue", "producer", "consumer", "dead letter"], order: 60
  }, [
    'producer1["Producer A"] --> exchange{{"Message broker"}}',
    'producer2["Producer B"] --> exchange',
    'exchange --> queue1["Orders queue"]',
    'exchange --> queue2["Notifications queue"]',
    'queue1 --> consumer1["Order consumer"]',
    'queue2 --> consumer2["Notification consumer"]',
    'queue1 -. failed messages .-> dead[("Dead-letter queue")]',
    'queue2 -. failed messages .-> dead'
  ]),
  createFlowTemplate({
    id: "api-request-flow", name: "API Request Flow", description: "Trace an authenticated API call through backend services.",
    category: "data-integration", tags: ["api", "request", "response", "authentication"], order: 70
  }, [
    'client(["Client"]) -->|HTTPS request| gateway["API gateway"]',
    'gateway --> auth["Validate access token"]',
    'auth --> valid{"Token valid?"}',
    'valid -->|No| reject["Return 401 response"]',
    'valid -->|Yes| api["Application API"]',
    'api -->|Query| database[("Database")]',
    'database -. result .-> api',
    'api -. JSON response .-> gateway',
    'gateway -. HTTP response .-> client'
  ], "TD"),
  createFlowTemplate({
    id: "real-time-data-processing", name: "Real-Time Data Processing", description: "Process streaming events and serve immediate insights.",
    category: "data-integration", tags: ["real time", "stream", "events", "analytics"], order: 80
  }, [
    'events["Event producers"] --> broker{{"Streaming platform"}}',
    'broker --> processor["Stream processor"]',
    'processor --> enrich["Enrichment service"]',
    'enrich --> realtime[("Real-time store")]',
    'enrich --> lake[("Data lake")]',
    'realtime --> dashboard["Live dashboard"]',
    'processor --> alerts["Operational alerts"]'
  ]),
  createFlowTemplate({
    id: "data-warehouse-architecture", name: "Data Warehouse Architecture", description: "Organize ingestion, warehouse layers and analytics consumers.",
    category: "data-integration", tags: ["data warehouse", "staging", "data mart", "bi"], order: 90
  }, [
    'operational["Operational systems"] --> ingestion["Batch and streaming ingestion"]',
    'external["External data"] --> ingestion',
    'ingestion --> staging[("Staging area")]',
    'staging --> warehouse[("Enterprise warehouse")]',
    'warehouse --> finance[("Finance data mart")]',
    'warehouse --> sales[("Sales data mart")]',
    'finance --> bi["BI dashboards"]',
    'sales --> bi',
    'warehouse --> science["Data science"]'
  ])
];

const DIAGRAM_TEMPLATES = Object.fromEntries(templates.map(template => [template.id, template]));

const STORAGE_KEY = "mermaid-flow-editor-code";
const NAME_STORAGE_KEY = "mermaid-flow-editor-name";
const PREVIEW_THEME_KEY = "mermaid-flow-editor-preview-theme";
const MOBILE_NOTICE_KEY = "mermaid-flow-editor-mobile-notice-seen";
const DIAGRAM_LIBRARY_KEY = "mermaid-flow-editor-diagram-library-v1";
const ACTIVE_DIAGRAM_KEY = "mermaid-flow-editor-active-diagram";
const RENDER_DELAY = 450;
const RENDERED_NODE_SELECTOR = "g.node, g.image-shape";
const SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000;
const MAX_SNAPSHOTS_PER_DIAGRAM = 20;
const MAX_SNAPSHOT_CHARACTERS = 300000;
const NEW_DIAGRAM_CODE = `flowchart TD
    start["Start here"]`;

const elements = {
  editor: document.getElementById("codeEditor"),
  lineNumbers: document.getElementById("codeLineNumbers"),
  diagramName: document.getElementById("diagramName"),
  preview: document.getElementById("diagramPreview"),
  error: document.getElementById("errorMessage"),
  status: document.getElementById("renderStatus"),
  lineCount: document.getElementById("lineCount"),
  fileInput: document.getElementById("fileInput"),
  popup: document.getElementById("nodePopup"),
  nodeId: document.getElementById("nodeId"),
  nodeLabel: document.getElementById("nodeLabel"),
  nodeImageUrl: document.getElementById("nodeImageUrl"),
  fillColor: document.getElementById("fillColor"),
  textColor: document.getElementById("textColor"),
  borderColor: document.getElementById("borderColor"),
  edgeColor: document.getElementById("edgeColor"),
  edgeThickness: document.getElementById("edgeThickness"),
  edgeThicknessValue: document.getElementById("edgeThicknessValue"),
  toast: document.getElementById("toast"),
  quickAdd: document.getElementById("quickAddButton"),
  previewPanel: document.querySelector(".preview-panel"),
  fullscreenButton: document.getElementById("fullscreenButton"),
  previewThemeButton: document.getElementById("previewThemeButton"),
  diagramThemeButton: document.getElementById("diagramThemeButton"),
  diagramThemeMenu: document.getElementById("diagramThemeMenu"),
  directionButton: document.getElementById("directionButton"),
  directionMenu: document.getElementById("directionMenu"),
  layoutEngineButton: document.getElementById("layoutEngineButton"),
  layoutEngineMenu: document.getElementById("layoutEngineMenu"),
  undoButton: document.getElementById("undoButton"),
  redoButton: document.getElementById("redoButton"),
  zoomLevel: document.getElementById("zoomLevel")
};

let renderTimer;
let renderSequence = 0;
let selectedNodeId = null;
let selectedShape = "rectangle";
let pendingEdgeSource = null;
let quickAddSource = null;
let quickAddSubgraph = null;
let quickAddHideTimer;
let toastTimer;
let historyTimer;
let autoSaveTimer;
let history = [DEFAULT_CODE];
let historyIndex = 0;
let zoom = 100;
let panX = 0;
let panY = 0;
let panStart = null;
let pendingFitFrame = 0;
let openNodeAfterRender = null;
let openNodeEditorStateAfterRender = null;
let openEdgeEditorStateAfterRender = null;
let edgeVisualUpdateTimer = null;
let selectedEdge = null;
let selectedEdgePath = null;
let selectedExportFormat = "svg";
let selectedSubgraphId = null;
let selectedSubgraphElement = null;
let shapeThumbnailObserver = null;
let nodeShapeThumbnailObserver = null;
let thumbnailRenderQueue = Promise.resolve();
let activeNodeDrag = null;
let suppressNodeClick = false;
let activeSubgraphDrag = null;
let suppressSubgraphClick = false;
let previewTheme = "light";
let activeLayoutEngine = DEFAULT_LAYOUT_ENGINE;
let activeDiagramThemeId = null;
let pendingConfirmation = null;
let confirmationReturnFocus = null;
let activeLibraryShapeDrag = null;
const previewTouchPoints = new Map();
let pinchGesture = null;
let diagramLibrary = [];
let activeDiagramId = null;
let versionHistoryDiagramId = null;
let parsedEdgeCacheCode = null;
let parsedEdgeCache = [];
const subgraphRangeCache = new Map();
let nodePopupDrag = null;
const modalFocusOrigins = new WeakMap();

const STYLE_COLOR_PALETTE = [
  { name: "Blue", fill: "#E3F2FD", border: "#1976D2", text: "#0D47A1", edge: "#1976D2" },
  { name: "Cyan", fill: "#E0F7FA", border: "#0097A7", text: "#006064", edge: "#0097A7" },
  { name: "Teal", fill: "#E0F2F1", border: "#00796B", text: "#004D40", edge: "#00796B" },
  { name: "Green", fill: "#E8F5E9", border: "#388E3C", text: "#1B5E20", edge: "#388E3C" },
  { name: "Light Green", fill: "#F1F8E9", border: "#689F38", text: "#33691E", edge: "#689F38" },
  { name: "Amber", fill: "#FFF8E1", border: "#FFA000", text: "#FF6F00", edge: "#FFA000" },
  { name: "Orange", fill: "#FFF3E0", border: "#F57C00", text: "#E65100", edge: "#F57C00" },
  { name: "Red", fill: "#FFEBEE", border: "#D32F2F", text: "#B71C1C", edge: "#D32F2F" },
  { name: "Pink", fill: "#FCE4EC", border: "#C2185B", text: "#880E4F", edge: "#C2185B" },
  { name: "Purple", fill: "#F3E5F5", border: "#7B1FA2", text: "#4A148C", edge: "#7B1FA2" },
  { name: "Indigo", fill: "#E8EAF6", border: "#303F9F", text: "#1A237E", edge: "#303F9F" },
  { name: "Grey", fill: "#F5F5F5", border: "#616161", text: "#212121", edge: "#616161" },
  { name: "Blue Grey", fill: "#ECEFF1", border: "#455A64", text: "#263238", edge: "#455A64" }
];

const DIAGRAM_THEMES = [
  {
    id: "blue-cyan", name: "Blue & Cyan",
    nodes: [
      { fill: "#E3F2FD", border: "#1976D2", text: "#0D47A1" },
      { fill: "#E0F7FA", border: "#0097A7", text: "#006064" },
      { fill: "#E8EAF6", border: "#303F9F", text: "#1A237E" }
    ],
    edge: "#1976D2", subgraph: { fill: "#F5FBFF", border: "#90CAF9", text: "#0D47A1" }
  },
  {
    id: "teal-green", name: "Teal & Green",
    nodes: [
      { fill: "#E0F2F1", border: "#00796B", text: "#004D40" },
      { fill: "#E8F5E9", border: "#388E3C", text: "#1B5E20" },
      { fill: "#F1F8E9", border: "#689F38", text: "#33691E" }
    ],
    edge: "#00796B", subgraph: { fill: "#F3FAF7", border: "#80CBC4", text: "#004D40" }
  },
  {
    id: "indigo-purple", name: "Indigo & Purple",
    nodes: [
      { fill: "#E8EAF6", border: "#303F9F", text: "#1A237E" },
      { fill: "#F3E5F5", border: "#7B1FA2", text: "#4A148C" },
      { fill: "#FCE4EC", border: "#C2185B", text: "#880E4F" }
    ],
    edge: "#5E35B1", subgraph: { fill: "#F7F5FC", border: "#9FA8DA", text: "#311B92" }
  },
  {
    id: "amber-orange", name: "Amber & Orange",
    nodes: [
      { fill: "#FFF8E1", border: "#FFA000", text: "#E65100" },
      { fill: "#FFF3E0", border: "#F57C00", text: "#BF360C" },
      { fill: "#FFEBEE", border: "#D32F2F", text: "#B71C1C" }
    ],
    edge: "#EF6C00", subgraph: { fill: "#FFFBF2", border: "#FFCC80", text: "#E65100" }
  },
  {
    id: "red-pink", name: "Red & Pink",
    nodes: [
      { fill: "#FFEBEE", border: "#D32F2F", text: "#B71C1C" },
      { fill: "#FCE4EC", border: "#C2185B", text: "#880E4F" },
      { fill: "#FFF3E0", border: "#F57C00", text: "#BF360C" }
    ],
    edge: "#C2185B", subgraph: { fill: "#FFF6F8", border: "#F48FB1", text: "#880E4F" }
  },
  {
    id: "neutral-grey", name: "Neutral Grey",
    nodes: [
      { fill: "#F5F5F5", border: "#616161", text: "#212121" },
      { fill: "#ECEFF1", border: "#455A64", text: "#263238" },
      { fill: "#E3F2FD", border: "#1976D2", text: "#0D47A1" }
    ],
    edge: "#455A64", subgraph: { fill: "#FAFAFA", border: "#B0BEC5", text: "#263238" }
  }
];

const FLOWCHART_SHAPES = [
  ["subgraph", "Subgraph"],
  ["rect", "Process"], ["rounded", "Event"], ["stadium", "Terminal"], ["subproc", "Subprocess"],
  ["cyl", "Database"], ["circle", "Start"], ["odd", "Odd"], ["diamond", "Decision"],
  ["hex", "Prepare"], ["lean-r", "Input / Output"], ["lean-l", "Output / Input"], ["datastore", "Datastore"],
  ["trap-b", "Priority action"], ["trap-t", "Manual operation"], ["dbl-circ", "Stop"], ["text", "Text block"],
  ["notch-rect", "Card"], ["lin-rect", "Lined process"], ["sm-circ", "Small start"], ["framed-circle", "Framed stop"],
  ["fork", "Fork / Join"], ["hourglass", "Collate"], ["comment", "Comment"], ["brace-r", "Comment right"],
  ["braces", "Comments"], ["bolt", "Communication"], ["doc", "Document"], ["delay", "Delay"],
  ["das", "Direct storage"], ["h-cyl", "Horizontal cylinder"], ["lin-cyl", "Disk storage"], ["curv-trap", "Display"], ["div-rect", "Divided process"],
  ["tri", "Extract"], ["win-pane", "Internal storage"], ["f-circ", "Junction"], ["lin-doc", "Lined document"],
  ["notch-pent", "Loop limit"], ["flip-tri", "Manual file"], ["sl-rect", "Manual input"], ["docs", "Documents"],
  ["processes", "Processes"], ["flag", "Paper tape"], ["bow-rect", "Stored data"], ["cross-circ", "Summary"],
  ["tag-doc", "Tagged document"], ["tag-rect", "Tagged process"], ["bang", "Bang"]
];
