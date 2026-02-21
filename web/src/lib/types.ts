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
