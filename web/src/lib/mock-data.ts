import {
  Approval,
  CatalogItem,
  DashboardKpis,
  GraphObject,
  IntegrationHealth,
  KnowledgeArticle,
  QualityDashboard,
  WorkItem,
  WorkflowDefinition
} from "@/lib/types";

const now = new Date().toISOString();

export const mockObjects: GraphObject[] = [
  {
    id: "dev-1",
    type: "Device",
    fields: {
      asset_tag: "LAP-001",
      serial_number: "SN-001",
      model: "MacBook Pro 14",
      compliance_state: "compliant",
      assigned_to_person_id: "person-1",
      last_checkin: now,
      location: "San Francisco"
    },
    quality: { freshness: 0.95, completeness: 0.9, consistency: 0.98, coverage: 0.88 },
    createdAt: now,
    updatedAt: now
  },
  {
    id: "person-1",
    type: "Person",
    fields: {
      legal_name: "Jane Doe",
      email: "jane@example.com",
      department: "Engineering",
      status: "active"
    },
    quality: { freshness: 0.97, completeness: 0.92, consistency: 0.97, coverage: 0.91 },
    createdAt: now,
    updatedAt: now
  },
  {
    id: "saas-1",
    type: "SaaSAccount",
    fields: {
      app: "Figma",
      status: "active",
      person: "person-1",
      last_active: now
    },
    quality: { freshness: 0.9, completeness: 0.8, consistency: 0.95, coverage: 0.86 },
    createdAt: now,
    updatedAt: now
  }
];

export const mockWorkItems: WorkItem[] = [
  {
    id: "req-1",
    type: "Request",
    status: "In Progress",
    priority: "P2",
    title: "Request Figma access",
    description: "Need editor role for design sprint",
    requesterId: "person-1",
    assigneeId: "agent-2",
    assignmentGroup: "Access Ops",
    linkedObjectIds: ["saas-1"],
    tags: ["saas", "access"],
    createdAt: now,
    updatedAt: now
  },
  {
    id: "req-2",
    type: "Request",
    status: "Waiting",
    priority: "P1",
    title: "Laptop replacement",
    requesterId: "person-4",
    assigneeId: "agent-7",
    assignmentGroup: "Endpoint",
    linkedObjectIds: ["dev-1"],
    tags: ["device"],
    createdAt: now,
    updatedAt: now
  },
  {
    id: "exc-1",
    type: "Exception",
    status: "Submitted",
    priority: "P1",
    title: "EDR signal mismatch",
    requesterId: "system",
    assignmentGroup: "Security",
    linkedObjectIds: ["dev-1"],
    tags: ["automation-failed"],
    createdAt: now,
    updatedAt: now
  }
];

export const mockApprovals: Approval[] = [
  {
    id: "apr-1",
    workItemId: "req-1",
    type: "manager",
    approverId: "mgr-8",
    decision: "pending",
    createdAt: now
  },
  {
    id: "apr-2",
    workItemId: "req-2",
    type: "finance",
    approverId: "fin-2",
    decision: "approved",
    comment: "Approved under Q1 refresh budget",
    createdAt: now,
    decidedAt: now
  }
];

export const mockWorkflows: WorkflowDefinition[] = [
  {
    id: "wf-jml-joiner-v1",
    name: "JML Joiner - Baseline",
    playbook: "JML",
    version: 1,
    active: true
  },
  {
    id: "wf-device-return-v1",
    name: "Device Lifecycle - Return",
    playbook: "Device Lifecycle",
    version: 1,
    active: true
  },
  {
    id: "wf-saas-access-v1",
    name: "SaaS Access - Request",
    playbook: "SaaS Governance",
    version: 1,
    active: true
  }
];

export const mockQuality: QualityDashboard = {
  summary: {
    totalObjects: 1294,
    freshness: 0.91,
    completeness: 0.86,
    consistency: 0.9,
    coverage: 0.83
  },
  drilldowns: {
    staleDevices: ["dev-89", "dev-120"],
    unknownOwners: ["dev-204"],
    unmatchedIdentities: ["id-55", "id-89"],
    duplicateSerials: ["sn-x19"],
    orphanCloudResources: ["cr-91", "cr-184"]
  }
};

export const mockIntegrations: IntegrationHealth[] = [
  {
    id: "int-jamf",
    name: "Jamf",
    type: "MDM",
    status: "Healthy",
    lastSuccessfulSync: now,
    ingested: 1240,
    updated: 82,
    failed: 1,
    message: "Sync healthy. 1 record needs mapping review."
  },
  {
    id: "int-okta",
    name: "Okta",
    type: "IdP",
    status: "Degraded",
    lastSuccessfulSync: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    ingested: 3020,
    updated: 103,
    failed: 14,
    message: "Rate limit from provider. Automatic retry enabled."
  },
  {
    id: "int-cs",
    name: "CrowdStrike",
    type: "EDR",
    status: "Failed",
    lastSuccessfulSync: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    ingested: 0,
    updated: 0,
    failed: 89,
    message: "Token expired. Re-authentication required."
  }
];

export const mockKb: KnowledgeArticle[] = [
  {
    id: "kb-1",
    title: "Set up your new MacBook in 15 minutes",
    category: "Onboarding",
    summary: "Step-by-step setup checklist with compliance baseline requirements.",
    updatedAt: now
  },
  {
    id: "kb-2",
    title: "Requesting admin privileges safely",
    category: "Access",
    summary: "When admin rights are allowed, approval flow, and expiry expectations.",
    updatedAt: now
  },
  {
    id: "kb-3",
    title: "What to do if a device is lost or stolen",
    category: "Security",
    summary: "Immediate reporting, lock/wipe process, and credential rotation guidance.",
    updatedAt: now
  }
];

export const mockDashboards: Record<string, DashboardKpis> = {
  executive: {
    totalAssets: 4621,
    complianceScore: 87,
    openRisks: 24,
    automationSuccessRate: 93,
    licenseWasteEstimate: 74200,
    slaBreaches: 17
  },
  "it-ops": {
    totalAssets: 4621,
    complianceScore: 84,
    openRisks: 31,
    automationSuccessRate: 91,
    licenseWasteEstimate: 63800,
    slaBreaches: 41
  },
  asset: {
    totalAssets: 4621,
    complianceScore: 86,
    openRisks: 18,
    automationSuccessRate: 94,
    licenseWasteEstimate: 52100,
    slaBreaches: 13
  },
  security: {
    totalAssets: 4621,
    complianceScore: 88,
    openRisks: 29,
    automationSuccessRate: 89,
    licenseWasteEstimate: 66500,
    slaBreaches: 22
  },
  saas: {
    totalAssets: 4621,
    complianceScore: 82,
    openRisks: 14,
    automationSuccessRate: 92,
    licenseWasteEstimate: 90500,
    slaBreaches: 9
  }
};

export const mockCatalog: CatalogItem[] = [
  {
    id: "cat-laptop",
    name: "Request laptop",
    category: "Devices",
    audience: ["employee", "contractor"],
    expectedDelivery: "3-5 business days",
    description: "Select a role-based model bundle with optional accessories."
  },
  {
    id: "cat-saas-access",
    name: "Request software access",
    category: "SaaS",
    audience: ["employee", "contractor"],
    expectedDelivery: "< 1 business day",
    description: "Request sanctioned app access with entitlement options."
  },
  {
    id: "cat-admin",
    name: "Request temporary admin privileges",
    category: "Security",
    audience: ["employee"],
    expectedDelivery: "4 hours",
    description: "Time-boxed privileged access with strict approvals and attestations."
  }
];
