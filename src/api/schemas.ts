import { z } from "zod";
import {
  coreObjectTypes,
  relationshipTypes,
  workItemStatuses,
  workItemTypes
} from "../domain/types";

export const objectCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  type: z.enum(coreObjectTypes),
  fields: z.record(z.string(), z.unknown())
});

export const objectUpdateSchema = z.object({
  fields: z.record(z.string(), z.unknown())
});

export const objectManualOverrideSchema = z.object({
  field: z.string().min(1),
  value: z.unknown(),
  reason: z.string().min(1),
  overrideUntil: z.string().datetime().optional()
});

export const objectMergePreviewSchema = z.object({
  targetObjectId: z.string().min(1),
  sourceObjectId: z.string().min(1)
});

export const objectMergeExecuteSchema = z.object({
  targetObjectId: z.string().min(1),
  sourceObjectId: z.string().min(1),
  reason: z.string().min(1)
});

export const relationshipCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  type: z.enum(relationshipTypes),
  fromObjectId: z.string().min(1),
  toObjectId: z.string().min(1)
});

export const relationshipUnlinkSchema = z.object({
  reason: z.string().min(1)
});

export const objectChildCreateSchema = z.object({
  childType: z.enum(coreObjectTypes),
  relationshipType: z.enum(relationshipTypes).default("contains"),
  fields: z.record(z.string(), z.unknown()).default({})
});

export const objectWorkflowStartSchema = z.object({
  definitionId: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).default({})
});

export const lostStolenReportSchema = z.object({
  reporterId: z.string().min(1),
  lastKnownLocation: z.string().min(1),
  occurredAt: z.string().datetime(),
  circumstances: z.string().min(1),
  suspectedTheft: z.boolean().default(false),
  requestImmediateLock: z.boolean().default(true),
  requestWipe: z.boolean().default(false),
  createCredentialRotationTask: z.boolean().default(true)
});

export const deviceAcknowledgementSchema = z.object({
  type: z.enum(["receipt", "return-shipment"]),
  acknowledgedBy: z.string().min(1),
  note: z.string().optional()
});

export const signalIngestSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  sourceId: z.string().min(1),
  objectType: z.enum(coreObjectTypes),
  externalId: z.string().min(1),
  snapshot: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1)
});

export const workItemCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  type: z.enum(workItemTypes),
  priority: z.enum(["P0", "P1", "P2", "P3", "P4"]),
  title: z.string().min(1),
  description: z.string().optional(),
  requesterId: z.string().min(1),
  assigneeId: z.string().optional(),
  assignmentGroup: z.string().optional(),
  linkedObjectIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  responseSlaAt: z.string().datetime().optional(),
  resolutionSlaAt: z.string().datetime().optional()
});

export const workItemUpdateSchema = z.object({
  status: z.enum(workItemStatuses).optional(),
  assigneeId: z.string().optional(),
  assignmentGroup: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3", "P4"]).optional(),
  tags: z.array(z.string()).optional()
});

export const workItemBulkActionSchema = z
  .object({
    workItemIds: z.array(z.string().min(1)).min(1),
    action: z.enum(["assign", "priority", "tag", "comment", "workflow-step", "export"]),
    assigneeId: z.string().optional(),
    assignmentGroup: z.string().optional(),
    priority: z.enum(["P0", "P1", "P2", "P3", "P4"]).optional(),
    tag: z.string().optional(),
    comment: z.string().optional(),
    workflowStep: z.enum(["triage", "start", "wait", "block", "complete", "cancel"]).optional()
  })
  .superRefine((value, ctx) => {
    if (value.action === "assign" && !value.assigneeId && !value.assignmentGroup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assigneeId or assignmentGroup is required for assign action"
      });
    }
    if (value.action === "priority" && !value.priority) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "priority is required for priority action"
      });
    }
    if (value.action === "tag" && !value.tag) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "tag is required for tag action"
      });
    }
    if (value.action === "comment" && !value.comment) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment is required for comment action"
      });
    }
    if (value.action === "workflow-step" && !value.workflowStep) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "workflowStep is required for workflow-step action"
      });
    }
  });

export const runWorkflowSchema = z.object({
  definitionId: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).default({}),
  linkedWorkItemId: z.string().optional()
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().optional()
});

export const commentCreateSchema = z.object({
  body: z.string().min(1),
  mentions: z.array(z.string()).default([])
});

export const attachmentCreateSchema = z.object({
  fileName: z.string().min(1),
  url: z.string().url()
});

export const customSchemaCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  pluralName: z.string().min(1),
  description: z.string().optional(),
  fields: z
    .array(
      z.object({
        name: z.string().min(1),
        type: z.enum(["string", "number", "date", "enum", "bool", "json"]),
        required: z.boolean().default(false),
        allowedValues: z.array(z.string()).optional()
      })
    )
    .default([]),
  relationships: z.array(z.enum(relationshipTypes)).default([])
});

export const policyCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  objectType: z.enum(coreObjectTypes),
  severity: z.enum(["low", "medium", "high"]),
  expression: z.object({
    field: z.string().min(1),
    operator: z.enum(["equals", "not_equals", "includes", "exists", "lt", "gt"]),
    value: z.union([z.string(), z.number(), z.boolean()]).optional()
  }),
  remediation: z.object({
    notify: z.boolean().default(true),
    createTask: z.boolean().default(true),
    escalationDays: z.number().int().positive().optional(),
    quarantine: z.boolean().optional()
  }),
  active: z.boolean().default(true)
});

export const policyExceptionActionSchema = z.object({
  action: z.enum(["waive", "resolve", "reopen", "renew"]),
  reason: z.string().min(1),
  waiverExpiresAt: z.string().datetime().optional()
});

export const connectorCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["HRIS", "IdP", "MDM", "EDR", "Cloud", "ServiceDesk", "FileImport"]),
  mode: z.enum(["import", "export", "bidirectional", "event"]),
  fieldMappings: z.record(z.string(), z.string()).default({}),
  transforms: z
    .array(
      z.object({
        id: z.string().optional(),
        field: z.string(),
        type: z.string(),
        config: z.record(z.string(), z.unknown()).default({})
      })
    )
    .default([]),
  filters: z.array(z.object({ id: z.string().optional(), expression: z.string() })).default([])
});

export const connectorRunSchema = z.object({
  mode: z.enum(["test", "dry-run", "sync"])
});

export const notificationRuleCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  trigger: z.enum([
    "status_change",
    "approval_needed",
    "sla_breach",
    "action_failed",
    "shipment_pending",
    "reclaim_warning"
  ]),
  channels: z.array(z.enum(["in-app", "email", "chat"])).min(1),
  enabled: z.boolean().default(true)
});

export const configVersionCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  kind: z.enum(["workflow", "policy", "catalog", "schema", "rbac"]),
  name: z.string().min(1),
  reason: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});

export const configVersionPublishSchema = z.object({
  state: z.enum(["published", "rolled_back"]),
  reason: z.string().min(1)
});

export const savedViewCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  objectType: z.string().min(1),
  filters: z.record(z.string(), z.unknown()).default({}),
  columns: z.array(z.string()).default([])
});

export const externalTicketLinkCreateSchema = z.object({
  workItemId: z.string().min(1),
  provider: z.enum(["ServiceNow", "Jira", "Other"]),
  externalTicketId: z.string().min(1),
  externalUrl: z.string().url().optional()
});

export const csvPreviewSchema = z.object({
  objectType: z.enum(coreObjectTypes),
  rows: z.array(z.record(z.string(), z.unknown())).min(1),
  fieldMapping: z.record(z.string(), z.string()).default({})
});

export const aiPromptSchema = z.object({
  prompt: z.string().min(1)
});

export const workflowDefinitionCreateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  playbook: z.string().min(1),
  trigger: z.object({
    kind: z.enum(["event", "schedule", "manual"]),
    value: z.string().min(1)
  }),
  steps: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1),
        type: z.enum([
          "human-task",
          "approval",
          "automation",
          "condition",
          "wait",
          "notification",
          "update-object",
          "create-work-item"
        ]),
        riskLevel: z.enum(["low", "medium", "high"]),
        config: z.record(z.string(), z.unknown()).default({})
      })
    )
    .min(1)
});

export const workflowDefinitionStateSchema = z.object({
  action: z.enum(["publish", "rollback"]),
  reason: z.string().min(1)
});

export const workflowSimulationSchema = z.object({
  inputs: z.record(z.string(), z.unknown()).default({})
});

export const approvalDelegationSchema = z.object({
  approverId: z.string().min(1),
  comment: z.string().optional()
});

export const approvalExpirySchema = z.object({
  expiresAt: z.string().datetime()
});

export const approvalEscalationRunSchema = z.object({
  fallbackApproverId: z.string().min(1).default("it-admin-escalation"),
  dryRun: z.boolean().default(false)
});

export const exceptionActionSchema = z.object({
  action: z.enum(["retry", "resolve", "escalate"]),
  reason: z.string().min(1)
});

export const fieldRestrictionCreateSchema = z.object({
  objectType: z.enum(coreObjectTypes),
  field: z.string().min(1),
  readRoles: z
    .array(
      z.enum([
        "end-user",
        "it-agent",
        "asset-manager",
        "it-admin",
        "security-analyst",
        "finance",
        "app-owner",
        "auditor"
      ])
    )
    .min(1),
  writeRoles: z
    .array(
      z.enum([
        "end-user",
        "it-agent",
        "asset-manager",
        "it-admin",
        "security-analyst",
        "finance",
        "app-owner",
        "auditor"
      ])
    )
    .min(1),
  maskStyle: z.enum(["hidden", "redacted"]).optional()
});

export const sodRuleCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  requestTypes: z.array(z.enum(workItemTypes)).min(1),
  enabled: z.boolean().default(true)
});

export const approvalMatrixRuleCreateSchema = z.object({
  name: z.string().min(1),
  requestType: z.enum(workItemTypes),
  riskLevel: z.enum(["low", "medium", "high"]),
  costThreshold: z.number().nonnegative().optional(),
  approverTypes: z.array(z.enum(["manager", "app-owner", "security", "finance", "it", "custom"])).min(1),
  enabled: z.boolean().default(true)
});

const catalogFormFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["string", "number", "date", "enum", "bool", "text"]),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional(),
  requiredIf: z
    .object({
      key: z.string().min(1),
      equals: z.union([z.string(), z.number(), z.boolean()])
    })
    .optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional()
});

const catalogFormFieldUpdateSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["string", "number", "date", "enum", "bool", "text"]),
  required: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  requiredIf: z
    .object({
      key: z.string().min(1),
      equals: z.union([z.string(), z.number(), z.boolean()])
    })
    .optional(),
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional()
});

export const catalogItemCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  audience: z.array(z.string()).default([]),
  regions: z.array(z.string()).default([]),
  expectedDelivery: z.string().min(1),
  formFields: z.array(catalogFormFieldSchema).default([]),
  defaultWorkflowDefinitionId: z.string().optional(),
  riskLevel: z.enum(["low", "medium", "high"]).default("medium"),
  active: z.boolean().default(true)
});

export const catalogItemUpdateSchema = z.object({
  tenantId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  audience: z.array(z.string()).optional(),
  regions: z.array(z.string()).optional(),
  expectedDelivery: z.string().min(1).optional(),
  formFields: z.array(catalogFormFieldUpdateSchema).optional(),
  defaultWorkflowDefinitionId: z.string().optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  active: z.boolean().optional()
});

export const catalogPreviewSchema = z.object({
  fieldValues: z.record(z.string(), z.unknown()).default({})
});

export const catalogSubmitSchema = z.object({
  catalogItemId: z.string().min(1),
  requesterId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  estimatedCost: z.number().nonnegative().optional(),
  fieldValues: z.record(z.string(), z.unknown()).default({})
});

export const externalTicketCommentSchema = z.object({
  body: z.string().min(1)
});

export const cloudTagCoverageSchema = z.object({
  requiredTags: z.array(z.string().min(1)).optional()
});

export const cloudTagEnforceSchema = z.object({
  requiredTags: z.array(z.string().min(1)).optional(),
  dryRun: z.boolean().default(true),
  autoTag: z.boolean().default(true)
});

export const saasReclaimPolicyCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  appName: z.string().min(1),
  inactivityDays: z.number().int().positive(),
  warningDays: z.number().int().nonnegative().default(7),
  autoReclaim: z.boolean().default(true),
  schedule: z.enum(["manual", "daily", "weekly"]).default("manual"),
  enabled: z.boolean().default(true),
  nextRunAt: z.string().datetime().optional()
});

export const saasReclaimPolicyUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  appName: z.string().min(1).optional(),
  inactivityDays: z.number().int().positive().optional(),
  warningDays: z.number().int().nonnegative().optional(),
  autoReclaim: z.boolean().optional(),
  schedule: z.enum(["manual", "daily", "weekly"]).optional(),
  enabled: z.boolean().optional(),
  nextRunAt: z.string().datetime().optional()
});

export const saasReclaimRunCreateSchema = z.object({
  policyId: z.string().min(1),
  mode: z.enum(["dry-run", "live"]).default("dry-run")
});

export const saasReclaimRunRetrySchema = z.object({
  mode: z.enum(["dry-run", "live"]).default("live")
});

export const contractRenewalOverviewSchema = z.object({
  daysAhead: z.number().int().positive().max(365).default(90)
});

export const contractRenewalRunSchema = z.object({
  daysAhead: z.number().int().positive().max(365).default(90),
  mode: z.enum(["dry-run", "live"]).default("dry-run")
});

export const reportDefinitionCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  objectType: z.enum(coreObjectTypes).optional(),
  filters: z
    .object({
      containsText: z.string().optional(),
      fieldEquals: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({})
    })
    .default({ fieldEquals: {} }),
  columns: z.array(z.string().min(1)).min(1).default(["id", "type"]),
  schedule: z
    .object({
      frequency: z.enum(["manual", "daily", "weekly"]),
      hourUtc: z.number().int().min(0).max(23).optional()
    })
    .optional(),
  enabled: z.boolean().default(true)
});

export const reportDefinitionUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  objectType: z.enum(coreObjectTypes).optional(),
  filters: z
    .object({
      containsText: z.string().optional(),
      fieldEquals: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({})
    })
    .optional(),
  columns: z.array(z.string().min(1)).min(1).optional(),
  schedule: z
    .object({
      frequency: z.enum(["manual", "daily", "weekly"]),
      hourUtc: z.number().int().min(0).max(23).optional()
    })
    .optional(),
  enabled: z.boolean().optional()
});

export const reportRunCreateSchema = z.object({
  trigger: z.enum(["manual", "scheduled"]).default("manual")
});

export const jmlJoinerPreviewSchema = z.object({
  existingPersonId: z.string().min(1).optional(),
  legalName: z.string().min(1),
  email: z.string().email(),
  startDate: z.string().datetime().optional(),
  location: z.string().min(1),
  role: z.string().min(1),
  managerId: z.string().optional(),
  employmentType: z.enum(["employee", "contractor", "intern"]).default("employee"),
  requiredApps: z.array(z.string().min(1)).default([]),
  deviceTypePreference: z.enum(["laptop", "desktop", "phone", "tablet"]).default("laptop"),
  remote: z.boolean().default(true),
  requesterId: z.string().min(1)
});

export const jmlJoinerExecuteSchema = z.object({
  existingPersonId: z.string().min(1).optional(),
  legalName: z.string().min(1),
  email: z.string().email(),
  startDate: z.string().datetime().optional(),
  location: z.string().min(1),
  role: z.string().min(1),
  managerId: z.string().optional(),
  employmentType: z.enum(["employee", "contractor", "intern"]).default("employee"),
  requiredApps: z.array(z.string().min(1)).default([]),
  deviceTypePreference: z.enum(["laptop", "desktop", "phone", "tablet"]).default("laptop"),
  remote: z.boolean().default(true),
  requesterId: z.string().min(1),
  reason: z.string().min(1)
});

export const jmlMoverPreviewSchema = z.object({
  personId: z.string().min(1),
  targetRole: z.string().min(1),
  targetDepartment: z.string().optional(),
  targetLocation: z.string().optional(),
  requesterId: z.string().min(1)
});

export const jmlMoverExecuteSchema = z.object({
  personId: z.string().min(1),
  targetRole: z.string().min(1),
  targetDepartment: z.string().optional(),
  targetLocation: z.string().optional(),
  requesterId: z.string().min(1),
  reason: z.string().min(1)
});

export const jmlLeaverPreviewSchema = z.object({
  personId: z.string().min(1),
  effectiveDate: z.string().datetime().optional(),
  region: z.string().optional(),
  legalHold: z.boolean().default(false),
  vip: z.boolean().default(false),
  contractorConversion: z.boolean().default(false),
  deviceRecoveryState: z.enum(["pending", "recovered", "not-recovered"]).default("pending"),
  requesterId: z.string().min(1)
});

export const jmlLeaverExecuteSchema = z.object({
  personId: z.string().min(1),
  effectiveDate: z.string().datetime().optional(),
  region: z.string().optional(),
  legalHold: z.boolean().default(false),
  vip: z.boolean().default(false),
  contractorConversion: z.boolean().default(false),
  deviceRecoveryState: z.enum(["pending", "recovered", "not-recovered"]).default("pending"),
  requesterId: z.string().min(1),
  reason: z.string().min(1)
});

export const deviceLifecyclePreviewSchema = z.object({
  deviceId: z.string().min(1).optional(),
  targetStage: z.enum(["request", "fulfill", "deploy", "monitor", "service", "return", "retire"]),
  location: z.string().optional(),
  stockroom: z.string().optional(),
  assigneePersonId: z.string().optional(),
  remoteReturn: z.boolean().default(true),
  requesterId: z.string().min(1),
  model: z.string().optional(),
  vendor: z.string().optional(),
  issueSummary: z.string().optional(),
  retirementReason: z.string().optional()
});

export const deviceLifecycleExecuteSchema = z.object({
  deviceId: z.string().min(1).optional(),
  targetStage: z.enum(["request", "fulfill", "deploy", "monitor", "service", "return", "retire"]),
  location: z.string().optional(),
  stockroom: z.string().optional(),
  assigneePersonId: z.string().optional(),
  remoteReturn: z.boolean().default(true),
  requesterId: z.string().min(1),
  model: z.string().optional(),
  vendor: z.string().optional(),
  issueSummary: z.string().optional(),
  retirementReason: z.string().optional(),
  reason: z.string().min(1)
});
