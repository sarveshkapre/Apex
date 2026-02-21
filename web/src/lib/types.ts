export type WorkItemStatus =
  | "Draft"
  | "Submitted"
  | "Triaged"
  | "In Progress"
  | "Waiting"
  | "Blocked"
  | "Completed"
  | "Canceled";

export interface GraphObject {
  id: string;
  type: string;
  fields: Record<string, unknown>;
  quality: {
    freshness: number;
    completeness: number;
    consistency: number;
    coverage: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WorkItem {
  id: string;
  type: string;
  status: WorkItemStatus;
  priority: string;
  title: string;
  description?: string;
  requesterId: string;
  assigneeId?: string;
  assignmentGroup?: string;
  linkedObjectIds: string[];
  tags: string[];
  comments?: Array<{ id: string; authorId: string; body: string; createdAt: string }>;
  attachments?: Array<{ id: string; fileName: string; url: string; createdAt: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface Approval {
  id: string;
  workItemId: string;
  type: string;
  approverId: string;
  decision: string;
  comment?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  playbook: string;
  version: number;
  active: boolean;
  createdAt?: string;
  publishedAt?: string;
  steps?: Array<{
    id: string;
    name: string;
    type: string;
    riskLevel: "low" | "medium" | "high";
  }>;
}

export interface QualityDashboard {
  summary: {
    totalObjects: number;
    freshness: number;
    completeness: number;
    consistency: number;
    coverage: number;
  };
  drilldowns: {
    staleDevices: string[];
    unknownOwners: string[];
    unmatchedIdentities: string[];
    duplicateSerials: string[];
    orphanCloudResources: string[];
  };
}

export interface IntegrationHealth {
  id: string;
  name: string;
  type: string;
  status: "Healthy" | "Degraded" | "Failed";
  lastSuccessfulSync: string;
  ingested: number;
  updated: number;
  failed: number;
  message: string;
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  category: string;
  summary: string;
  updatedAt: string;
}

export interface DashboardKpis {
  totalAssets: number;
  complianceScore: number;
  openRisks: number;
  automationSuccessRate: number;
  licenseWasteEstimate: number;
  slaBreaches: number;
}

export type RiskLevel = "low" | "medium" | "high";

export interface CatalogFormField {
  id: string;
  key: string;
  label: string;
  type: "string" | "number" | "date" | "enum" | "bool" | "text";
  required: boolean;
  options?: string[];
  requiredIf?: {
    key: string;
    equals: string | number | boolean;
  };
  defaultValue?: string | number | boolean;
}

export interface CatalogItem {
  id: string;
  tenantId?: string;
  workspaceId?: string;
  name: string;
  description: string;
  category: string;
  audience: string[];
  regions?: string[];
  expectedDelivery: string;
  formFields?: CatalogFormField[];
  defaultWorkflowDefinitionId?: string;
  riskLevel?: RiskLevel;
  active?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CatalogPreviewResult {
  catalogItemId: string;
  fields: Array<
    CatalogFormField & {
      requiredResolved: boolean;
      value: unknown;
    }
  >;
}

export interface CatalogSubmitResult {
  workItem: WorkItem;
  approvals: Approval[];
  fieldValues: Record<string, unknown>;
}

export interface SlaBreach {
  workItemId: string;
  title: string;
  priority: string;
  assignmentGroup: string;
  responseBreached: boolean;
  resolutionBreached: boolean;
  elapsedMinutes: number;
  ruleId: string;
}

export interface SlaBreachesResponse {
  totalBreaches: number;
  breaches: SlaBreach[];
}

export interface CustomObjectSchema {
  id: string;
  name: string;
  pluralName: string;
  description?: string;
  fields: Array<{ id: string; name: string; type: string; required: boolean }>;
  relationships: string[];
  active: boolean;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  description: string;
  objectType: string;
  severity: "low" | "medium" | "high";
  active: boolean;
  version: number;
}

export interface PolicyEvaluationResult {
  policyId: string;
  evaluatedCount: number;
  exceptionCount: number;
}

export interface ConnectorConfig {
  id: string;
  name: string;
  type: string;
  mode: string;
  status: "Healthy" | "Degraded" | "Failed";
  recordsIngested: number;
  recordsUpdated: number;
  recordsFailed: number;
  updatedAt: string;
}

export interface NotificationRule {
  id: string;
  name: string;
  trigger: string;
  channels: string[];
  enabled: boolean;
}

export interface ConfigVersion {
  id: string;
  kind: string;
  name: string;
  version: number;
  state: "draft" | "published" | "rolled_back";
  changedBy: string;
  reason: string;
}

export interface FieldRestriction {
  id: string;
  objectType: string;
  field: string;
  readRoles: string[];
  writeRoles: string[];
  maskStyle?: "hidden" | "redacted";
}

export interface SodRule {
  id: string;
  name: string;
  description: string;
  requestTypes: string[];
  enabled: boolean;
}

export interface ApprovalMatrixRule {
  id: string;
  name: string;
  requestType: string;
  riskLevel: RiskLevel;
  costThreshold?: number;
  approverTypes: string[];
  enabled: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  objectType: string;
  columns: string[];
}

export interface ExternalTicketLink {
  id: string;
  workItemId: string;
  provider: "ServiceNow" | "Jira" | "Other";
  externalTicketId: string;
  syncStatus: "linked" | "syncing" | "failed";
}

export interface ExternalTicketComment {
  id: string;
  externalTicketLinkId: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface AiInsight {
  id: string;
  title: string;
  severity: string;
  summary: string;
}

export interface WorkflowSimulationResult {
  workflowDefinitionId: string;
  plan: Array<{
    order: number;
    stepId: string;
    name: string;
    type: string;
    riskLevel: string;
    requiresApproval: boolean;
  }>;
  outcome: string;
}

export interface EvidencePackage {
  id: string;
  workItemId: string;
  generatedAt: string;
  timeline: Array<{
    id: string;
    eventType: string;
    actor: string;
    createdAt: string;
    payload: Record<string, unknown>;
  }>;
  approvals: Array<{
    id: string;
    type: string;
    approverId: string;
    decision: string;
    comment?: string;
    createdAt: string;
    decidedAt?: string;
  }>;
  actionLogs: Array<{
    id: string;
    stepId: string;
    actionName: string;
    riskLevel: string;
    targetSystem: string;
    status: string;
    createdAt: string;
  }>;
  affectedObjects: GraphObject[];
}

export interface CloudTagNonCompliant {
  resourceId: string;
  name: string;
  provider: string;
  owner: string;
  tags: Record<string, string>;
  missingTags: string[];
}

export interface CloudTagCoverage {
  requiredTags: string[];
  totalResources: number;
  compliantResources: number;
  nonCompliantResources: number;
  coveragePercent: number;
  nonCompliant: CloudTagNonCompliant[];
}

export interface CloudTagEnforcementResult {
  mode: "dry-run" | "live";
  requiredTags: string[];
  resourcesEvaluated: number;
  autoTaggedResources: number;
  exceptionsCreated: number;
  remediations: Array<{
    resourceId: string;
    autoTagged: string[];
    unresolved: string[];
    exceptionId?: string;
  }>;
}
