import { v4 as uuidv4 } from "uuid";
import {
  ActionExecutionLog,
  ApprovalRecord,
  ConfigVersion,
  CloudTagGovernanceRun,
  ConnectorConfig,
  ConnectorRun,
  ContractRenewalRun,
  CustomObjectSchema,
  DeviceLifecycleRun,
  FieldRestriction,
  ExternalTicketComment,
  ExternalTicketLink,
  GraphObject,
  GraphRelationship,
  JmlJoinerRun,
  JmlLeaverRun,
  JmlMoverRun,
  ObjectMergeRun,
  NotificationRule,
  PolicyDefinition,
  PolicyException,
  ReportDefinition,
  ReportRun,
  SandboxRun,
  SaasReclaimPolicy,
  SaasReclaimRun,
  SavedView,
  SodRule,
  ApprovalMatrixRule,
  CatalogItemDefinition,
  SlaRule,
  SourceSignal,
  TimelineEvent,
  WorkflowDefinition,
  WorkflowRun,
  WorkItem
} from "../domain/types";

export class ApexStore {
  objects = new Map<string, GraphObject>();
  relationships = new Map<string, GraphRelationship>();
  signals = new Map<string, SourceSignal>();
  timeline: TimelineEvent[] = [];
  workItems = new Map<string, WorkItem>();
  approvals = new Map<string, ApprovalRecord>();
  workflowDefinitions = new Map<string, WorkflowDefinition>();
  workflowRuns = new Map<string, WorkflowRun>();
  actionLogs: ActionExecutionLog[] = [];
  customSchemas = new Map<string, CustomObjectSchema>();
  policies = new Map<string, PolicyDefinition>();
  policyExceptions = new Map<string, PolicyException>();
  slaRules = new Map<string, SlaRule>();
  connectors = new Map<string, ConnectorConfig>();
  connectorRuns = new Map<string, ConnectorRun>();
  savedViews = new Map<string, SavedView>();
  externalTicketLinks = new Map<string, ExternalTicketLink>();
  notificationRules = new Map<string, NotificationRule>();
  configVersions = new Map<string, ConfigVersion>();
  fieldRestrictions = new Map<string, FieldRestriction>();
  sodRules = new Map<string, SodRule>();
  approvalMatrixRules = new Map<string, ApprovalMatrixRule>();
  catalogItems = new Map<string, CatalogItemDefinition>();
  externalTicketComments = new Map<string, ExternalTicketComment>();
  saasReclaimPolicies = new Map<string, SaasReclaimPolicy>();
  saasReclaimRuns = new Map<string, SaasReclaimRun>();
  contractRenewalRuns = new Map<string, ContractRenewalRun>();
  cloudTagGovernanceRuns = new Map<string, CloudTagGovernanceRun>();
  reportDefinitions = new Map<string, ReportDefinition>();
  reportRuns = new Map<string, ReportRun>();
  sandboxRuns = new Map<string, SandboxRun>();
  jmlJoinerRuns = new Map<string, JmlJoinerRun>();
  jmlMoverRuns = new Map<string, JmlMoverRun>();
  jmlLeaverRuns = new Map<string, JmlLeaverRun>();
  deviceLifecycleRuns = new Map<string, DeviceLifecycleRun>();
  objectMergeRuns = new Map<string, ObjectMergeRun>();
  objectMergeUndo = new Map<
    string,
    {
      targetSnapshot: GraphObject;
      sourceSnapshot: GraphObject;
      relationshipSnapshots: GraphRelationship[];
      workItemSnapshots: WorkItem[];
    }
  >();

  createId(): string {
    return uuidv4();
  }

  pushTimeline(event: Omit<TimelineEvent, "id">): TimelineEvent {
    const fullEvent: TimelineEvent = {
      ...event,
      id: this.createId()
    };
    this.timeline.push(fullEvent);
    return fullEvent;
  }

  listTimelineForEntity(entityId: string): TimelineEvent[] {
    return this.timeline.filter((event) => event.entityId === entityId);
  }

  listTimelineForWorkItem(workItemId: string): TimelineEvent[] {
    return this.timeline.filter((event) => event.workItemId === workItemId || event.entityId === workItemId);
  }
}
