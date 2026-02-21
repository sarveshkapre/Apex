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

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  audience: string[];
  expectedDelivery: string;
  description: string;
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

export interface AiInsight {
  id: string;
  title: string;
  severity: string;
  summary: string;
}
