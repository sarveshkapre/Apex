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
  | "comment.added"
  | "attachment.added"
  | "workflow.started"
  | "workflow.step.executed"
  | "workflow.completed"
  | "approval.requested"
  | "approval.decided"
  | "exception.created"
  | "policy.evaluated"
  | "policy.exception.updated"
  | "saas.reclaim.run"
  | "contract.renewal.run"
  | "report.run"
  | "jml.joiner.executed"
  | "jml.mover.executed"
  | "jml.leaver.executed"
  | "device.lifecycle.executed"
  | "object.merged"
  | "object.merge.reverted"
  | "external-ticket.linked"
  | "connector.sync"
  | "config.published"
  | "manual.override";

export interface TimelineEvent {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  entityType: "object" | "relationship" | "work-item" | "workflow" | "approval" | "policy" | "report";
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

export interface WorkItemComment {
  id: string;
  authorId: string;
  body: string;
  mentions: string[];
  createdAt: string;
}

export interface WorkItemAttachment {
  id: string;
  fileName: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
}

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
  comments: WorkItemComment[];
  attachments: WorkItemAttachment[];
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

export type CustomFieldType = "string" | "number" | "date" | "enum" | "bool" | "json";

export interface CustomFieldDefinition {
  id: string;
  name: string;
  type: CustomFieldType;
  required: boolean;
  allowedValues?: string[];
  readRoles?: UserRole[];
  writeRoles?: UserRole[];
}

export interface CustomObjectSchema {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  pluralName: string;
  description?: string;
  fields: CustomFieldDefinition[];
  relationships: RelationshipType[];
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyDefinition {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  description: string;
  objectType: ObjectType;
  severity: "low" | "medium" | "high";
  expression: {
    field: string;
    operator: "equals" | "not_equals" | "includes" | "exists" | "lt" | "gt";
    value?: string | number | boolean;
  };
  remediation: {
    notify: boolean;
    createTask: boolean;
    escalationDays?: number;
    quarantine?: boolean;
  };
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyException {
  id: string;
  policyId: string;
  objectId: string;
  reason: string;
  status: "open" | "waived" | "resolved";
  waiverExpiresAt?: string;
  createdAt: string;
}

export interface SlaRule {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  workItemType: WorkItemType;
  priority: Priority;
  assignmentGroup: string;
  region: string;
  responseMinutes: number;
  resolutionMinutes: number;
  pauseStatuses: WorkItemStatus[];
  active: boolean;
}

export interface ConnectorConfig {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  type: "HRIS" | "IdP" | "MDM" | "EDR" | "Cloud" | "ServiceDesk" | "FileImport";
  mode: "import" | "export" | "bidirectional" | "event";
  status: "Healthy" | "Degraded" | "Failed";
  lastSuccessfulSync?: string;
  recordsIngested: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsFailed: number;
  fieldMappings: Record<string, string>;
  transforms: Array<{ id: string; field: string; type: string; config: Record<string, unknown> }>;
  filters: Array<{ id: string; expression: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorRun {
  id: string;
  connectorId: string;
  mode: "test" | "dry-run" | "sync";
  startedAt: string;
  completedAt?: string;
  status: "running" | "success" | "failed";
  summary: string;
}

export interface SavedView {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  objectType: string;
  filters: Record<string, unknown>;
  columns: string[];
  createdBy: string;
  createdAt: string;
}

export interface ExternalTicketLink {
  id: string;
  workItemId: string;
  provider: "ServiceNow" | "Jira" | "Other";
  externalTicketId: string;
  externalUrl?: string;
  syncStatus: "linked" | "syncing" | "failed";
  lastSyncedAt?: string;
  createdAt: string;
}

export interface NotificationRule {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  trigger: "status_change" | "approval_needed" | "sla_breach" | "action_failed" | "shipment_pending" | "reclaim_warning";
  channels: Array<"in-app" | "email" | "chat">;
  enabled: boolean;
  createdAt: string;
}

export interface ConfigVersion {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  kind: "workflow" | "policy" | "catalog" | "schema" | "rbac";
  name: string;
  version: number;
  state: "draft" | "published" | "rolled_back";
  changedBy: string;
  reason: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface FieldRestriction {
  id: string;
  objectType: ObjectType;
  field: string;
  readRoles: UserRole[];
  writeRoles: UserRole[];
  maskStyle?: "hidden" | "redacted";
}

export interface SodRule {
  id: string;
  name: string;
  description: string;
  requestTypes: WorkItemType[];
  enabled: boolean;
}

export interface ApprovalMatrixRule {
  id: string;
  name: string;
  requestType: WorkItemType;
  riskLevel: RiskLevel;
  costThreshold?: number;
  approverTypes: ApprovalType[];
  enabled: boolean;
}

export interface CatalogFormField {
  id: string;
  key: string;
  label: string;
  type: "string" | "number" | "date" | "enum" | "bool" | "text";
  required: boolean;
  options?: string[];
  requiredIf?: { key: string; equals: string | number | boolean };
  defaultValue?: string | number | boolean;
}

export interface CatalogItemDefinition {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  description: string;
  category: string;
  audience: string[];
  regions: string[];
  expectedDelivery: string;
  formFields: CatalogFormField[];
  defaultWorkflowDefinitionId?: string;
  riskLevel: RiskLevel;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExternalTicketComment {
  id: string;
  externalTicketLinkId: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface SaasReclaimPolicy {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  appName: string;
  inactivityDays: number;
  warningDays: number;
  autoReclaim: boolean;
  schedule: "manual" | "daily" | "weekly";
  enabled: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaasReclaimRunCandidate {
  accountObjectId: string;
  app: string;
  personId?: string;
  daysInactive: number;
  action: "none" | "reclaimed" | "skipped" | "failed";
  reason: string;
}

export interface SaasReclaimRun {
  id: string;
  policyId: string;
  mode: "dry-run" | "live" | "retry";
  status: "success" | "failed" | "partial";
  startedAt: string;
  completedAt: string;
  scannedAccounts: number;
  candidateCount: number;
  reclaimedCount: number;
  failedCount: number;
  createdExceptionIds: string[];
  candidates: SaasReclaimRunCandidate[];
}

export interface ContractRenewalCandidate {
  contractObjectId: string;
  vendorName: string;
  renewalDate: string;
  daysUntilRenewal: number;
  status: "future" | "due-soon" | "overdue";
  estimatedSpend: number;
  linkedLicenseIds: string[];
  action: "none" | "task-created" | "failed";
  reason: string;
  createdWorkItemId?: string;
  createdExceptionId?: string;
}

export interface ContractRenewalRun {
  id: string;
  mode: "dry-run" | "live";
  status: "success" | "failed" | "partial";
  daysAhead: number;
  startedAt: string;
  completedAt: string;
  scannedContracts: number;
  dueContracts: number;
  tasksCreated: number;
  exceptionsCreated: number;
  candidates: ContractRenewalCandidate[];
}

export interface ReportDefinition {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  name: string;
  description?: string;
  objectType?: ObjectType;
  filters: {
    containsText?: string;
    fieldEquals: Record<string, string | number | boolean>;
  };
  columns: string[];
  schedule?: {
    frequency: "manual" | "daily" | "weekly";
    hourUtc?: number;
  };
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportRun {
  id: string;
  definitionId: string;
  trigger: "manual" | "scheduled";
  status: "success" | "failed";
  startedAt: string;
  completedAt: string;
  scannedCount: number;
  rowCount: number;
  fileName: string;
  format: "csv" | "json";
  content: string;
  ranBy: string;
  error?: string;
}

export interface JmlJoinerStep {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export interface JmlJoinerPlan {
  personId?: string;
  legalName: string;
  email: string;
  startDate: string;
  location: string;
  role: string;
  managerId?: string;
  employmentType: "employee" | "contractor" | "intern";
  deviceTypePreference: "laptop" | "desktop" | "phone" | "tablet";
  remote: boolean;
  baselineGroups: string[];
  baselineApps: string[];
  requestedApps: string[];
  riskLevel: RiskLevel;
  approvalsRequired: ApprovalType[];
  steps: JmlJoinerStep[];
}

export interface JmlJoinerRun {
  id: string;
  mode: "preview" | "live";
  status: "planned" | "executed";
  personId?: string;
  requesterId: string;
  plan: JmlJoinerPlan;
  linkedWorkItemId?: string;
  createdTaskIds: string[];
  createdApprovalIds: string[];
  createdObjectIds: string[];
  createdAt: string;
}

export type DeviceLifecycleStage = "request" | "fulfill" | "deploy" | "monitor" | "service" | "return" | "retire";

export interface DeviceLifecycleStep {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export interface DeviceLifecyclePlan {
  deviceId?: string;
  currentStage: DeviceLifecycleStage;
  targetStage: DeviceLifecycleStage;
  location?: string;
  stockroom?: string;
  assigneePersonId?: string;
  remoteReturn: boolean;
  riskLevel: RiskLevel;
  approvalsRequired: ApprovalType[];
  steps: DeviceLifecycleStep[];
}

export interface DeviceLifecycleRun {
  id: string;
  mode: "preview" | "live";
  status: "planned" | "executed";
  deviceId?: string;
  requesterId: string;
  plan: DeviceLifecyclePlan;
  linkedWorkItemId?: string;
  createdTaskIds: string[];
  createdApprovalIds: string[];
  createdObjectIds: string[];
  createdAt: string;
}

export interface JmlMoverPlan {
  personId: string;
  currentRole: string;
  targetRole: string;
  currentDepartment?: string;
  targetDepartment?: string;
  currentLocation?: string;
  targetLocation?: string;
  addGroups: string[];
  removeGroups: string[];
  addApps: string[];
  removeApps: string[];
  riskLevel: RiskLevel;
  approvalsRequired: ApprovalType[];
}

export interface JmlMoverRun {
  id: string;
  mode: "preview" | "live";
  status: "planned" | "executed";
  personId: string;
  requesterId: string;
  plan: JmlMoverPlan;
  linkedWorkItemId?: string;
  createdTaskIds: string[];
  createdApprovalIds: string[];
  createdAt: string;
}

export interface JmlLeaverStep {
  id: string;
  name: string;
  riskLevel: RiskLevel;
  requiresApproval: boolean;
}

export interface JmlLeaverPlan {
  personId: string;
  personName: string;
  effectiveDate: string;
  region: string;
  legalHold: boolean;
  vip: boolean;
  riskLevel: RiskLevel;
  approvalsRequired: ApprovalType[];
  steps: JmlLeaverStep[];
}

export interface JmlLeaverRun {
  id: string;
  mode: "preview" | "live";
  status: "planned" | "executed";
  personId: string;
  requesterId: string;
  plan: JmlLeaverPlan;
  linkedWorkItemId?: string;
  createdTaskIds: string[];
  createdApprovalIds: string[];
  createdAt: string;
}

export interface ObjectMergeFieldDecision {
  field: string;
  targetValue: unknown;
  sourceValue: unknown;
  selected: "target" | "source";
  reason: string;
}

export interface ObjectMergeRun {
  id: string;
  tenantId: TenantId;
  workspaceId: WorkspaceId;
  targetObjectId: string;
  sourceObjectId: string;
  objectType: ObjectType;
  status: "previewed" | "executed" | "reverted";
  reversibleUntil?: string;
  actorId: string;
  reason?: string;
  fieldDecisions: ObjectMergeFieldDecision[];
  movedRelationshipIds: string[];
  relinkedWorkItemIds: string[];
  createdAt: string;
  executedAt?: string;
  revertedAt?: string;
}
