export type TenantId = string;
export type WorkspaceId = string;

export const coreObjectTypes = [
  "Person",
  "Identity",
  "Device",
  "Accessory",
  "Location",
  "WorkItem",
  "SaaSApplication",
  "SaaSAccount",
  "License",
  "Contract",
  "CloudContainer",
  "CloudResource",
  "SoftwareTitle",
  "SoftwareInstallation",
  "CustomObject"
] as const;

export type ObjectType = (typeof coreObjectTypes)[number];

export const relationshipTypes = [
  "assigned_to",
  "owned_by",
  "located_in",
  "member_of",
  "has_identity",
  "has_account",
  "consumes",
  "installed_on",
  "contains",
  "depends_on",
  "linked_to",
  "evidence_for"
] as const;

export type RelationshipType = (typeof relationshipTypes)[number];

export type RiskLevel = "low" | "medium" | "high";

export interface QualityMetrics {
  freshness: number;
  completeness: number;
  consistency: number;
  coverage: number;
}

export interface CanonicalFieldProvenance {
  field: string;
  sourceId: string;
  signalId: string;
  observedAt: string;
  confidence: number;
  overriddenBy?: string;
  overrideReason?: string;
  overrideUntil?: string;
}

export interface GraphObject {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  type: ObjectType;
  fields: Record<string, unknown>;
  provenance: Record<string, CanonicalFieldProvenance[]>;
  quality: QualityMetrics;
  createdAt: string;
  updatedAt: string;
}

export interface GraphRelationship {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  type: RelationshipType;
  fromObjectId: string;
  toObjectId: string;
  createdAt: string;
  createdBy: string;
}

export interface SourceSignal {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  sourceId: string;
  objectType: ObjectType;
  externalId: string;
  snapshot: Record<string, unknown>;
  observedAt: string;
  confidence: number;
}

export type TimelineEventType =
  | "object.created"
  | "object.updated"
  | "relationship.created"
  | "relationship.deleted"
  | "workflow.started"
  | "workflow.step.executed"
  | "workflow.completed"
  | "approval.requested"
  | "approval.decided"
  | "exception.created"
  | "policy.evaluated"
  | "manual.override";

export interface TimelineEvent {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  entityType: "object" | "relationship" | "work-item" | "workflow" | "approval" | "policy";
  entityId: string;
  eventType: TimelineEventType;
  actor: string;
  source?: string;
  reason?: string;
  workItemId?: string;
  createdAt: string;
  payload: Record<string, unknown>;
}

export const workItemTypes = [
  "Request",
  "Incident",
  "Change",
  "Task",
  "Approval",
  "Exception"
] as const;

export type WorkItemType = (typeof workItemTypes)[number];

export const workItemStatuses = [
  "Draft",
  "Submitted",
  "Triaged",
  "In Progress",
  "Waiting",
  "Blocked",
  "Completed",
  "Canceled"
] as const;

export type WorkItemStatus = (typeof workItemStatuses)[number];

export type Priority = "P0" | "P1" | "P2" | "P3" | "P4";

export interface WorkItem {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  type: WorkItemType;
  status: WorkItemStatus;
  priority: Priority;
  title: string;
  description?: string;
  requesterId: string;
  assigneeId?: string;
  assignmentGroup?: string;
  linkedObjectIds: string[];
  tags: string[];
  responseSlaAt?: string;
  resolutionSlaAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type ApprovalType =
  | "manager"
  | "app-owner"
  | "security"
  | "finance"
  | "it"
  | "custom";

export type ApprovalDecision = "pending" | "approved" | "rejected" | "expired";

export interface ApprovalRecord {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  workItemId: string;
  type: ApprovalType;
  approverId: string;
  decision: ApprovalDecision;
  comment?: string;
  expiresAt?: string;
  decidedAt?: string;
  createdAt: string;
}

export type WorkflowStepType =
  | "human-task"
  | "approval"
  | "automation"
  | "condition"
  | "wait"
  | "notification"
  | "update-object"
  | "create-work-item";

export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  riskLevel: RiskLevel;
  config: Record<string, unknown>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  playbook: string;
  trigger: {
    kind: "event" | "schedule" | "manual";
    value: string;
  };
  steps: WorkflowStep[];
  active: boolean;
  createdAt: string;
  publishedAt?: string;
}

export type WorkflowRunStatus = "pending" | "running" | "waiting-approval" | "completed" | "failed";

export interface WorkflowRun {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  definitionId: string;
  status: WorkflowRunStatus;
  currentStepIndex: number;
  inputs: Record<string, unknown>;
  linkedWorkItemId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActionExecutionLog {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  workflowRunId: string;
  stepId: string;
  actionName: string;
  riskLevel: RiskLevel;
  idempotencyKey: string;
  targetSystem: string;
  status: "success" | "failed";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  correlationId: string;
  createdAt: string;
}

export type UserRole =
  | "end-user"
  | "it-agent"
  | "asset-manager"
  | "it-admin"
  | "security-analyst"
  | "finance"
  | "app-owner"
  | "auditor";

export interface ApiActor {
  id: string;
  role: UserRole;
}

export interface EvidencePackage {
  id: string;
  workItemId: string;
  generatedAt: string;
  timeline: TimelineEvent[];
  approvals: ApprovalRecord[];
  actionLogs: ActionExecutionLog[];
  affectedObjects: GraphObject[];
}

export interface ReconciliationCandidate {
  objectId: string;
  confidence: number;
  matchReason: string;
  conflictingFields: string[];
}
