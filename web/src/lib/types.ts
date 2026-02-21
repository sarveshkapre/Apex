export type WorkItemStatus =
  | "Draft"
  | "Submitted"
  | "Triaged"
  | "In Progress"
  | "Waiting"
  | "Blocked"
  | "Completed"
  | "Canceled";

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
  type: string;
  fields: Record<string, unknown>;
  provenance?: Record<string, CanonicalFieldProvenance[]>;
  quality: {
    freshness: number;
    completeness: number;
    consistency: number;
    coverage: number;
  };
  createdAt: string;
  updatedAt: string;
}

export type RelationshipType =
  | "assigned_to"
  | "owned_by"
  | "located_in"
  | "member_of"
  | "has_identity"
  | "has_account"
  | "consumes"
  | "installed_on"
  | "contains"
  | "depends_on"
  | "linked_to"
  | "evidence_for";

export interface GraphRelationship {
  id: string;
  tenantId: string;
  workspaceId: string;
  type: RelationshipType;
  fromObjectId: string;
  toObjectId: string;
  createdAt: string;
  createdBy: string;
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

export interface LostStolenActionStep {
  action: string;
  riskLevel: "low" | "medium" | "high";
  requiresApproval: boolean;
  status: "planned" | "pending-approval";
  approvalId?: string;
}

export interface LostStolenReportResult {
  incident: WorkItem;
  approvals: Approval[];
  followUpTasks: WorkItem[];
  actionPlan: LostStolenActionStep[];
  evidenceHint: string;
}

export interface DeviceAcknowledgementResult {
  device: GraphObject;
  acknowledgement: {
    type: "receipt" | "return-shipment";
    acknowledgedBy: string;
    note?: string;
    acknowledgedAt: string;
  };
}

export type WorkItemBulkAction = "assign" | "priority" | "tag" | "comment" | "workflow-step" | "export";

export interface WorkItemBulkResult {
  action: WorkItemBulkAction;
  selectedCount: number;
  updatedCount?: number;
  updatedIds?: string[];
  matchedCount?: number;
  format?: "csv";
  fileName?: string;
  content?: string;
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
  expiresAt?: string;
}

export interface ApprovalEscalationRunResult {
  mode: "dry-run" | "live";
  expiredCount: number;
  escalatedCount: number;
  expiredApprovalIds: string[];
  escalatedApprovalIds: string[];
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

export interface WorkflowRun {
  id: string;
  definitionId: string;
  status: "pending" | "running" | "waiting-approval" | "completed" | "failed";
  currentStepIndex: number;
  inputs: Record<string, unknown>;
  linkedWorkItemId?: string;
  createdAt: string;
  updatedAt: string;
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

export interface GlobalSearchResult {
  id: string;
  type: string;
  title: string;
  entity: "object" | "work-item" | "workflow" | "kb";
  status?: string;
  location?: string;
  owner?: string;
  complianceState?: string;
  lastSeen?: string;
}

export interface GlobalSearchResponse {
  query: string;
  filtersApplied: {
    objectType?: string;
    status?: string;
    location?: string;
    owner?: string;
    complianceState?: string;
    lastSeenDays?: number;
  };
  facets: {
    types: Array<{ value: string; count: number }>;
    status: Array<{ value: string; count: number }>;
    location: Array<{ value: string; count: number }>;
    owner: Array<{ value: string; count: number }>;
    complianceState: Array<{ value: string; count: number }>;
  };
  results: GlobalSearchResult[];
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

export interface PolicyException {
  id: string;
  policyId: string;
  objectId: string;
  reason: string;
  status: "open" | "waived" | "resolved";
  waiverExpiresAt?: string;
  createdAt: string;
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

export interface ReportDefinition {
  id: string;
  tenantId: string;
  workspaceId: string;
  name: string;
  description?: string;
  objectType?: string;
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

export interface ReportExportArtifact {
  runId: string;
  definitionId: string;
  fileName: string;
  format: "csv" | "json";
  content: string;
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
  riskLevel: "low" | "medium" | "high";
  approvalsRequired: string[];
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

export interface JmlMoverExecutionResult {
  run: JmlMoverRun;
  workItem: WorkItem;
  approvalIds: string[];
  taskIds: string[];
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
  tenantId: string;
  workspaceId: string;
  targetObjectId: string;
  sourceObjectId: string;
  objectType: string;
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

export interface ObjectMergePreviewResult {
  run: ObjectMergeRun;
  impact: {
    relationshipsToMove: number;
    workItemsToRelink: number;
  };
}

export interface ObjectMergeExecuteResult {
  run: ObjectMergeRun;
  mergedObject: GraphObject;
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

export interface SaasReclaimPolicy {
  id: string;
  tenantId: string;
  workspaceId: string;
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

export interface ContractRenewalOverview {
  daysAhead: number;
  scannedContracts: number;
  dueContracts: number;
  dueSoonContracts: number;
  overdueContracts: number;
  candidates: ContractRenewalCandidate[];
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
