import { ErrorRequestHandler, Router } from "express";
import { ZodError } from "zod";
import {
  ApiActor,
  ApprovalMatrixRule,
  CatalogItemDefinition,
  ConfigVersion,
  ConnectorConfig,
  ConnectorRun,
  ContractRenewalRun,
  CustomObjectSchema,
  DeviceLifecyclePlan,
  DeviceLifecycleRun,
  ExternalTicketComment,
  ExternalTicketLink,
  FieldRestriction,
  ApprovalRecord,
  GraphObject,
  GraphRelationship,
  JmlJoinerPlan,
  JmlJoinerRun,
  JmlLeaverPlan,
  JmlLeaverRun,
  JmlMoverPlan,
  JmlMoverRun,
  ObjectMergeRun,
  NotificationRule,
  PolicyDefinition,
  ReportDefinition,
  ReportRun,
  SaasReclaimPolicy,
  SaasReclaimRun,
  SavedView,
  SodRule,
  SourceSignal,
  WorkItem,
  UserRole
} from "../domain/types";
import { ApexStore } from "../store/store";
import { nowIso } from "../utils/time";
import { can } from "../services/rbac";
import {
  approvalDecisionSchema,
  approvalEscalationRunSchema,
  approvalExpirySchema,
  approvalChainCreateSchema,
  approvalMatrixRuleCreateSchema,
  aiPromptSchema,
  attachmentCreateSchema,
  approvalDelegationSchema,
  catalogItemCreateSchema,
  catalogItemUpdateSchema,
  catalogPreviewSchema,
  catalogSubmitSchema,
  cloudTagCoverageSchema,
  cloudTagEnforceSchema,
  commentCreateSchema,
  infoRequestResponseSchema,
  configVersionCreateSchema,
  configVersionPublishSchema,
  connectorCreateSchema,
  connectorRunSchema,
  deviceAcknowledgementSchema,
  csvPreviewSchema,
  customSchemaCreateSchema,
  deviceLifecycleExecuteSchema,
  deviceLifecyclePreviewSchema,
  exceptionActionSchema,
  externalTicketCommentSchema,
  externalTicketLinkCreateSchema,
  fieldRestrictionCreateSchema,
  lostStolenReportSchema,
  notificationRuleCreateSchema,
  objectChildCreateSchema,
  objectMergeExecuteSchema,
  objectMergePreviewSchema,
  objectManualOverrideSchema,
  objectWorkflowStartSchema,
  objectCreateSchema,
  objectUpdateSchema,
  policyExceptionActionSchema,
  policyCreateSchema,
  jmlMoverPreviewSchema,
  jmlMoverExecuteSchema,
  jmlLeaverPreviewSchema,
  jmlLeaverExecuteSchema,
  reportDefinitionCreateSchema,
  reportDefinitionUpdateSchema,
  reportRunCreateSchema,
  relationshipCreateSchema,
  relationshipUnlinkSchema,
  runWorkflowSchema,
  savedViewCreateSchema,
  contractRenewalOverviewSchema,
  contractRenewalRunSchema,
  signalIngestSchema,
  jmlJoinerPreviewSchema,
  jmlJoinerExecuteSchema,
  saasReclaimPolicyCreateSchema,
  saasReclaimPolicyUpdateSchema,
  saasReclaimRunCreateSchema,
  saasReclaimRunRetrySchema,
  sodRuleCreateSchema,
  workflowDefinitionCreateSchema,
  workflowDefinitionStateSchema,
  workflowSimulationSchema,
  workItemBulkActionSchema,
  workItemCreateSchema,
  workItemUpdateSchema
} from "./schemas";
import { findCandidates, ingestSignal } from "../services/reconciliation";
import { computeQualityDashboard } from "../services/quality";
import { buildEvidencePackage } from "../services/evidence";
import { WorkflowEngine } from "../services/workflowEngine";
import { evaluatePolicy } from "../services/policyEngine";
import { computeSlaBreaches } from "../services/sla";
import { approvalsForRequest, canWriteField, maskObjectForActor, validateSod } from "../services/governance";

const roles: UserRole[] = [
  "end-user",
  "it-agent",
  "asset-manager",
  "it-admin",
  "security-analyst",
  "finance",
  "app-owner",
  "auditor"
];

const getActor = (headers: Record<string, string | string[] | undefined>): ApiActor => {
  const roleValue = String(headers["x-actor-role"] ?? "it-admin") as UserRole;
  const role = roles.includes(roleValue) ? roleValue : "it-admin";
  return {
    id: String(headers["x-actor-id"] ?? "system"),
    role
  };
};

const permission = (allowed: boolean): { ok: true } => {
  if (!allowed) {
    throw new Error("Permission denied");
  }
  return { ok: true };
};

const defaultCloudTags = ["owner", "cost_center", "environment", "data_classification"];

const parseResourceTags = (value: unknown): Record<string, string> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>((acc, [key, raw]) => {
      acc[key] = String(raw);
      return acc;
    }, {});
  }
  if (Array.isArray(value)) {
    return value.reduce<Record<string, string>>((acc, entry) => {
      const [key, raw] = String(entry).split("=");
      if (key && raw) {
        acc[key.trim()] = raw.trim();
      }
      return acc;
    }, {});
  }
  return {};
};

const missingTagsForResource = (object: GraphObject, requiredTags: string[]): string[] => {
  const tags = parseResourceTags(object.fields.tags);
  return requiredTags.filter((tag) => {
    const value = tags[tag];
    return value === undefined || value === "";
  });
};

const getInactiveDays = (lastActiveRaw: unknown): number => {
  if (typeof lastActiveRaw !== "string") {
    return Number.POSITIVE_INFINITY;
  }
  const last = new Date(lastActiveRaw).getTime();
  if (Number.isNaN(last)) {
    return Number.POSITIVE_INFINITY;
  }
  const diffMs = Date.now() - last;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
};

const parseIsoDate = (value: unknown): Date | null => {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const daysUntilDate = (date: Date): number => {
  const diffMs = date.getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
};

const escapeCsv = (value: unknown): string => `"${String(value ?? "").replace(/"/g, '""')}"`;

const roleEntitlementCatalog: Record<string, { groups: string[]; apps: string[] }> = {
  engineer: {
    groups: ["eng-base", "repo-read", "deploy-read"],
    apps: ["GitHub", "Slack", "Jira"]
  },
  "senior-engineer": {
    groups: ["eng-base", "repo-write", "deploy-write"],
    apps: ["GitHub", "Slack", "Jira", "Datadog"]
  },
  manager: {
    groups: ["mgr-base", "repo-read", "budget-approver"],
    apps: ["Slack", "Jira", "Workday"]
  },
  finance: {
    groups: ["finance-base", "billing-read", "budget-approver"],
    apps: ["NetSuite", "Slack", "Workday"]
  },
  "it-admin": {
    groups: ["it-admin", "directory-admin", "device-admin"],
    apps: ["Okta", "Jamf", "Slack"]
  }
};

const normalizeRoleKey = (role: string): string => role.trim().toLowerCase().replace(/\s+/g, "-");

const workflowStepStatusMap = {
  triage: "Triaged",
  start: "In Progress",
  wait: "Waiting",
  block: "Blocked",
  complete: "Completed",
  cancel: "Canceled"
} as const;

export const createRoutes = (store: ApexStore): Router => {
  const router = Router();
  const workflows = new WorkflowEngine(store);
  const now = nowIso();

  const catalogItems = [
    {
      id: "cat-laptop",
      name: "Request laptop/device",
      category: "Devices",
      audience: ["employee", "contractor"],
      expectedDelivery: "3-5 business days",
      description: "Role-based device bundle with accessories and compliance baseline."
    },
    {
      id: "cat-saas-access",
      name: "Request software/SaaS access",
      category: "SaaS",
      audience: ["employee", "contractor"],
      expectedDelivery: "<1 business day",
      description: "Entitlement-based access request with policy-driven approvals."
    },
    {
      id: "cat-admin",
      name: "Request admin privileges",
      category: "Security",
      audience: ["employee"],
      expectedDelivery: "4 hours",
      description: "Time-bound privileged access with strict approval and attestations."
    }
  ];

  const kbArticles = [
    {
      id: "kb-mac-setup",
      title: "Set up your new device in 15 minutes",
      category: "Onboarding",
      summary: "Guided enrollment, compliance checks, and baseline app setup.",
      updatedAt: now
    },
    {
      id: "kb-admin-access",
      title: "Requesting temporary admin privileges",
      category: "Access",
      summary: "Approval policy, expiry windows, and safe operating expectations.",
      updatedAt: now
    },
    {
      id: "kb-lost-device",
      title: "What to do if a device is lost or stolen",
      category: "Security",
      summary: "Immediate reporting and lock/wipe response workflow.",
      updatedAt: now
    }
  ];

  const integrationsHealth = [
    {
      id: "int-workday",
      name: "Workday-like HRIS",
      type: "HRIS",
      status: "Healthy",
      lastSuccessfulSync: now,
      ingested: 1844,
      updated: 44,
      failed: 0,
      message: "Hire/termination feed is current."
    },
    {
      id: "int-okta",
      name: "Okta-like IdP",
      type: "IdP",
      status: "Degraded",
      lastSuccessfulSync: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      ingested: 3088,
      updated: 123,
      failed: 13,
      message: "Rate-limited by provider. Retry with backoff is active."
    },
    {
      id: "int-cs",
      name: "CrowdStrike-like EDR",
      type: "EDR",
      status: "Failed",
      lastSuccessfulSync: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      ingested: 0,
      updated: 0,
      failed: 67,
      message: "API token invalid. Re-authentication required."
    }
  ];

  const dashboards = {
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

  if (store.slaRules.size === 0) {
    const baselineRules: Array<{
      id: string;
      tenantId: string;
      workspaceId: string;
      workItemType: "Request" | "Incident";
      priority: "P1" | "P2";
      assignmentGroup: string;
      region: string;
      responseMinutes: number;
      resolutionMinutes: number;
      pauseStatuses: Array<"Waiting">;
      active: boolean;
    }> = [
      {
        id: "sla-request-p2",
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        workItemType: "Request",
        priority: "P2",
        assignmentGroup: "*",
        region: "global",
        responseMinutes: 120,
        resolutionMinutes: 1440,
        pauseStatuses: ["Waiting"],
        active: true
      },
      {
        id: "sla-incident-p1",
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        workItemType: "Incident",
        priority: "P1",
        assignmentGroup: "*",
        region: "global",
        responseMinutes: 30,
        resolutionMinutes: 240,
        pauseStatuses: ["Waiting"],
        active: true
      }
    ];

    for (const rule of baselineRules) {
      store.slaRules.set(rule.id, { ...rule });
    }
  }

  if (store.catalogItems.size === 0) {
    for (const item of catalogItems) {
      const catalogItem: CatalogItemDefinition = {
        id: item.id,
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: item.name,
        description: item.description,
        category: item.category,
        audience: item.audience,
        regions: ["global"],
        expectedDelivery: item.expectedDelivery,
        formFields: [
          {
            id: store.createId(),
            key: "business_justification",
            label: "Business Justification",
            type: "text",
            required: true
          }
        ],
        riskLevel: item.id === "cat-admin" ? "high" : "medium",
        defaultWorkflowDefinitionId:
          item.id === "cat-saas-access" ? "wf-saas-access-v1" : item.id === "cat-laptop" ? "wf-jml-joiner-v1" : undefined,
        active: true,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.catalogItems.set(catalogItem.id, catalogItem);
    }
  }

  if (store.sodRules.size === 0) {
    const sod: SodRule = {
      id: "sod-req-approval",
      name: "Requester cannot approve own request",
      description: "Prevents requester from approving the same request type.",
      requestTypes: ["Request", "Change"],
      enabled: true
    };
    store.sodRules.set(sod.id, sod);
  }

  if (store.approvalMatrixRules.size === 0) {
    const baseline: ApprovalMatrixRule[] = [
      {
        id: "am-request-medium",
        name: "Standard request approvals",
        requestType: "Request",
        riskLevel: "medium",
        approverTypes: ["manager"],
        enabled: true
      },
      {
        id: "am-request-high",
        name: "High risk request approvals",
        requestType: "Request",
        riskLevel: "high",
        approverTypes: ["manager", "security"],
        enabled: true
      }
    ];
    for (const rule of baseline) {
      store.approvalMatrixRules.set(rule.id, rule);
    }
  }

  if (store.saasReclaimPolicies.size === 0) {
    const baselinePolicy: SaasReclaimPolicy = {
      id: "saas-reclaim-figma",
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      name: "Figma inactive seat reclaim",
      appName: "Figma",
      inactivityDays: 30,
      warningDays: 7,
      autoReclaim: true,
      schedule: "weekly",
      enabled: true,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.saasReclaimPolicies.set(baselinePolicy.id, baselinePolicy);
  }

  if (store.reportDefinitions.size === 0) {
    const baselineReports: ReportDefinition[] = [
      {
        id: "report-stale-devices",
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: "Stale Devices",
        description: "Devices that have not checked in recently.",
        objectType: "Device",
        filters: {
          containsText: "last_checkin",
          fieldEquals: {}
        },
        columns: ["id", "type", "asset_tag", "serial_number", "last_checkin", "compliance_state"],
        schedule: {
          frequency: "weekly",
          hourUtc: 14
        },
        enabled: true,
        createdBy: "system",
        createdAt: nowIso(),
        updatedAt: nowIso()
      },
      {
        id: "report-active-saas-accounts",
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: "Active SaaS Accounts",
        description: "Active SaaS accounts for entitlement review.",
        objectType: "SaaSAccount",
        filters: {
          containsText: "active",
          fieldEquals: { status: "active" }
        },
        columns: ["id", "type", "app", "person", "status", "last_active"],
        schedule: {
          frequency: "daily",
          hourUtc: 13
        },
        enabled: true,
        createdBy: "system",
        createdAt: nowIso(),
        updatedAt: nowIso()
      }
    ];
    for (const report of baselineReports) {
      store.reportDefinitions.set(report.id, report);
    }
  }

  const runSaasReclaim = (
    policy: SaasReclaimPolicy,
    actorId: string,
    mode: "dry-run" | "live" | "retry",
    includeAccountIds?: Set<string>
  ): SaasReclaimRun => {
    const accounts = [...store.objects.values()].filter((object) => {
      if (object.type !== "SaaSAccount") {
        return false;
      }
      const app = String(object.fields.app ?? "");
      const appMatch = policy.appName === "*" || app.toLowerCase() === policy.appName.toLowerCase();
      const includeMatch = includeAccountIds ? includeAccountIds.has(object.id) : true;
      return appMatch && includeMatch;
    });

    const candidates = accounts.filter((account) => {
      const status = String(account.fields.status ?? "").toLowerCase();
      if (status === "deprovisioned" || status === "inactive" || status === "revoked") {
        return false;
      }
      const inactiveDays = getInactiveDays(account.fields.last_active ?? account.fields.lastActive);
      return inactiveDays >= policy.inactivityDays;
    });

    let reclaimedCount = 0;
    let failedCount = 0;
    const createdExceptionIds: string[] = [];

    const runCandidates = candidates.map((candidate) => {
      const daysInactive = getInactiveDays(candidate.fields.last_active ?? candidate.fields.lastActive);

      if (candidate.fields.simulate_reclaim_failure === true) {
        failedCount += 1;
        if (mode !== "dry-run") {
          const exception: WorkItem = {
            id: store.createId(),
            tenantId: candidate.tenantId,
            workspaceId: candidate.workspaceId,
            type: "Exception",
            status: "Submitted",
            priority: "P2",
            title: `License reclaim failed for ${String(candidate.fields.app ?? candidate.id)}`,
            description: `Automatic reclaim failed for account ${candidate.id}.`,
            requesterId: actorId,
            assignmentGroup: "SaaS Governance",
            linkedObjectIds: [candidate.id],
            tags: ["saas", "license-reclaim", "automation-failed"],
            comments: [],
            attachments: [],
            createdAt: nowIso(),
            updatedAt: nowIso()
          };
          store.workItems.set(exception.id, exception);
          createdExceptionIds.push(exception.id);
        }
        return {
          accountObjectId: candidate.id,
          app: String(candidate.fields.app ?? "Unknown"),
          personId: String(candidate.fields.person ?? candidate.fields.person_id ?? ""),
          daysInactive,
          action: "failed" as const,
          reason: "Reclaim execution failed. Routed to exception queue."
        };
      }

      if (mode === "dry-run") {
        return {
          accountObjectId: candidate.id,
          app: String(candidate.fields.app ?? "Unknown"),
          personId: String(candidate.fields.person ?? candidate.fields.person_id ?? ""),
          daysInactive,
          action: "none" as const,
          reason: "Would reclaim on live execution."
        };
      }

      if (!policy.autoReclaim) {
        return {
          accountObjectId: candidate.id,
          app: String(candidate.fields.app ?? "Unknown"),
          personId: String(candidate.fields.person ?? candidate.fields.person_id ?? ""),
          daysInactive,
          action: "skipped" as const,
          reason: "Auto reclaim disabled. Requires manual review."
        };
      }

      candidate.fields = {
        ...candidate.fields,
        status: "deprovisioned",
        deprovisioned_at: nowIso()
      };
      candidate.updatedAt = nowIso();
      store.objects.set(candidate.id, candidate);
      reclaimedCount += 1;

      store.pushTimeline({
        tenantId: candidate.tenantId,
        workspaceId: candidate.workspaceId,
        entityType: "object",
        entityId: candidate.id,
        eventType: "object.updated",
        actor: actorId,
        createdAt: nowIso(),
        payload: {
          saasReclaim: true,
          policyId: policy.id,
          status: "deprovisioned"
        }
      });

      return {
        accountObjectId: candidate.id,
        app: String(candidate.fields.app ?? "Unknown"),
        personId: String(candidate.fields.person ?? candidate.fields.person_id ?? ""),
        daysInactive,
        action: "reclaimed" as const,
        reason: "Account deprovisioned and license reclaimed."
      };
    });

    let status: SaasReclaimRun["status"] = "success";
    if (failedCount > 0 && reclaimedCount > 0) {
      status = "partial";
    } else if (failedCount > 0 && reclaimedCount === 0) {
      status = "failed";
    }

    const run: SaasReclaimRun = {
      id: store.createId(),
      policyId: policy.id,
      mode,
      status,
      startedAt: nowIso(),
      completedAt: nowIso(),
      scannedAccounts: accounts.length,
      candidateCount: candidates.length,
      reclaimedCount,
      failedCount,
      createdExceptionIds,
      candidates: runCandidates
    };
    store.saasReclaimRuns.set(run.id, run);

    policy.lastRunAt = run.completedAt;
    policy.updatedAt = nowIso();
    store.saasReclaimPolicies.set(policy.id, policy);

    store.pushTimeline({
      tenantId: policy.tenantId,
      workspaceId: policy.workspaceId,
      entityType: "workflow",
      entityId: policy.id,
      eventType: "saas.reclaim.run",
      actor: actorId,
      createdAt: nowIso(),
      payload: {
        mode: run.mode,
        status: run.status,
        candidateCount: run.candidateCount,
        reclaimedCount: run.reclaimedCount,
        failedCount: run.failedCount
      }
    });

    return run;
  };

  const runReportDefinition = (
    definition: ReportDefinition,
    actorId: string,
    trigger: "manual" | "scheduled"
  ): ReportRun => {
    const sourceObjects = [...store.objects.values()].filter((object) =>
      definition.objectType ? object.type === definition.objectType : true
    );

    const matched = sourceObjects.filter((object) => {
      const containsText = definition.filters.containsText?.trim().toLowerCase();
      if (containsText) {
        const haystack = JSON.stringify(object.fields).toLowerCase();
        if (!haystack.includes(containsText)) {
          return false;
        }
      }

      for (const [field, expected] of Object.entries(definition.filters.fieldEquals)) {
        if (String(object.fields[field] ?? "") !== String(expected)) {
          return false;
        }
      }
      return true;
    });

    const columns = definition.columns.length > 0 ? definition.columns : ["id", "type"];
    const rows = matched.map((object) =>
      columns.map((column) => {
        if (column === "id") return object.id;
        if (column === "type") return object.type;
        return object.fields[column] ?? "";
      })
    );

    const header = columns.map((column) => escapeCsv(column)).join(",");
    const lines = rows.map((row) => row.map((value) => escapeCsv(value)).join(","));
    const csv = [header, ...lines].join("\n");
    const now = nowIso();

    const run: ReportRun = {
      id: store.createId(),
      definitionId: definition.id,
      trigger,
      status: "success",
      startedAt: now,
      completedAt: now,
      scannedCount: sourceObjects.length,
      rowCount: matched.length,
      fileName: `${definition.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${now.slice(0, 10)}.csv`,
      format: "csv",
      content: csv,
      ranBy: actorId
    };
    store.reportRuns.set(run.id, run);

    store.pushTimeline({
      tenantId: definition.tenantId,
      workspaceId: definition.workspaceId,
      entityType: "report",
      entityId: definition.id,
      eventType: "report.run",
      actor: actorId,
      createdAt: nowIso(),
      payload: {
        runId: run.id,
        trigger,
        rowCount: run.rowCount,
        scannedCount: run.scannedCount
      }
    });

    return run;
  };

  const deepCopy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

  const buildObjectMergePreview = (targetObjectId: string, sourceObjectId: string) => {
    const target = store.objects.get(targetObjectId);
    const source = store.objects.get(sourceObjectId);

    if (!target || !source) {
      return null;
    }

    if (target.id === source.id) {
      return null;
    }

    if (target.type !== source.type) {
      return null;
    }

    const targetUpdatedAt = new Date(target.updatedAt).getTime();
    const sourceUpdatedAt = new Date(source.updatedAt).getTime();
    const preferSource = sourceUpdatedAt > targetUpdatedAt;

    const fields = [...new Set([...Object.keys(target.fields), ...Object.keys(source.fields)])].sort();
    const fieldDecisions = fields.map((field) => {
      const targetValue = target.fields[field];
      const sourceValue = source.fields[field];

      const targetMissing = targetValue === undefined || targetValue === null || targetValue === "";
      const sourceMissing = sourceValue === undefined || sourceValue === null || sourceValue === "";
      const sameValue = JSON.stringify(targetValue) === JSON.stringify(sourceValue);

      if (targetMissing && !sourceMissing) {
        return {
          field,
          targetValue,
          sourceValue,
          selected: "source" as const,
          reason: "target field is empty"
        };
      }
      if (!targetMissing && sourceMissing) {
        return {
          field,
          targetValue,
          sourceValue,
          selected: "target" as const,
          reason: "source field is empty"
        };
      }
      if (sameValue) {
        return {
          field,
          targetValue,
          sourceValue,
          selected: "target" as const,
          reason: "values are equal"
        };
      }

      return {
        field,
        targetValue,
        sourceValue,
        selected: preferSource ? ("source" as const) : ("target" as const),
        reason: preferSource ? "source is newer" : "target is canonical"
      };
    });

    const movedRelationshipIds = [...store.relationships.values()]
      .filter((relationship) => relationship.fromObjectId === source.id || relationship.toObjectId === source.id)
      .map((relationship) => relationship.id);

    const relinkedWorkItemIds = [...store.workItems.values()]
      .filter((workItem) => workItem.linkedObjectIds.includes(source.id))
      .map((workItem) => workItem.id);

    return {
      target,
      source,
      objectType: target.type,
      fieldDecisions,
      movedRelationshipIds,
      relinkedWorkItemIds
    };
  };

  const parseStringArrayField = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).filter((item) => item.length > 0);
    }
    if (typeof value === "string") {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  const buildDeviceLifecyclePlan = (input: {
    deviceId?: string;
    targetStage: "request" | "fulfill" | "deploy" | "monitor" | "service" | "return" | "retire";
    location?: string;
    stockroom?: string;
    assigneePersonId?: string;
    remoteReturn: boolean;
    requesterId: string;
    model?: string;
    vendor?: string;
    issueSummary?: string;
    retirementReason?: string;
  }): DeviceLifecyclePlan | null => {
    const device = input.deviceId ? store.objects.get(input.deviceId) : undefined;
    if (input.deviceId && (!device || device.type !== "Device")) {
      return null;
    }

    const currentStage = String(device?.fields.lifecycle_stage ?? "request") as DeviceLifecyclePlan["currentStage"];
    const targetStage = input.targetStage;

    const riskLevel =
      targetStage === "retire" ? "high" : targetStage === "service" || targetStage === "return" ? "medium" : "low";

    const approvalsRequiredSet = new Set(
      approvalsForRequest([...store.approvalMatrixRules.values()], "Change", riskLevel, {
        region: input.location,
        tags: ["device-lifecycle", input.targetStage],
        linkedObjectTypes: ["Device"]
      })
    );
    approvalsRequiredSet.add("manager");
    if (targetStage === "retire") {
      approvalsRequiredSet.add("security");
      approvalsRequiredSet.add("finance");
    }
    if (targetStage === "service") {
      approvalsRequiredSet.add("it");
    }

    const stageStepTemplates: Record<DeviceLifecyclePlan["targetStage"], DeviceLifecyclePlan["steps"]> = {
      request: [
        {
          id: "capture-request-step",
          name: "Capture request and procurement requirements",
          riskLevel: "low",
          requiresApproval: false
        },
        {
          id: "budget-routing-step",
          name: "Route for budget and model approval",
          riskLevel: "medium",
          requiresApproval: true
        }
      ],
      fulfill: [
        {
          id: "receiving-step",
          name: "Receive asset, tag, and link procurement references",
          riskLevel: "low",
          requiresApproval: false
        },
        {
          id: "enrollment-step",
          name: "Enroll in MDM and baseline security controls",
          riskLevel: "medium",
          requiresApproval: false
        }
      ],
      deploy: [
        {
          id: "assignment-step",
          name: "Assign device and capture custody acknowledgement",
          riskLevel: "low",
          requiresApproval: false
        },
        {
          id: "delivery-step",
          name: input.remoteReturn ? "Create shipment and tracking" : "Schedule in-office handoff",
          riskLevel: "low",
          requiresApproval: false
        }
      ],
      monitor: [
        {
          id: "health-check-step",
          name: "Run posture and patch compliance checks",
          riskLevel: "low",
          requiresApproval: false
        },
        {
          id: "staleness-guard-step",
          name: "Create follow-up if check-in staleness exceeds threshold",
          riskLevel: "medium",
          requiresApproval: false
        }
      ],
      service: [
        {
          id: "triage-step",
          name: "Create break/fix triage and warranty validation",
          riskLevel: "medium",
          requiresApproval: false
        },
        {
          id: "repair-step",
          name: "Route repair or replacement workflow",
          riskLevel: "medium",
          requiresApproval: true
        }
      ],
      return: [
        {
          id: "kit-step",
          name: input.remoteReturn ? "Generate return kit and shipping label" : "Schedule office return drop-off",
          riskLevel: "low",
          requiresApproval: false
        },
        {
          id: "condition-step",
          name: "Confirm return receipt and condition grading",
          riskLevel: "medium",
          requiresApproval: false
        }
      ],
      retire: [
        {
          id: "wipe-verification-step",
          name: "Verify wipe and security containment before disposal",
          riskLevel: "high",
          requiresApproval: true
        },
        {
          id: "disposal-step",
          name: "Record disposal certificate and close lifecycle",
          riskLevel: "medium",
          requiresApproval: true
        }
      ]
    };

    return {
      deviceId: device?.id,
      currentStage,
      targetStage,
      location: input.location ?? String(device?.fields.location ?? ""),
      stockroom: input.stockroom ?? String(device?.fields.stockroom ?? ""),
      assigneePersonId: input.assigneePersonId ?? String(device?.fields.assigned_to_person_id ?? ""),
      remoteReturn: input.remoteReturn,
      riskLevel,
      approvalsRequired: [...approvalsRequiredSet],
      steps: stageStepTemplates[targetStage]
    };
  };

  const buildJmlJoinerPlan = (input: {
    existingPersonId?: string;
    legalName: string;
    email: string;
    startDate?: string;
    location: string;
    role: string;
    managerId?: string;
    employmentType: "employee" | "contractor" | "intern";
    requiredApps: string[];
    deviceTypePreference: "laptop" | "desktop" | "phone" | "tablet";
    remote: boolean;
    requesterId: string;
  }): JmlJoinerPlan | null => {
    const existingPerson =
      input.existingPersonId && store.objects.has(input.existingPersonId)
        ? store.objects.get(input.existingPersonId)
        : undefined;

    if (input.existingPersonId && (!existingPerson || existingPerson.type !== "Person")) {
      return null;
    }

    const role = input.role.trim();
    const roleKey = normalizeRoleKey(role);
    const baseline = roleEntitlementCatalog[roleKey] ?? { groups: ["org-default"], apps: ["Slack"] };
    const requestedApps = [...new Set(input.requiredApps.map((app) => app.trim()).filter(Boolean))];
    const combinedApps = [...new Set([...baseline.apps, ...requestedApps])];
    const privilegedAppRequest = combinedApps.some((app) => app.toLowerCase().includes("admin"));
    const riskLevel =
      privilegedAppRequest || input.deviceTypePreference === "desktop"
        ? "high"
        : input.employmentType === "contractor" || requestedApps.length >= 3
          ? "medium"
          : "low";

    const approvals = new Set(
      approvalsForRequest([...store.approvalMatrixRules.values()], "Request", riskLevel, {
        region: input.location,
        tags: ["jml", "joiner", input.employmentType],
        linkedObjectTypes: ["Person", "Identity", "Device"]
      })
    );
    approvals.add("manager");
    if (input.employmentType === "contractor" || privilegedAppRequest) {
      approvals.add("security");
    }
    if (input.deviceTypePreference === "desktop") {
      approvals.add("finance");
    }

    const startDate = input.startDate ?? nowIso();
    const managerId =
      input.managerId ??
      String(existingPerson?.fields.manager ?? existingPerson?.fields.manager_id ?? "manager-approver");
    const personId = existingPerson?.id;

    const steps: JmlJoinerPlan["steps"] = [
      {
        id: "identity-prestage-step",
        name: "Create or pre-stage identity",
        riskLevel: "medium",
        requiresApproval: false
      },
      {
        id: "group-baseline-step",
        name: "Assign baseline groups",
        riskLevel: "medium",
        requiresApproval: false
      },
      {
        id: "app-provision-step",
        name: "Provision baseline and requested SaaS access",
        riskLevel: requestedApps.length > 0 ? "medium" : "low",
        requiresApproval: requestedApps.length > 0
      },
      {
        id: "device-fulfillment-step",
        name: input.remote ? "Allocate device and prepare shipment" : "Allocate device for in-office pickup",
        riskLevel: "low",
        requiresApproval: false
      },
      {
        id: "compliance-welcome-step",
        name: "Run compliance baseline and publish welcome checklist",
        riskLevel: "low",
        requiresApproval: false
      }
    ];

    if (riskLevel === "high") {
      steps.push({
        id: "security-attestation-step",
        name: "Collect security attestation before elevated access activation",
        riskLevel: "high",
        requiresApproval: true
      });
    }

    return {
      personId,
      legalName: input.legalName,
      email: input.email,
      startDate,
      location: input.location,
      role,
      managerId,
      employmentType: input.employmentType,
      deviceTypePreference: input.deviceTypePreference,
      remote: input.remote,
      baselineGroups: baseline.groups,
      baselineApps: baseline.apps,
      requestedApps,
      riskLevel,
      approvalsRequired: [...approvals],
      steps
    };
  };

  const buildJmlMoverPlan = (input: {
    personId: string;
    targetRole: string;
    targetDepartment?: string;
    targetLocation?: string;
    requesterId: string;
  }): JmlMoverPlan | null => {
    const person = store.objects.get(input.personId);
    if (!person || person.type !== "Person") {
      return null;
    }

    const currentRole = String(person.fields.role_profile ?? person.fields.job_title ?? "engineer");
    const currentRoleKey = normalizeRoleKey(currentRole);
    const targetRoleKey = normalizeRoleKey(input.targetRole);

    const currentEntitlements = roleEntitlementCatalog[currentRoleKey] ?? { groups: [], apps: [] };
    const targetEntitlements = roleEntitlementCatalog[targetRoleKey] ?? { groups: [], apps: [] };

    const currentGroups = parseStringArrayField(person.fields.current_groups);
    const currentApps = parseStringArrayField(person.fields.current_apps);
    const baselineGroups = currentGroups.length > 0 ? currentGroups : currentEntitlements.groups;
    const baselineApps = currentApps.length > 0 ? currentApps : currentEntitlements.apps;

    const addGroups = targetEntitlements.groups.filter((group) => !baselineGroups.includes(group));
    const removeGroups = baselineGroups.filter((group) => !targetEntitlements.groups.includes(group));
    const addApps = targetEntitlements.apps.filter((app) => !baselineApps.includes(app));
    const removeApps = baselineApps.filter((app) => !targetEntitlements.apps.includes(app));

    const privilegedChanges = [...addGroups, ...removeGroups].some((group) => group.includes("admin"));
    const highChurn = addGroups.length + removeGroups.length + addApps.length + removeApps.length >= 6;
    const riskLevel = privilegedChanges || highChurn ? "high" : addGroups.length + removeGroups.length > 2 ? "medium" : "low";

    const approvalsRequired = approvalsForRequest([...store.approvalMatrixRules.values()], "Change", riskLevel, {
      region: input.targetLocation,
      tags: ["jml", "mover"],
      linkedObjectTypes: ["Person"]
    });

    return {
      personId: person.id,
      currentRole,
      targetRole: input.targetRole,
      currentDepartment: String(person.fields.department ?? ""),
      targetDepartment: input.targetDepartment,
      currentLocation: String(person.fields.location ?? ""),
      targetLocation: input.targetLocation,
      addGroups,
      removeGroups,
      addApps,
      removeApps,
      riskLevel,
      approvalsRequired
    };
  };

  const personReferenceSet = (person: GraphObject): Set<string> => {
    const refs = new Set<string>([person.id]);
    const email = String(person.fields.email ?? "").trim().toLowerCase();
    if (email) {
      refs.add(email);
    }
    const workerId = String(person.fields.worker_id ?? "").trim().toLowerCase();
    if (workerId) {
      refs.add(workerId);
    }
    return refs;
  };

  const matchesPersonRef = (value: unknown, refs: Set<string>): boolean => {
    if (typeof value !== "string") {
      return false;
    }
    return refs.has(value.trim().toLowerCase());
  };

  const buildJmlLeaverPlan = (input: {
    personId: string;
    effectiveDate?: string;
    region?: string;
    legalHold: boolean;
    vip: boolean;
    contractorConversion: boolean;
    deviceRecoveryState: "pending" | "recovered" | "not-recovered";
    requesterId: string;
  }): JmlLeaverPlan | null => {
    const person = store.objects.get(input.personId);
    if (!person || person.type !== "Person") {
      return null;
    }

    const personName = String(person.fields.legal_name ?? person.fields.preferred_name ?? person.id);
    const region = String(
      input.region ?? person.fields.region ?? person.fields.country ?? person.fields.location ?? "Global"
    );

    const highRisk = input.vip || input.legalHold || input.deviceRecoveryState === "not-recovered";
    const riskLevel = highRisk ? "high" : input.contractorConversion ? "medium" : "medium";

    const approvalsRequiredSet = new Set(
      approvalsForRequest([...store.approvalMatrixRules.values()], "Change", riskLevel, {
        region,
        tags: [
          "jml",
          "leaver",
          input.vip ? "vip" : "non-vip",
          input.legalHold ? "legal-hold" : "standard"
        ],
        linkedObjectTypes: ["Person", "Identity", "Device"]
      })
    );
    approvalsRequiredSet.add("manager");
    if (input.vip || input.legalHold || input.deviceRecoveryState === "not-recovered") {
      approvalsRequiredSet.add("security");
      approvalsRequiredSet.add("it");
    }
    if (input.legalHold) {
      approvalsRequiredSet.add("custom");
    }
    if (input.contractorConversion) {
      approvalsRequiredSet.add("it");
    }

    const steps: JmlLeaverPlan["steps"] = [
      {
        id: "identity-access-step",
        name: input.legalHold
          ? "Restrict identity and preserve legal hold controls"
          : input.contractorConversion
            ? "Transition identity for contractor continuity"
            : "Disable identity and revoke active sessions",
        riskLevel: "high",
        requiresApproval: input.vip || input.legalHold
      },
      {
        id: "saas-reclaim-step",
        name: "Deprovision SaaS access and reclaim licenses",
        riskLevel: "medium",
        requiresApproval: false
      },
      {
        id: "ownership-transfer-step",
        name: "Transfer owned resources and delegated responsibilities",
        riskLevel: "medium",
        requiresApproval: false
      },
      {
        id: "asset-recovery-step",
        name: "Start asset recovery workflow with reminders and escalation",
        riskLevel: "low",
        requiresApproval: false
      }
    ];

    if (input.deviceRecoveryState === "not-recovered") {
      steps.push({
        id: "asset-containment-step",
        name: "Contain unrecovered assets (lock or wipe) with approval gate",
        riskLevel: "high",
        requiresApproval: true
      });
    }

    const regionCode = region.trim().toLowerCase();
    if (["de", "fr", "uk", "eu"].some((entry) => regionCode.includes(entry))) {
      steps.push({
        id: "regional-compliance-step",
        name: "Run regional offboarding compliance checks",
        riskLevel: "medium",
        requiresApproval: false
      });
    }

    steps.push({
      id: "evidence-closeout-step",
      name: "Generate closure evidence package and confirmations",
      riskLevel: "low",
      requiresApproval: false
    });

    return {
      personId: person.id,
      personName,
      effectiveDate: input.effectiveDate ?? nowIso(),
      region,
      legalHold: input.legalHold,
      vip: input.vip,
      riskLevel,
      approvalsRequired: [...approvalsRequiredSet],
      steps
    };
  };

  const buildContractRenewalCandidates = (daysAhead: number) => {
    const contracts = [...store.objects.values()].filter((object) => object.type === "Contract");
    const licenses = [...store.objects.values()].filter((object) => object.type === "License");

    const candidates = contracts
      .map((contract) => {
        const renewalDateValue = contract.fields.renewal_date ?? contract.fields.renewalDate;
        const renewalDate = parseIsoDate(renewalDateValue);
        if (!renewalDate) {
          return null;
        }
        const daysUntilRenewal = daysUntilDate(renewalDate);
        if (daysUntilRenewal > daysAhead) {
          return null;
        }
        const renewalStatus =
          daysUntilRenewal < 0
            ? "overdue"
            : daysUntilRenewal <= 30
              ? "due-soon"
              : "future";

        const vendorName = String(contract.fields.vendor_name ?? contract.fields.vendor ?? contract.fields.name ?? "Unknown Vendor");
        const contractId = String(contract.fields.contract_id ?? contract.id);
        const linkedLicenseIds = licenses
          .filter((license) => {
            const linkedContractId = String(license.fields.contract_id ?? "");
            if (linkedContractId && linkedContractId === contractId) {
              return true;
            }
            const app = String(license.fields.app ?? "");
            return app.toLowerCase().includes(vendorName.toLowerCase()) || vendorName.toLowerCase().includes(app.toLowerCase());
          })
          .map((license) => license.id);

        return {
          contractObjectId: contract.id,
          vendorName,
          renewalDate: renewalDate.toISOString(),
          daysUntilRenewal,
          status: renewalStatus as "future" | "due-soon" | "overdue",
          estimatedSpend: Number(contract.fields.spend ?? contract.fields.amount ?? 0),
          linkedLicenseIds,
          action: "none" as const,
          reason: "Renewal identified for review."
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((left, right) => left.daysUntilRenewal - right.daysUntilRenewal);

    return {
      scannedContracts: contracts.length,
      candidates
    };
  };

  const runContractRenewals = (
    actorId: string,
    mode: "dry-run" | "live",
    daysAhead: number
  ): ContractRenewalRun => {
    const { scannedContracts, candidates } = buildContractRenewalCandidates(daysAhead);
    let tasksCreated = 0;
    let exceptionsCreated = 0;
    let failedCount = 0;

    const executed = candidates.map((candidate) => {
      const contract = store.objects.get(candidate.contractObjectId);
      if (!contract) {
        failedCount += 1;
        return {
          ...candidate,
          action: "failed" as const,
          reason: "Contract object missing during execution."
        };
      }

      if (mode === "dry-run") {
        return {
          ...candidate,
          action: "none" as const,
          reason: "Would create renewal review task on live run."
        };
      }

      if (contract.fields.simulate_renewal_failure === true) {
        failedCount += 1;
        const exception: WorkItem = {
          id: store.createId(),
          tenantId: contract.tenantId,
          workspaceId: contract.workspaceId,
          type: "Exception",
          status: "Submitted",
          priority: "P2",
          title: `Renewal reminder failed: ${candidate.vendorName}`,
          description: `Failed to create renewal workflow for contract ${contract.id}.`,
          requesterId: actorId,
          assignmentGroup: "Procurement Operations",
          linkedObjectIds: [contract.id],
          tags: ["contract", "renewal", "automation-failed"],
          comments: [],
          attachments: [],
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        store.workItems.set(exception.id, exception);
        exceptionsCreated += 1;
        return {
          ...candidate,
          action: "failed" as const,
          reason: "Reminder execution failed. Routed to exception queue.",
          createdExceptionId: exception.id
        };
      }

      const task: WorkItem = {
        id: store.createId(),
        tenantId: contract.tenantId,
        workspaceId: contract.workspaceId,
        type: "Task",
        status: "Submitted",
        priority: candidate.daysUntilRenewal <= 7 ? "P1" : "P2",
        title: `Renewal review: ${candidate.vendorName}`,
        description: `Review contract renewal due ${candidate.renewalDate}.`,
        requesterId: actorId,
        assignmentGroup: "Procurement Operations",
        linkedObjectIds: [contract.id, ...candidate.linkedLicenseIds],
        tags: ["contract", "renewal", "procurement"],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.workItems.set(task.id, task);
      tasksCreated += 1;
      return {
        ...candidate,
        action: "task-created" as const,
        reason: "Renewal review task created.",
        createdWorkItemId: task.id
      };
    });

    let status: ContractRenewalRun["status"] = "success";
    if (failedCount > 0 && tasksCreated > 0) {
      status = "partial";
    } else if (failedCount > 0 && tasksCreated === 0) {
      status = "failed";
    }

    const run: ContractRenewalRun = {
      id: store.createId(),
      mode,
      status,
      daysAhead,
      startedAt: nowIso(),
      completedAt: nowIso(),
      scannedContracts,
      dueContracts: candidates.length,
      tasksCreated,
      exceptionsCreated,
      candidates: executed
    };
    store.contractRenewalRuns.set(run.id, run);

    store.pushTimeline({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      entityType: "workflow",
      entityId: run.id,
      eventType: "contract.renewal.run",
      actor: actorId,
      createdAt: nowIso(),
      payload: {
        mode: run.mode,
        status: run.status,
        dueContracts: run.dueContracts,
        tasksCreated: run.tasksCreated,
        exceptionsCreated: run.exceptionsCreated
      }
    });

    return run;
  };

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "apex-control-plane", now: nowIso() });
  });

  router.get("/objects", (req, res) => {
    const actor = getActor(req.headers);
    const type = req.query.type ? String(req.query.type) : undefined;
    const restrictions = [...store.fieldRestrictions.values()];
    const data = [...store.objects.values()]
      .filter((obj) => (type ? obj.type === type : true))
      .map((obj) => maskObjectForActor(obj, actor, restrictions));
    res.json({ data });
  });

  router.post("/objects", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:create"));

    const parsed = objectCreateSchema.parse(req.body);
    const object: GraphObject = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      type: parsed.type,
      fields: parsed.fields,
      provenance: {},
      quality: {
        freshness: 1,
        completeness: 0.5,
        consistency: 1,
        coverage: 0.5
      },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    store.objects.set(object.id, object);
    store.pushTimeline({
      tenantId: object.tenantId,
      workspaceId: object.workspaceId,
      entityType: "object",
      entityId: object.id,
      eventType: "object.created",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { source: "manual" }
    });

    res.status(201).json({ data: object });
  });

  router.get("/objects/:id", (req, res) => {
    const actor = getActor(req.headers);
    const object = store.objects.get(req.params.id);
    if (!object) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const restrictions = [...store.fieldRestrictions.values()];
    res.json({ data: maskObjectForActor(object, actor, restrictions) });
  });

  router.patch("/objects/:id", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:update"));

    const parsed = objectUpdateSchema.parse(req.body);
    const object = store.objects.get(req.params.id);
    if (!object) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const restrictions = [...store.fieldRestrictions.values()];
    for (const field of Object.keys(parsed.fields)) {
      if (!canWriteField(object.type, field, actor, restrictions)) {
        res.status(403).json({ error: `Field '${field}' is restricted for role '${actor.role}'` });
        return;
      }
    }

    const before = { ...object.fields };
    object.fields = { ...object.fields, ...parsed.fields };
    object.updatedAt = nowIso();
    store.objects.set(object.id, object);

    store.pushTimeline({
      tenantId: object.tenantId,
      workspaceId: object.workspaceId,
      entityType: "object",
      entityId: object.id,
      eventType: "object.updated",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { before, after: object.fields }
    });

    res.json({ data: object });
  });

  router.post("/objects/:id/manual-override", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:update"));

    const parsed = objectManualOverrideSchema.parse(req.body);
    const object = store.objects.get(req.params.id);
    if (!object) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const restrictions = [...store.fieldRestrictions.values()];
    if (!canWriteField(object.type, parsed.field, actor, restrictions)) {
      res.status(403).json({ error: `Field '${parsed.field}' is restricted for role '${actor.role}'` });
      return;
    }

    if (parsed.overrideUntil) {
      const overrideUntilMs = new Date(parsed.overrideUntil).getTime();
      if (Number.isNaN(overrideUntilMs) || overrideUntilMs <= Date.now()) {
        res.status(400).json({ error: "overrideUntil must be a future ISO datetime" });
        return;
      }
    }

    const previous = object.fields[parsed.field];
    object.fields[parsed.field] = parsed.value;
    object.updatedAt = nowIso();
    object.provenance[parsed.field] = [
      ...(object.provenance[parsed.field] ?? []),
      {
        field: parsed.field,
        sourceId: "manual-override",
        signalId: store.createId(),
        observedAt: nowIso(),
        confidence: 1,
        overriddenBy: actor.id,
        overrideReason: parsed.reason,
        overrideUntil: parsed.overrideUntil
      }
    ];
    store.objects.set(object.id, object);

    store.pushTimeline({
      tenantId: object.tenantId,
      workspaceId: object.workspaceId,
      entityType: "object",
      entityId: object.id,
      eventType: "manual.override",
      actor: actor.id,
      createdAt: nowIso(),
      reason: parsed.reason,
      payload: {
        field: parsed.field,
        previous,
        next: parsed.value,
        overrideUntil: parsed.overrideUntil
      }
    });

    res.json({ data: object });
  });

  router.post("/objects/:id/children", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:create"));
    const parsed = objectChildCreateSchema.parse(req.body);
    const parent = store.objects.get(req.params.id);
    if (!parent) {
      res.status(404).json({ error: "Parent object not found" });
      return;
    }

    const child: GraphObject = {
      id: store.createId(),
      tenantId: parent.tenantId,
      workspaceId: parent.workspaceId,
      type: parsed.childType,
      fields: parsed.fields,
      provenance: {},
      quality: {
        freshness: 0.8,
        completeness: 0.6,
        consistency: 0.9,
        coverage: 0.6
      },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.objects.set(child.id, child);

    const relationship: GraphRelationship = {
      id: store.createId(),
      tenantId: parent.tenantId,
      workspaceId: parent.workspaceId,
      type: parsed.relationshipType,
      fromObjectId: parent.id,
      toObjectId: child.id,
      createdAt: nowIso(),
      createdBy: actor.id
    };
    store.relationships.set(relationship.id, relationship);

    store.pushTimeline({
      tenantId: child.tenantId,
      workspaceId: child.workspaceId,
      entityType: "object",
      entityId: child.id,
      eventType: "object.created",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        parentObjectId: parent.id,
        relationshipType: relationship.type
      }
    });
    store.pushTimeline({
      tenantId: relationship.tenantId,
      workspaceId: relationship.workspaceId,
      entityType: "relationship",
      entityId: relationship.id,
      eventType: "relationship.created",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        type: relationship.type,
        fromObjectId: relationship.fromObjectId,
        toObjectId: relationship.toObjectId
      }
    });

    res.status(201).json({
      data: {
        parentObjectId: parent.id,
        childObject: child,
        relationship
      }
    });
  });

  router.post("/objects/:id/workflows/start", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = objectWorkflowStartSchema.parse(req.body);
    const object = store.objects.get(req.params.id);
    if (!object) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    const run = workflows.startRun(
      parsed.definitionId,
      object.tenantId,
      object.workspaceId,
      {
        ...parsed.inputs,
        objectId: object.id,
        objectType: object.type
      },
      actor
    );
    res.status(201).json({
      data: {
        run,
        objectId: object.id
      }
    });
  });

  router.post("/devices/:id/lost-stolen/report", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = lostStolenReportSchema.parse(req.body);
    const device = store.objects.get(req.params.id);
    if (!device || device.type !== "Device") {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    const incident: WorkItem = {
      id: store.createId(),
      tenantId: device.tenantId,
      workspaceId: device.workspaceId,
      type: "Incident",
      status: "Submitted",
      priority: parsed.requestWipe || parsed.suspectedTheft ? "P0" : "P1",
      title: `Lost/stolen device report: ${String(device.fields.asset_tag ?? device.id)}`,
      description: parsed.circumstances,
      requesterId: parsed.reporterId,
      assignmentGroup: "Security Operations",
      linkedObjectIds: [device.id],
      tags: ["portal", "device", "security", "lost-stolen"],
      comments: [
        {
          id: store.createId(),
          authorId: actor.id,
          body: `Last known location: ${parsed.lastKnownLocation}. Occurred at: ${parsed.occurredAt}.`,
          mentions: [],
          createdAt: nowIso()
        }
      ],
      attachments: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.workItems.set(incident.id, incident);

    const actionPlan: Array<{
      action: string;
      riskLevel: "low" | "medium" | "high";
      requiresApproval: boolean;
      status: "planned" | "pending-approval";
      approvalId?: string;
    }> = [
      {
        action: "Notify security operations",
        riskLevel: "low",
        requiresApproval: false,
        status: "planned"
      }
    ];

    const createdApprovals: ApprovalRecord[] = [];
    const createApproval = (type: ApprovalRecord["type"], action: string): ApprovalRecord => {
      const approval: ApprovalRecord = {
        id: store.createId(),
        tenantId: device.tenantId,
        workspaceId: device.workspaceId,
        workItemId: incident.id,
        type,
        approverId: `${type}-approver`,
        decision: "pending",
        comment: `Approval required for: ${action}`,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()
      };
      store.approvals.set(approval.id, approval);
      createdApprovals.push(approval);
      store.pushTimeline({
        tenantId: approval.tenantId,
        workspaceId: approval.workspaceId,
        entityType: "approval",
        entityId: approval.id,
        eventType: "approval.requested",
        actor: actor.id,
        createdAt: nowIso(),
        payload: {
          workItemId: incident.id,
          type: approval.type,
          action
        }
      });
      return approval;
    };

    if (parsed.requestImmediateLock) {
      const approval = createApproval("security", "Trigger remote lock");
      actionPlan.push({
        action: "Trigger remote lock",
        riskLevel: "high",
        requiresApproval: true,
        status: "pending-approval",
        approvalId: approval.id
      });
    }

    if (parsed.requestWipe) {
      const securityApproval = createApproval("security", "Trigger remote wipe");
      const itApproval = createApproval("it", "Trigger remote wipe");
      actionPlan.push({
        action: "Trigger remote wipe",
        riskLevel: "high",
        requiresApproval: true,
        status: "pending-approval",
        approvalId: securityApproval.id
      });
      actionPlan.push({
        action: "Authorize wipe execution",
        riskLevel: "high",
        requiresApproval: true,
        status: "pending-approval",
        approvalId: itApproval.id
      });
    }

    const followUpTasks: WorkItem[] = [];
    if (parsed.createCredentialRotationTask) {
      const task: WorkItem = {
        id: store.createId(),
        tenantId: device.tenantId,
        workspaceId: device.workspaceId,
        type: "Task",
        status: "Submitted",
        priority: "P1",
        title: `Credential rotation for ${String(device.fields.asset_tag ?? device.id)}`,
        description: "Rotate credentials and invalidate sessions after lost/stolen report.",
        requesterId: parsed.reporterId,
        assignmentGroup: "Identity Operations",
        linkedObjectIds: [device.id],
        tags: ["security", "credential-rotation", "lost-stolen"],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.workItems.set(task.id, task);
      followUpTasks.push(task);
      actionPlan.push({
        action: "Rotate credentials and sessions",
        riskLevel: "medium",
        requiresApproval: false,
        status: "planned"
      });
    }

    const before = { ...device.fields };
    device.fields = {
      ...device.fields,
      lost_stolen_status: "reported",
      lost_stolen_reported_at: nowIso(),
      lost_stolen_occurred_at: parsed.occurredAt,
      last_known_location: parsed.lastKnownLocation,
      lost_stolen_circumstances: parsed.circumstances,
      pending_security_actions: {
        lock_requested: parsed.requestImmediateLock,
        wipe_requested: parsed.requestWipe
      }
    };
    device.updatedAt = nowIso();
    store.objects.set(device.id, device);

    store.pushTimeline({
      tenantId: device.tenantId,
      workspaceId: device.workspaceId,
      entityType: "object",
      entityId: device.id,
      eventType: "object.updated",
      actor: actor.id,
      reason: "lost-stolen-report",
      createdAt: nowIso(),
      payload: {
        before,
        after: device.fields
      }
    });
    store.pushTimeline({
      tenantId: incident.tenantId,
      workspaceId: incident.workspaceId,
      entityType: "work-item",
      entityId: incident.id,
      eventType: "object.created",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        type: incident.type,
        tags: incident.tags
      }
    });

    res.status(201).json({
      data: {
        incident,
        approvals: createdApprovals,
        followUpTasks,
        actionPlan,
        evidenceHint: `Use /v1/evidence/${incident.id} after resolution for full package export.`
      }
    });
  });

  router.post("/devices/:id/acknowledgements", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = deviceAcknowledgementSchema.parse(req.body);
    const device = store.objects.get(req.params.id);
    if (!device || device.type !== "Device") {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    const now = nowIso();
    if (parsed.type === "receipt") {
      device.fields.receipt_acknowledged_at = now;
      device.fields.receipt_acknowledged_by = parsed.acknowledgedBy;
      device.fields.custody_status = "active";
    } else {
      device.fields.return_shipment_acknowledged_at = now;
      device.fields.return_shipment_acknowledged_by = parsed.acknowledgedBy;
      device.fields.return_status = "in-transit";
    }
    if (parsed.note) {
      device.fields.last_acknowledgement_note = parsed.note;
    }
    device.updatedAt = now;
    store.objects.set(device.id, device);

    store.pushTimeline({
      tenantId: device.tenantId,
      workspaceId: device.workspaceId,
      entityType: "object",
      entityId: device.id,
      eventType: "object.updated",
      actor: actor.id,
      reason: `device-acknowledgement:${parsed.type}`,
      createdAt: now,
      payload: {
        type: parsed.type,
        acknowledgedBy: parsed.acknowledgedBy,
        note: parsed.note
      }
    });

    res.status(201).json({
      data: {
        device,
        acknowledgement: {
          type: parsed.type,
          acknowledgedBy: parsed.acknowledgedBy,
          note: parsed.note,
          acknowledgedAt: now
        }
      }
    });
  });

  router.get("/object-merges/runs", (req, res) => {
    const objectId = req.query.objectId ? String(req.query.objectId) : undefined;
    const data = [...store.objectMergeRuns.values()]
      .filter((run) =>
        objectId ? run.targetObjectId === objectId || run.sourceObjectId === objectId : true
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    res.json({ data });
  });

  router.post("/object-merges/preview", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:update"));
    const parsed = objectMergePreviewSchema.parse(req.body);

    const preview = buildObjectMergePreview(parsed.targetObjectId, parsed.sourceObjectId);
    if (!preview) {
      res.status(404).json({ error: "Merge candidate pair not found or not compatible" });
      return;
    }

    const run: ObjectMergeRun = {
      id: store.createId(),
      tenantId: preview.target.tenantId,
      workspaceId: preview.target.workspaceId,
      targetObjectId: preview.target.id,
      sourceObjectId: preview.source.id,
      objectType: preview.objectType,
      status: "previewed",
      actorId: actor.id,
      reason: "Preview only",
      fieldDecisions: preview.fieldDecisions,
      movedRelationshipIds: preview.movedRelationshipIds,
      relinkedWorkItemIds: preview.relinkedWorkItemIds,
      createdAt: nowIso()
    };
    store.objectMergeRuns.set(run.id, run);

    res.status(201).json({
      data: {
        run,
        impact: {
          relationshipsToMove: preview.movedRelationshipIds.length,
          workItemsToRelink: preview.relinkedWorkItemIds.length
        }
      }
    });
  });

  router.post("/object-merges/execute", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:update"));
    const parsed = objectMergeExecuteSchema.parse(req.body);

    const preview = buildObjectMergePreview(parsed.targetObjectId, parsed.sourceObjectId);
    if (!preview) {
      res.status(404).json({ error: "Merge candidate pair not found or not compatible" });
      return;
    }

    const targetSnapshot = deepCopy(preview.target);
    const sourceSnapshot = deepCopy(preview.source);
    const relationshipSnapshots = deepCopy(
      [...store.relationships.values()].filter(
        (relationship) =>
          relationship.fromObjectId === preview.target.id ||
          relationship.toObjectId === preview.target.id ||
          relationship.fromObjectId === preview.source.id ||
          relationship.toObjectId === preview.source.id
      )
    );
    const workItemSnapshots = deepCopy(
      [...store.workItems.values()].filter(
        (workItem) =>
          workItem.linkedObjectIds.includes(preview.target.id) ||
          workItem.linkedObjectIds.includes(preview.source.id)
      )
    );

    for (const decision of preview.fieldDecisions) {
      if (decision.selected === "source") {
        preview.target.fields[decision.field] = preview.source.fields[decision.field];
      }
      preview.target.provenance[decision.field] = [
        ...(preview.target.provenance[decision.field] ?? []),
        ...(preview.source.provenance[decision.field] ?? [])
      ];
    }
    preview.target.updatedAt = nowIso();
    store.objects.set(preview.target.id, preview.target);

    for (const relationship of [...store.relationships.values()]) {
      if (relationship.fromObjectId !== preview.source.id && relationship.toObjectId !== preview.source.id) {
        continue;
      }
      const rewiredFrom = relationship.fromObjectId === preview.source.id ? preview.target.id : relationship.fromObjectId;
      const rewiredTo = relationship.toObjectId === preview.source.id ? preview.target.id : relationship.toObjectId;
      const duplicate = [...store.relationships.values()].find(
        (candidate) =>
          candidate.id !== relationship.id &&
          candidate.type === relationship.type &&
          candidate.fromObjectId === rewiredFrom &&
          candidate.toObjectId === rewiredTo
      );

      if (duplicate) {
        store.relationships.delete(relationship.id);
        continue;
      }

      relationship.fromObjectId = rewiredFrom;
      relationship.toObjectId = rewiredTo;
      store.relationships.set(relationship.id, relationship);
    }

    for (const workItem of [...store.workItems.values()]) {
      if (!workItem.linkedObjectIds.includes(preview.source.id)) {
        continue;
      }
      workItem.linkedObjectIds = [...new Set(workItem.linkedObjectIds.map((id) => (id === preview.source.id ? preview.target.id : id)))];
      workItem.updatedAt = nowIso();
      store.workItems.set(workItem.id, workItem);
    }

    store.objects.delete(preview.source.id);

    const reversibleUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const run: ObjectMergeRun = {
      id: store.createId(),
      tenantId: preview.target.tenantId,
      workspaceId: preview.target.workspaceId,
      targetObjectId: preview.target.id,
      sourceObjectId: preview.source.id,
      objectType: preview.objectType,
      status: "executed",
      reversibleUntil,
      actorId: actor.id,
      reason: parsed.reason,
      fieldDecisions: preview.fieldDecisions,
      movedRelationshipIds: preview.movedRelationshipIds,
      relinkedWorkItemIds: preview.relinkedWorkItemIds,
      createdAt: nowIso(),
      executedAt: nowIso()
    };

    store.objectMergeRuns.set(run.id, run);
    store.objectMergeUndo.set(run.id, {
      targetSnapshot,
      sourceSnapshot,
      relationshipSnapshots,
      workItemSnapshots
    });

    store.pushTimeline({
      tenantId: run.tenantId,
      workspaceId: run.workspaceId,
      entityType: "object",
      entityId: run.targetObjectId,
      eventType: "object.merged",
      actor: actor.id,
      createdAt: nowIso(),
      reason: parsed.reason,
      payload: {
        mergeRunId: run.id,
        sourceObjectId: run.sourceObjectId,
        movedRelationshipIds: run.movedRelationshipIds,
        relinkedWorkItemIds: run.relinkedWorkItemIds
      }
    });

    res.status(201).json({
      data: {
        run,
        mergedObject: preview.target
      }
    });
  });

  router.post("/object-merges/:id/revert", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:update"));

    const run = store.objectMergeRuns.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Merge run not found" });
      return;
    }
    if (run.status !== "executed") {
      res.status(409).json({ error: "Only executed merge runs can be reverted" });
      return;
    }
    if (run.reversibleUntil && new Date(run.reversibleUntil).getTime() < Date.now()) {
      res.status(409).json({ error: "Reversible window has expired" });
      return;
    }

    const undo = store.objectMergeUndo.get(run.id);
    if (!undo) {
      res.status(404).json({ error: "Revert snapshot not found" });
      return;
    }

    store.objects.set(undo.targetSnapshot.id, undo.targetSnapshot);
    store.objects.set(undo.sourceSnapshot.id, undo.sourceSnapshot);

    for (const relationship of [...store.relationships.values()]) {
      if (
        relationship.fromObjectId === run.targetObjectId ||
        relationship.toObjectId === run.targetObjectId ||
        relationship.fromObjectId === run.sourceObjectId ||
        relationship.toObjectId === run.sourceObjectId
      ) {
        store.relationships.delete(relationship.id);
      }
    }
    for (const relationship of undo.relationshipSnapshots) {
      store.relationships.set(relationship.id, relationship);
    }

    for (const workItem of undo.workItemSnapshots) {
      store.workItems.set(workItem.id, workItem);
    }

    run.status = "reverted";
    run.revertedAt = nowIso();
    store.objectMergeRuns.set(run.id, run);
    store.objectMergeUndo.delete(run.id);

    store.pushTimeline({
      tenantId: run.tenantId,
      workspaceId: run.workspaceId,
      entityType: "object",
      entityId: run.targetObjectId,
      eventType: "object.merge.reverted",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        mergeRunId: run.id,
        sourceObjectId: run.sourceObjectId
      }
    });

    res.json({
      data: {
        run,
        restoredTarget: undo.targetSnapshot,
        restoredSource: undo.sourceSnapshot
      }
    });
  });

  router.post("/relationships", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:update"));

    const parsed = relationshipCreateSchema.parse(req.body);
    if (parsed.fromObjectId === parsed.toObjectId) {
      res.status(400).json({ error: "Cannot link an object to itself" });
      return;
    }

    const fromObject = store.objects.get(parsed.fromObjectId);
    const toObject = store.objects.get(parsed.toObjectId);
    if (!fromObject || !toObject) {
      res.status(404).json({ error: "One or both objects were not found" });
      return;
    }

    const duplicate = [...store.relationships.values()].find(
      (relationship) =>
        relationship.type === parsed.type &&
        relationship.fromObjectId === parsed.fromObjectId &&
        relationship.toObjectId === parsed.toObjectId
    );
    if (duplicate) {
      res.status(409).json({ error: "Relationship already exists", data: duplicate });
      return;
    }

    const rel: GraphRelationship = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      type: parsed.type,
      fromObjectId: parsed.fromObjectId,
      toObjectId: parsed.toObjectId,
      createdAt: nowIso(),
      createdBy: actor.id
    };

    store.relationships.set(rel.id, rel);
    store.pushTimeline({
      tenantId: rel.tenantId,
      workspaceId: rel.workspaceId,
      entityType: "relationship",
      entityId: rel.id,
      eventType: "relationship.created",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { type: rel.type, fromObjectId: rel.fromObjectId, toObjectId: rel.toObjectId }
    });

    res.status(201).json({ data: rel });
  });

  router.get("/relationships", (req, res) => {
    const objectId = req.query.objectId ? String(req.query.objectId) : undefined;
    const type = req.query.type ? String(req.query.type) : undefined;
    const data = [...store.relationships.values()].filter(
      (relationship) =>
        (objectId
          ? relationship.fromObjectId === objectId || relationship.toObjectId === objectId
          : true) && (type ? relationship.type === type : true)
    );
    res.json({ data });
  });

  router.post("/relationships/:id/unlink", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:update"));
    const parsed = relationshipUnlinkSchema.parse(req.body);
    const relationship = store.relationships.get(req.params.id);
    if (!relationship) {
      res.status(404).json({ error: "Relationship not found" });
      return;
    }

    if (relationship.type === "evidence_for" && actor.role !== "it-admin" && actor.role !== "security-analyst") {
      res.status(403).json({ error: "Evidence relationships can only be unlinked by admin or security roles" });
      return;
    }

    store.relationships.delete(relationship.id);
    store.pushTimeline({
      tenantId: relationship.tenantId,
      workspaceId: relationship.workspaceId,
      entityType: "relationship",
      entityId: relationship.id,
      eventType: "relationship.deleted",
      actor: actor.id,
      createdAt: nowIso(),
      reason: parsed.reason,
      payload: {
        type: relationship.type,
        fromObjectId: relationship.fromObjectId,
        toObjectId: relationship.toObjectId
      }
    });

    res.json({ data: relationship });
  });

  router.get("/timeline/:entityId", (req, res) => {
    res.json({ data: store.listTimelineForEntity(req.params.entityId) });
  });

  router.post("/signals/ingest", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:create") || can(actor.role, "object:update"));

    const parsed = signalIngestSchema.parse(req.body);
    const signal: SourceSignal = {
      ...parsed,
      id: store.createId(),
      observedAt: nowIso()
    };

    const result = ingestSignal(store, signal, actor.id);
    res.status(result.created ? 201 : 200).json({ data: result });
  });

  router.post("/signals/preview", (req, res) => {
    const parsed = signalIngestSchema.parse(req.body);
    const signal: SourceSignal = {
      ...parsed,
      id: "preview",
      observedAt: nowIso()
    };
    const candidates = findCandidates(store, signal);
    res.json({ data: { candidates } });
  });

  router.get("/quality", (_req, res) => {
    res.json({ data: computeQualityDashboard(store) });
  });

  router.get("/cloud/tag-governance/coverage", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:view"));
    const queryTags = req.query.requiredTags
      ? String(req.query.requiredTags)
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      : undefined;
    const parsed = cloudTagCoverageSchema.parse({ requiredTags: queryTags });
    const requiredTags = parsed.requiredTags?.length ? parsed.requiredTags : defaultCloudTags;
    const resources = [...store.objects.values()].filter((object) => object.type === "CloudResource");

    const nonCompliant = resources
      .map((resource) => {
        const missingTags = missingTagsForResource(resource, requiredTags);
        return {
          resourceId: resource.id,
          name: String(resource.fields.name ?? resource.id),
          provider: String(resource.fields.provider ?? "unknown"),
          owner: String(resource.fields.owner ?? "unknown"),
          tags: parseResourceTags(resource.fields.tags),
          missingTags
        };
      })
      .filter((resource) => resource.missingTags.length > 0);

    const compliantResources = resources.length - nonCompliant.length;
    const coveragePercent = resources.length === 0 ? 100 : Math.round((compliantResources / resources.length) * 100);

    res.json({
      data: {
        requiredTags,
        totalResources: resources.length,
        compliantResources,
        nonCompliantResources: nonCompliant.length,
        coveragePercent,
        nonCompliant
      }
    });
  });

  router.post("/cloud/tag-governance/enforce", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = cloudTagEnforceSchema.parse(req.body);
    const requiredTags = parsed.requiredTags?.length ? parsed.requiredTags : defaultCloudTags;
    const resources = [...store.objects.values()].filter((object) => object.type === "CloudResource");

    const remediations: Array<{
      resourceId: string;
      autoTagged: string[];
      unresolved: string[];
      exceptionId?: string;
    }> = [];
    let autoTaggedCount = 0;
    let exceptionsCreated = 0;

    for (const resource of resources) {
      const missing = missingTagsForResource(resource, requiredTags);
      if (missing.length === 0) {
        continue;
      }

      const tags = parseResourceTags(resource.fields.tags);
      const autoTagged: string[] = [];
      const unresolved: string[] = [];

      for (const tag of missing) {
        if (!parsed.autoTag) {
          unresolved.push(tag);
          continue;
        }

        const mappedValue =
          tag === "owner"
            ? String(resource.fields.owner ?? resource.fields.team_owner ?? "")
            : tag === "cost_center"
              ? String(resource.fields.billing_cost_center ?? resource.fields.cost_center ?? "")
              : tag === "environment"
                ? String(resource.fields.environment ?? "")
                : tag === "data_classification"
                  ? String(resource.fields.data_classification ?? "internal")
                  : "";

        if (!mappedValue) {
          unresolved.push(tag);
          continue;
        }

        tags[tag] = mappedValue;
        autoTagged.push(tag);
      }

      if (!parsed.dryRun && autoTagged.length > 0) {
        resource.fields = { ...resource.fields, tags };
        resource.updatedAt = nowIso();
        store.objects.set(resource.id, resource);
        store.pushTimeline({
          tenantId: resource.tenantId,
          workspaceId: resource.workspaceId,
          entityType: "object",
          entityId: resource.id,
          eventType: "object.updated",
          actor: actor.id,
          createdAt: nowIso(),
          payload: { cloudTagGovernance: true, autoTagged }
        });
      }

      if (autoTagged.length > 0) {
        autoTaggedCount += 1;
      }

      let exceptionId: string | undefined;
      if (!parsed.dryRun && unresolved.length > 0) {
        const exception: WorkItem = {
          id: store.createId(),
          tenantId: resource.tenantId,
          workspaceId: resource.workspaceId,
          type: "Exception",
          status: "Submitted",
          priority: "P2",
          title: `Cloud tag noncompliance: ${String(resource.fields.name ?? resource.id)}`,
          description: `Missing required tags: ${unresolved.join(", ")}`,
          requesterId: "system",
          assignmentGroup: "Cloud Platform",
          linkedObjectIds: [resource.id],
          tags: ["cloud", "tag-governance", "automation-failed"],
          comments: [],
          attachments: [],
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        store.workItems.set(exception.id, exception);
        exceptionId = exception.id;
        exceptionsCreated += 1;
      }

      remediations.push({
        resourceId: resource.id,
        autoTagged,
        unresolved,
        exceptionId
      });
    }

    res.json({
      data: {
        mode: parsed.dryRun ? "dry-run" : "live",
        requiredTags,
        resourcesEvaluated: resources.length,
        autoTaggedResources: autoTaggedCount,
        exceptionsCreated,
        remediations
      }
    });
  });

  router.get("/contracts/renewals/overview", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:view"));
    const parsed = contractRenewalOverviewSchema.parse({
      daysAhead: req.query.daysAhead ? Number(req.query.daysAhead) : undefined
    });
    const { scannedContracts, candidates } = buildContractRenewalCandidates(parsed.daysAhead);
    const dueSoon = candidates.filter((candidate) => candidate.status === "due-soon").length;
    const overdue = candidates.filter((candidate) => candidate.status === "overdue").length;

    res.json({
      data: {
        daysAhead: parsed.daysAhead,
        scannedContracts,
        dueContracts: candidates.length,
        dueSoonContracts: dueSoon,
        overdueContracts: overdue,
        candidates
      }
    });
  });

  router.get("/contracts/renewals/runs", (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const data = [...store.contractRenewalRuns.values()]
      .filter((run) => (status ? run.status === status : true))
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
    res.json({ data });
  });

  router.post("/contracts/renewals/runs", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = contractRenewalRunSchema.parse(req.body);
    const run = runContractRenewals(actor.id, parsed.mode, parsed.daysAhead);
    res.status(201).json({ data: run });
  });

  router.get("/saas/reclaim/policies", (_req, res) => {
    res.json({ data: [...store.saasReclaimPolicies.values()] });
  });

  router.post("/saas/reclaim/policies", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = saasReclaimPolicyCreateSchema.parse(req.body);
    const policy: SaasReclaimPolicy = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      name: parsed.name,
      appName: parsed.appName,
      inactivityDays: parsed.inactivityDays,
      warningDays: parsed.warningDays,
      autoReclaim: parsed.autoReclaim,
      schedule: parsed.schedule,
      enabled: parsed.enabled,
      nextRunAt: parsed.nextRunAt,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.saasReclaimPolicies.set(policy.id, policy);
    res.status(201).json({ data: policy });
  });

  router.patch("/saas/reclaim/policies/:id", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = saasReclaimPolicyUpdateSchema.parse(req.body);
    const policy = store.saasReclaimPolicies.get(req.params.id);
    if (!policy) {
      res.status(404).json({ error: "SaaS reclaim policy not found" });
      return;
    }
    if (parsed.name !== undefined) policy.name = parsed.name;
    if (parsed.appName !== undefined) policy.appName = parsed.appName;
    if (parsed.inactivityDays !== undefined) policy.inactivityDays = parsed.inactivityDays;
    if (parsed.warningDays !== undefined) policy.warningDays = parsed.warningDays;
    if (parsed.autoReclaim !== undefined) policy.autoReclaim = parsed.autoReclaim;
    if (parsed.schedule !== undefined) policy.schedule = parsed.schedule;
    if (parsed.enabled !== undefined) policy.enabled = parsed.enabled;
    if (parsed.nextRunAt !== undefined) policy.nextRunAt = parsed.nextRunAt;
    policy.updatedAt = nowIso();
    store.saasReclaimPolicies.set(policy.id, policy);
    res.json({ data: policy });
  });

  router.get("/saas/reclaim/runs", (req, res) => {
    const policyId = req.query.policyId ? String(req.query.policyId) : undefined;
    const data = [...store.saasReclaimRuns.values()]
      .filter((run) => (policyId ? run.policyId === policyId : true))
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
    res.json({ data });
  });

  router.post("/saas/reclaim/runs", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = saasReclaimRunCreateSchema.parse(req.body);
    const policy = store.saasReclaimPolicies.get(parsed.policyId);
    if (!policy) {
      res.status(404).json({ error: "SaaS reclaim policy not found" });
      return;
    }
    if (!policy.enabled) {
      res.status(409).json({ error: "SaaS reclaim policy is disabled" });
      return;
    }
    const mode = parsed.mode === "dry-run" ? "dry-run" : "live";
    const run = runSaasReclaim(policy, actor.id, mode);
    res.status(201).json({ data: run });
  });

  router.post("/saas/reclaim/runs/:id/retry", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = saasReclaimRunRetrySchema.parse(req.body);
    const priorRun = store.saasReclaimRuns.get(req.params.id);
    if (!priorRun) {
      res.status(404).json({ error: "SaaS reclaim run not found" });
      return;
    }
    const policy = store.saasReclaimPolicies.get(priorRun.policyId);
    if (!policy) {
      res.status(404).json({ error: "SaaS reclaim policy not found" });
      return;
    }
    const failedIds = new Set(
      priorRun.candidates.filter((candidate) => candidate.action === "failed").map((candidate) => candidate.accountObjectId)
    );
    const retryMode = parsed.mode === "dry-run" ? "dry-run" : "retry";
    const run = runSaasReclaim(policy, actor.id, retryMode, failedIds);
    res.status(201).json({ data: run });
  });

  router.get("/catalog/items", (_req, res) => {
    res.json({ data: [...store.catalogItems.values()] });
  });

  router.post("/catalog/items", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = catalogItemCreateSchema.parse(req.body);
    const item: CatalogItemDefinition = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      name: parsed.name,
      description: parsed.description,
      category: parsed.category,
      audience: parsed.audience,
      regions: parsed.regions,
      expectedDelivery: parsed.expectedDelivery,
      formFields: parsed.formFields.map((field) => ({
        id: store.createId(),
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        requiredIf: field.requiredIf,
        defaultValue: field.defaultValue
      })),
      defaultWorkflowDefinitionId: parsed.defaultWorkflowDefinitionId,
      riskLevel: parsed.riskLevel,
      active: parsed.active,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.catalogItems.set(item.id, item);
    res.status(201).json({ data: item });
  });

  router.patch("/catalog/items/:id", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = catalogItemUpdateSchema.parse(req.body);
    const item = store.catalogItems.get(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Catalog item not found" });
      return;
    }
    if (parsed.tenantId !== undefined) item.tenantId = parsed.tenantId;
    if (parsed.workspaceId !== undefined) item.workspaceId = parsed.workspaceId;
    if (parsed.name !== undefined) item.name = parsed.name;
    if (parsed.description !== undefined) item.description = parsed.description;
    if (parsed.category !== undefined) item.category = parsed.category;
    if (parsed.audience !== undefined) item.audience = parsed.audience;
    if (parsed.regions !== undefined) item.regions = parsed.regions;
    if (parsed.expectedDelivery !== undefined) item.expectedDelivery = parsed.expectedDelivery;
    if (parsed.defaultWorkflowDefinitionId !== undefined) {
      item.defaultWorkflowDefinitionId = parsed.defaultWorkflowDefinitionId;
    }
    if (parsed.riskLevel !== undefined) item.riskLevel = parsed.riskLevel;
    if (parsed.active !== undefined) item.active = parsed.active;
    item.updatedAt = nowIso();
    if (parsed.formFields) {
      item.formFields = parsed.formFields.map((field) => ({
        id: store.createId(),
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required ?? false,
        options: field.options,
        requiredIf: field.requiredIf,
        defaultValue: field.defaultValue
      }));
    }
    store.catalogItems.set(item.id, item);
    res.json({ data: item });
  });

  router.post("/catalog/items/:id/preview", (req, res) => {
    const parsed = catalogPreviewSchema.parse(req.body);
    const item = store.catalogItems.get(req.params.id);
    if (!item) {
      res.status(404).json({ error: "Catalog item not found" });
      return;
    }

    const resolvedFields = item.formFields.map((field) => {
      const requiredByCondition =
        field.requiredIf !== undefined
          ? parsed.fieldValues[field.requiredIf.key] === field.requiredIf.equals
          : false;
      return {
        ...field,
        requiredResolved: field.required || requiredByCondition,
        value: parsed.fieldValues[field.key] ?? field.defaultValue ?? null
      };
    });

    res.json({
      data: {
        catalogItemId: item.id,
        fields: resolvedFields
      }
    });
  });

  router.post("/catalog/submit", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = catalogSubmitSchema.parse(req.body);
    const item = store.catalogItems.get(parsed.catalogItemId);
    if (!item || !item.active) {
      res.status(404).json({ error: "Catalog item not found or inactive" });
      return;
    }

    const regionFromFields = String(
      parsed.fieldValues.region ??
        parsed.fieldValues.location ??
        parsed.fieldValues.country ??
        item.regions[0] ??
        ""
    );
    const tagsFromFields = (() => {
      const raw = parsed.fieldValues.tags;
      if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry));
      }
      if (typeof raw === "string") {
        return raw
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
      return [];
    })();
    const linkedObjectTypes = (() => {
      const raw = parsed.fieldValues.linked_object_types;
      if (Array.isArray(raw)) {
        return raw.map((entry) => String(entry));
      }
      if (typeof raw === "string") {
        return raw
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
      }
      return [] as string[];
    })();

    const approvalTypes = approvalsForRequest([...store.approvalMatrixRules.values()], "Request", item.riskLevel, {
      estimatedCost: parsed.estimatedCost,
      region: regionFromFields,
      tags: ["catalog", item.category.toLowerCase(), item.id, ...tagsFromFields],
      linkedObjectTypes
    });

    for (const type of approvalTypes) {
      const approverId = `${type}-approver`;
      const sod = validateSod([...store.sodRules.values()], "Request", parsed.requesterId, approverId);
      if (!sod.ok) {
        res.status(409).json({ error: sod.reason ?? "Separation-of-duties validation failed" });
        return;
      }
    }

    const workItem: WorkItem = {
      id: store.createId(),
      tenantId: item.tenantId,
      workspaceId: item.workspaceId,
      type: "Request",
      status: "Submitted",
      priority: item.riskLevel === "high" ? "P1" : "P2",
      title: parsed.title,
      description: parsed.description,
      requesterId: parsed.requesterId,
      assignmentGroup: "Catalog Fulfillment",
      linkedObjectIds: [],
      tags: ["catalog", item.category.toLowerCase()],
      comments: [
        {
          id: store.createId(),
          authorId: actor.id,
          body: `Catalog submission for '${item.name}'`,
          mentions: [],
          createdAt: nowIso()
        }
      ],
      attachments: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.workItems.set(workItem.id, workItem);

    const chainId = approvalTypes.length > 1 ? store.createId() : undefined;
    const chainMode = approvalTypes.length > 1 ? ("all" as const) : undefined;
    const createdApprovals = approvalTypes.map((type, index) => {
      const approverId = `${type}-approver`;
      const approval = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        workItemId: workItem.id,
        type,
        approverId,
        decision: "pending" as const,
        chainId,
        chainMode,
        chainOrder: chainId ? index + 1 : undefined,
        createdAt: nowIso()
      };
      store.approvals.set(approval.id, approval);
      return approval;
    });

    res.status(201).json({
      data: {
        workItem,
        approvals: createdApprovals,
        fieldValues: parsed.fieldValues
      }
    });
  });

  router.get("/kb/articles", (_req, res) => {
    res.json({ data: kbArticles });
  });

  router.get("/integrations/health", (_req, res) => {
    const configured = [...store.connectors.values()].map((connector) => ({
      id: connector.id,
      name: connector.name,
      type: connector.type,
      status: connector.status,
      lastSuccessfulSync: connector.lastSuccessfulSync ?? connector.updatedAt,
      ingested: connector.recordsIngested,
      updated: connector.recordsUpdated,
      failed: connector.recordsFailed,
      message:
        connector.status === "Healthy"
          ? "Connector healthy."
          : connector.status === "Degraded"
            ? "Connector degraded. Review retries and mappings."
            : "Connector failed. Action required."
    }));
    res.json({ data: configured.length > 0 ? configured : integrationsHealth });
  });

  router.get("/dashboards/:name", (req, res) => {
    const key = req.params.name as keyof typeof dashboards;
    res.json({ data: dashboards[key] ?? dashboards.executive });
  });

  router.get("/reports/definitions", (_req, res) => {
    const data = [...store.reportDefinitions.values()].sort((left, right) => left.name.localeCompare(right.name));
    res.json({ data });
  });

  router.post("/reports/definitions", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = reportDefinitionCreateSchema.parse(req.body);
    const definition: ReportDefinition = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      name: parsed.name,
      description: parsed.description,
      objectType: parsed.objectType,
      filters: {
        containsText: parsed.filters.containsText,
        fieldEquals: parsed.filters.fieldEquals
      },
      columns: parsed.columns,
      schedule: parsed.schedule,
      enabled: parsed.enabled,
      createdBy: actor.id,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.reportDefinitions.set(definition.id, definition);
    res.status(201).json({ data: definition });
  });

  router.patch("/reports/definitions/:id", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = reportDefinitionUpdateSchema.parse(req.body);
    const definition = store.reportDefinitions.get(req.params.id);
    if (!definition) {
      res.status(404).json({ error: "Report definition not found" });
      return;
    }
    if (parsed.name !== undefined) definition.name = parsed.name;
    if (parsed.description !== undefined) definition.description = parsed.description;
    if (parsed.objectType !== undefined) definition.objectType = parsed.objectType;
    if (parsed.filters !== undefined) {
      definition.filters = {
        containsText: parsed.filters.containsText,
        fieldEquals: parsed.filters.fieldEquals
      };
    }
    if (parsed.columns !== undefined) definition.columns = parsed.columns;
    if (parsed.schedule !== undefined) definition.schedule = parsed.schedule;
    if (parsed.enabled !== undefined) definition.enabled = parsed.enabled;
    definition.updatedAt = nowIso();
    store.reportDefinitions.set(definition.id, definition);
    res.json({ data: definition });
  });

  router.post("/reports/definitions/:id/run", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = reportRunCreateSchema.parse(req.body);
    const definition = store.reportDefinitions.get(req.params.id);
    if (!definition) {
      res.status(404).json({ error: "Report definition not found" });
      return;
    }
    if (!definition.enabled) {
      res.status(409).json({ error: "Report definition is disabled" });
      return;
    }
    const run = runReportDefinition(definition, actor.id, parsed.trigger);
    res.status(201).json({ data: run });
  });

  router.get("/reports/runs", (req, res) => {
    const definitionId = req.query.definitionId ? String(req.query.definitionId) : undefined;
    const data = [...store.reportRuns.values()]
      .filter((run) => (definitionId ? run.definitionId === definitionId : true))
      .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
    res.json({ data });
  });

  router.get("/reports/runs/:id/export", (req, res) => {
    const run = store.reportRuns.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Report run not found" });
      return;
    }
    res.json({
      data: {
        runId: run.id,
        definitionId: run.definitionId,
        fileName: run.fileName,
        format: run.format,
        content: run.content
      }
    });
  });

  router.get("/search", (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const objectType = req.query.objectType ? String(req.query.objectType) : undefined;
    const status = req.query.status ? String(req.query.status).toLowerCase() : undefined;
    const location = req.query.location ? String(req.query.location).toLowerCase() : undefined;
    const owner = req.query.owner ? String(req.query.owner).toLowerCase() : undefined;
    const complianceState = req.query.complianceState ? String(req.query.complianceState).toLowerCase() : undefined;
    const lastSeenDays = req.query.lastSeenDays ? Number(req.query.lastSeenDays) : undefined;

    type SearchResult = {
      id: string;
      type: string;
      title: string;
      entity: "object" | "work-item" | "workflow" | "kb";
      status?: string;
      location?: string;
      owner?: string;
      complianceState?: string;
      lastSeen?: string;
    };

    const objectResults: SearchResult[] = [...store.objects.values()].map((object) => ({
      id: object.id,
      type: object.type,
      title: String(object.fields.name ?? object.fields.legal_name ?? object.fields.asset_tag ?? object.id),
      entity: "object",
      status: String(object.fields.status ?? ""),
      location: String(object.fields.location ?? ""),
      owner: String(object.fields.owner ?? object.fields.assigned_to ?? ""),
      complianceState: String(object.fields.compliance_state ?? ""),
      lastSeen: String(object.fields.last_seen ?? object.fields.last_checkin ?? "")
    }));

    const workItemResults: SearchResult[] = [...store.workItems.values()].map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      entity: "work-item",
      status: item.status,
      location: "",
      owner: item.requesterId,
      complianceState: ""
    }));

    const workflowResults: SearchResult[] = [...store.workflowDefinitions.values()].map((workflow) => ({
      id: workflow.id,
      type: "Workflow",
      title: workflow.name,
      entity: "workflow"
    }));

    const kbResults: SearchResult[] = kbArticles.map((article) => ({
      id: article.id,
      type: "KB",
      title: article.title,
      entity: "kb"
    }));

    const seeded = [...objectResults, ...workItemResults, ...workflowResults, ...kbResults];
    const withQuery = q.length > 0 ? seeded.filter((item) => JSON.stringify(item).toLowerCase().includes(q)) : [];
    const results = withQuery.filter((item) => {
      if (objectType && item.type !== objectType) {
        return false;
      }
      if (status && !String(item.status ?? "").toLowerCase().includes(status)) {
        return false;
      }
      if (location && !String(item.location ?? "").toLowerCase().includes(location)) {
        return false;
      }
      if (owner && !String(item.owner ?? "").toLowerCase().includes(owner)) {
        return false;
      }
      if (complianceState && !String(item.complianceState ?? "").toLowerCase().includes(complianceState)) {
        return false;
      }
      if (lastSeenDays !== undefined && Number.isFinite(lastSeenDays)) {
        const lastSeenTs = new Date(String(item.lastSeen ?? "")).getTime();
        if (!Number.isNaN(lastSeenTs)) {
          const ageDays = Math.floor((Date.now() - lastSeenTs) / (24 * 60 * 60 * 1000));
          if (ageDays < lastSeenDays) {
            return false;
          }
        }
      }
      return true;
    });

    const facetCount = (values: string[]) =>
      Object.entries(
        values.reduce<Record<string, number>>((acc, value) => {
          const key = value || "unknown";
          acc[key] = (acc[key] ?? 0) + 1;
          return acc;
        }, {})
      )
        .sort((left, right) => right[1] - left[1])
        .map(([value, count]) => ({ value, count }));

    res.json({
      data: {
        query: q,
        filtersApplied: {
          objectType,
          status,
          location,
          owner,
          complianceState,
          lastSeenDays
        },
        facets: {
          types: facetCount(results.map((item) => item.type)),
          status: facetCount(results.map((item) => String(item.status ?? ""))),
          location: facetCount(results.map((item) => String(item.location ?? ""))),
          owner: facetCount(results.map((item) => String(item.owner ?? ""))),
          complianceState: facetCount(results.map((item) => String(item.complianceState ?? "")))
        },
        results
      }
    });
  });

  router.post("/work-items", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));

    const parsed = workItemCreateSchema.parse(req.body);
    const workItem: WorkItem = {
      id: store.createId(),
      status: "Submitted",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      comments: [],
      attachments: [],
      ...parsed
    };

    store.workItems.set(workItem.id, workItem);
    store.pushTimeline({
      tenantId: workItem.tenantId,
      workspaceId: workItem.workspaceId,
      entityType: "work-item",
      entityId: workItem.id,
      eventType: "object.created",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { type: workItem.type }
    });

    res.status(201).json({ data: workItem });
  });

  router.get("/work-items", (req, res) => {
    const type = req.query.type ? String(req.query.type) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;

    const data = [...store.workItems.values()].filter(
      (item) => (type ? item.type === type : true) && (status ? item.status === status : true)
    );

    res.json({ data });
  });

  router.patch("/work-items/:id", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));

    const parsed = workItemUpdateSchema.parse(req.body);
    const workItem = store.workItems.get(req.params.id);
    if (!workItem) {
      res.status(404).json({ error: "Work item not found" });
      return;
    }

    Object.assign(workItem, parsed);
    workItem.updatedAt = nowIso();
    store.workItems.set(workItem.id, workItem);

    store.pushTimeline({
      tenantId: workItem.tenantId,
      workspaceId: workItem.workspaceId,
      entityType: "work-item",
      entityId: workItem.id,
      eventType: "object.updated",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { updates: parsed }
    });

    res.json({ data: workItem });
  });

  router.post("/work-items/bulk", (req, res) => {
    const actor = getActor(req.headers);
    const parsed = workItemBulkActionSchema.parse(req.body);
    const canRun = can(actor.role, "workflow:run");
    const canExport = can(actor.role, "audit:export");
    permission(parsed.action === "export" ? canRun || canExport : canRun);

    const selectedIds = [...new Set(parsed.workItemIds)];
    const matched = selectedIds
      .map((id) => store.workItems.get(id))
      .filter((item): item is WorkItem => Boolean(item));

    if (matched.length === 0) {
      res.status(404).json({ error: "No matching work items found" });
      return;
    }

    if (parsed.action === "export") {
      const header = [
        "id",
        "type",
        "status",
        "priority",
        "title",
        "assignment_group",
        "assignee_id",
        "requester_id",
        "tags"
      ];
      const lines = matched.map((item) =>
        [
          escapeCsv(item.id),
          escapeCsv(item.type),
          escapeCsv(item.status),
          escapeCsv(item.priority),
          escapeCsv(item.title),
          escapeCsv(item.assignmentGroup ?? ""),
          escapeCsv(item.assigneeId ?? ""),
          escapeCsv(item.requesterId),
          escapeCsv(item.tags.join("|"))
        ].join(",")
      );
      const content = [header.map((value) => escapeCsv(value)).join(","), ...lines].join("\n");

      res.json({
        data: {
          action: "export",
          selectedCount: selectedIds.length,
          matchedCount: matched.length,
          format: "csv",
          fileName: `queue-export-${nowIso().slice(0, 10)}.csv`,
          content
        }
      });
      return;
    }

    const updatedIds: string[] = [];
    for (const item of matched) {
      const payload: Record<string, unknown> = {
        bulkAction: parsed.action
      };

      if (parsed.action === "assign") {
        if (parsed.assigneeId !== undefined) {
          item.assigneeId = parsed.assigneeId;
          payload.assigneeId = parsed.assigneeId;
        }
        if (parsed.assignmentGroup !== undefined) {
          item.assignmentGroup = parsed.assignmentGroup;
          payload.assignmentGroup = parsed.assignmentGroup;
        }
      } else if (parsed.action === "priority" && parsed.priority) {
        item.priority = parsed.priority;
        payload.priority = parsed.priority;
      } else if (parsed.action === "tag" && parsed.tag) {
        const tag = parsed.tag.trim();
        if (tag.length > 0 && !item.tags.includes(tag)) {
          item.tags.push(tag);
        }
        payload.tag = tag;
      } else if (parsed.action === "comment" && parsed.comment) {
        const comment = {
          id: store.createId(),
          authorId: actor.id,
          body: parsed.comment,
          mentions: [],
          createdAt: nowIso()
        };
        item.comments.push(comment);
        payload.commentId = comment.id;

        store.pushTimeline({
          tenantId: item.tenantId,
          workspaceId: item.workspaceId,
          entityType: "work-item",
          entityId: item.id,
          eventType: "comment.added",
          actor: actor.id,
          createdAt: nowIso(),
          payload: comment
        });
      } else if (parsed.action === "workflow-step" && parsed.workflowStep) {
        const status = workflowStepStatusMap[parsed.workflowStep as keyof typeof workflowStepStatusMap];
        if (!status) {
          res.status(400).json({ error: "Invalid workflow step" });
          return;
        }
        item.status = status;
        payload.workflowStep = parsed.workflowStep;
        payload.status = status;
      }

      item.updatedAt = nowIso();
      store.workItems.set(item.id, item);
      updatedIds.push(item.id);

      store.pushTimeline({
        tenantId: item.tenantId,
        workspaceId: item.workspaceId,
        entityType: "work-item",
        entityId: item.id,
        eventType: "object.updated",
        actor: actor.id,
        createdAt: nowIso(),
        payload
      });
    }

    res.json({
      data: {
        action: parsed.action,
        selectedCount: selectedIds.length,
        updatedCount: updatedIds.length,
        updatedIds
      }
    });
  });

  router.get("/exceptions", (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    const data = [...store.workItems.values()].filter(
      (item) => item.type === "Exception" && (status ? item.status === status : true)
    );
    res.json({ data });
  });

  router.post("/exceptions/:id/action", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = exceptionActionSchema.parse(req.body);
    const exception = store.workItems.get(req.params.id);
    if (!exception || exception.type !== "Exception") {
      res.status(404).json({ error: "Exception work item not found" });
      return;
    }

    if (parsed.action === "retry") {
      exception.status = "In Progress";
    }
    if (parsed.action === "resolve") {
      exception.status = "Completed";
    }
    if (parsed.action === "escalate") {
      exception.status = "Waiting";
      exception.assignmentGroup = "Vendor Escalation";
    }

    exception.comments.push({
      id: store.createId(),
      authorId: actor.id,
      body: `${parsed.action.toUpperCase()}: ${parsed.reason}`,
      mentions: [],
      createdAt: nowIso()
    });
    exception.updatedAt = nowIso();
    store.workItems.set(exception.id, exception);

    store.pushTimeline({
      tenantId: exception.tenantId,
      workspaceId: exception.workspaceId,
      entityType: "work-item",
      entityId: exception.id,
      eventType: "object.updated",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { action: parsed.action, reason: parsed.reason }
    });

    res.json({ data: exception });
  });

  router.post("/work-items/:id/comments", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = commentCreateSchema.parse(req.body);
    const workItem = store.workItems.get(req.params.id);
    if (!workItem) {
      res.status(404).json({ error: "Work item not found" });
      return;
    }

    const comment = {
      id: store.createId(),
      authorId: actor.id,
      body: parsed.body,
      mentions: parsed.mentions,
      createdAt: nowIso()
    };
    workItem.comments.push(comment);
    workItem.updatedAt = nowIso();
    store.workItems.set(workItem.id, workItem);

    store.pushTimeline({
      tenantId: workItem.tenantId,
      workspaceId: workItem.workspaceId,
      entityType: "work-item",
      entityId: workItem.id,
      eventType: "comment.added",
      actor: actor.id,
      createdAt: nowIso(),
      payload: comment
    });

    res.status(201).json({ data: comment });
  });

  router.post("/work-items/:id/respond-info-request", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = infoRequestResponseSchema.parse(req.body);
    const workItem = store.workItems.get(req.params.id);
    if (!workItem) {
      res.status(404).json({ error: "Work item not found" });
      return;
    }

    const canRespond = actor.role === "it-admin" || actor.id === workItem.requesterId;
    if (!canRespond) {
      res.status(403).json({ error: "Only requester or admin can respond to info requests" });
      return;
    }

    const infoRequestedApprovals = [...store.approvals.values()].filter(
      (approval) => approval.workItemId === workItem.id && approval.decision === "info-requested"
    );
    if (infoRequestedApprovals.length === 0) {
      res.status(409).json({ error: "No info-requested approvals found for this work item" });
      return;
    }

    const responseComment = {
      id: store.createId(),
      authorId: actor.id,
      body: `Requester response: ${parsed.body}`,
      mentions: infoRequestedApprovals.map((approval) => approval.approverId),
      createdAt: nowIso()
    };
    workItem.comments.push(responseComment);

    if (parsed.attachment) {
      workItem.attachments.push({
        id: store.createId(),
        fileName: parsed.attachment.fileName,
        url: parsed.attachment.url,
        uploadedBy: actor.id,
        createdAt: nowIso()
      });
    }

    const reopenedApprovalIds: string[] = [];
    for (const approval of infoRequestedApprovals) {
      approval.decision = "pending";
      approval.decidedAt = undefined;
      approval.comment = `Requester responded at ${nowIso()}`;
      store.approvals.set(approval.id, approval);
      reopenedApprovalIds.push(approval.id);

      store.pushTimeline({
        tenantId: approval.tenantId,
        workspaceId: approval.workspaceId,
        entityType: "approval",
        entityId: approval.id,
        eventType: "approval.requested",
        actor: actor.id,
        createdAt: nowIso(),
        reason: "requester-response",
        payload: {
          workItemId: approval.workItemId,
          decision: "pending",
          previousDecision: "info-requested"
        }
      });
    }

    workItem.status = "Submitted";
    workItem.updatedAt = nowIso();
    store.workItems.set(workItem.id, workItem);

    store.pushTimeline({
      tenantId: workItem.tenantId,
      workspaceId: workItem.workspaceId,
      entityType: "work-item",
      entityId: workItem.id,
      eventType: "comment.added",
      actor: actor.id,
      createdAt: nowIso(),
      payload: responseComment
    });
    store.pushTimeline({
      tenantId: workItem.tenantId,
      workspaceId: workItem.workspaceId,
      entityType: "work-item",
      entityId: workItem.id,
      eventType: "object.updated",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        status: "Submitted",
        reopenedApprovalIds
      }
    });

    res.json({
      data: {
        workItem,
        reopenedApprovalIds
      }
    });
  });

  router.post("/work-items/:id/attachments", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = attachmentCreateSchema.parse(req.body);
    const workItem = store.workItems.get(req.params.id);
    if (!workItem) {
      res.status(404).json({ error: "Work item not found" });
      return;
    }

    const attachment = {
      id: store.createId(),
      fileName: parsed.fileName,
      url: parsed.url,
      uploadedBy: actor.id,
      createdAt: nowIso()
    };
    workItem.attachments.push(attachment);
    workItem.updatedAt = nowIso();
    store.workItems.set(workItem.id, workItem);

    store.pushTimeline({
      tenantId: workItem.tenantId,
      workspaceId: workItem.workspaceId,
      entityType: "work-item",
      entityId: workItem.id,
      eventType: "attachment.added",
      actor: actor.id,
      createdAt: nowIso(),
      payload: attachment
    });

    res.status(201).json({ data: attachment });
  });

  router.get("/sla/breaches", (_req, res) => {
    res.json({ data: computeSlaBreaches(store) });
  });

  router.get("/views", (_req, res) => {
    res.json({ data: [...store.savedViews.values()] });
  });

  router.post("/views", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:view"));
    const parsed = savedViewCreateSchema.parse(req.body);
    const view: SavedView = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      name: parsed.name,
      objectType: parsed.objectType,
      filters: parsed.filters,
      columns: parsed.columns,
      createdBy: actor.id,
      createdAt: nowIso()
    };
    store.savedViews.set(view.id, view);
    res.status(201).json({ data: view });
  });

  router.get("/overlay/external-ticket-links", (_req, res) => {
    res.json({ data: [...store.externalTicketLinks.values()] });
  });

  router.post("/overlay/external-ticket-links", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = externalTicketLinkCreateSchema.parse(req.body);
    const link: ExternalTicketLink = {
      id: store.createId(),
      workItemId: parsed.workItemId,
      provider: parsed.provider,
      externalTicketId: parsed.externalTicketId,
      externalUrl: parsed.externalUrl,
      syncStatus: "linked",
      createdAt: nowIso()
    };
    store.externalTicketLinks.set(link.id, link);

    const workItem = store.workItems.get(link.workItemId);
    if (workItem) {
      workItem.comments.push({
        id: store.createId(),
        authorId: actor.id,
        body: `Linked ${link.provider} ticket ${link.externalTicketId}`,
        mentions: [],
        createdAt: nowIso()
      });
      workItem.updatedAt = nowIso();
      store.workItems.set(workItem.id, workItem);
    }

    store.pushTimeline({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      entityType: "work-item",
      entityId: link.workItemId,
      eventType: "external-ticket.linked",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { ...link }
    });

    res.status(201).json({ data: link });
  });

  router.post("/overlay/external-ticket-links/:id/sync", (req, res) => {
    const link = store.externalTicketLinks.get(req.params.id);
    if (!link) {
      res.status(404).json({ error: "External ticket link not found" });
      return;
    }

    link.syncStatus = "syncing";
    store.externalTicketLinks.set(link.id, link);
    link.syncStatus = "linked";
    link.lastSyncedAt = nowIso();
    store.externalTicketLinks.set(link.id, link);
    res.json({ data: link });
  });

  router.get("/overlay/external-ticket-links/:id/comments", (req, res) => {
    const data = [...store.externalTicketComments.values()].filter(
      (comment) => comment.externalTicketLinkId === req.params.id
    );
    res.json({ data });
  });

  router.post("/overlay/external-ticket-links/:id/comments", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = externalTicketCommentSchema.parse(req.body);
    const link = store.externalTicketLinks.get(req.params.id);
    if (!link) {
      res.status(404).json({ error: "External ticket link not found" });
      return;
    }
    const comment: ExternalTicketComment = {
      id: store.createId(),
      externalTicketLinkId: link.id,
      author: actor.id,
      body: parsed.body,
      createdAt: nowIso()
    };
    store.externalTicketComments.set(comment.id, comment);
    res.status(201).json({ data: comment });
  });

  router.get("/admin/schemas", (_req, res) => {
    res.json({ data: [...store.customSchemas.values()] });
  });

  router.post("/admin/schemas", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = customSchemaCreateSchema.parse(req.body);
    const schema: CustomObjectSchema = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      name: parsed.name,
      pluralName: parsed.pluralName,
      description: parsed.description,
      fields: parsed.fields.map((field) => ({
        id: store.createId(),
        name: field.name,
        type: field.type,
        required: field.required,
        allowedValues: field.allowedValues
      })),
      relationships: parsed.relationships,
      active: true,
      createdBy: actor.id,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.customSchemas.set(schema.id, schema);
    res.status(201).json({ data: schema });
  });

  router.get("/admin/rbac/field-restrictions", (_req, res) => {
    res.json({ data: [...store.fieldRestrictions.values()] });
  });

  router.post("/admin/rbac/field-restrictions", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = fieldRestrictionCreateSchema.parse(req.body);
    const restriction: FieldRestriction = {
      id: store.createId(),
      objectType: parsed.objectType,
      field: parsed.field,
      readRoles: parsed.readRoles,
      writeRoles: parsed.writeRoles,
      maskStyle: parsed.maskStyle
    };
    store.fieldRestrictions.set(restriction.id, restriction);
    res.status(201).json({ data: restriction });
  });

  router.get("/admin/rbac/sod-rules", (_req, res) => {
    res.json({ data: [...store.sodRules.values()] });
  });

  router.post("/admin/rbac/sod-rules", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = sodRuleCreateSchema.parse(req.body);
    const rule: SodRule = {
      id: store.createId(),
      name: parsed.name,
      description: parsed.description,
      requestTypes: parsed.requestTypes,
      enabled: parsed.enabled
    };
    store.sodRules.set(rule.id, rule);
    res.status(201).json({ data: rule });
  });

  router.get("/admin/rbac/approval-matrix", (_req, res) => {
    res.json({ data: [...store.approvalMatrixRules.values()] });
  });

  router.post("/admin/rbac/approval-matrix", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = approvalMatrixRuleCreateSchema.parse(req.body);
    const rule: ApprovalMatrixRule = {
      id: store.createId(),
      name: parsed.name,
      requestType: parsed.requestType,
      riskLevel: parsed.riskLevel,
      costThreshold: parsed.costThreshold,
      regions: parsed.regions,
      requiredTags: parsed.requiredTags,
      linkedObjectTypes: parsed.linkedObjectTypes,
      approverTypes: parsed.approverTypes,
      enabled: parsed.enabled
    };
    store.approvalMatrixRules.set(rule.id, rule);
    res.status(201).json({ data: rule });
  });

  router.post("/admin/rbac/authorize", (req, res) => {
    const actor = getActor(req.headers);
    const action = String(req.body.action ?? "");
    const allowed = can(
      actor.role,
      action as
        | "object:view"
        | "object:create"
        | "object:update"
        | "object:delete"
        | "workflow:run"
        | "workflow:edit"
        | "approval:decide"
        | "automation:high-risk"
        | "audit:export"
    );
    res.json({ data: { actor, action, allowed } });
  });

  router.get("/admin/policies", (_req, res) => {
    res.json({ data: [...store.policies.values()] });
  });

  router.get("/admin/policies/exceptions", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:view"));
    const policyId = req.query.policyId ? String(req.query.policyId) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const data = [...store.policyExceptions.values()].filter(
      (item) =>
        (policyId ? item.policyId === policyId : true) &&
        (status ? item.status === status : true)
    );
    res.json({ data });
  });

  router.post("/admin/policies", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = policyCreateSchema.parse(req.body);
    const policy: PolicyDefinition = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      name: parsed.name,
      description: parsed.description,
      objectType: parsed.objectType,
      severity: parsed.severity,
      expression: parsed.expression,
      remediation: parsed.remediation,
      active: parsed.active,
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.policies.set(policy.id, policy);
    res.status(201).json({ data: policy });
  });

  router.post("/admin/policies/:id/evaluate", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const policy = store.policies.get(req.params.id);
    if (!policy) {
      res.status(404).json({ error: "Policy not found" });
      return;
    }
    const result = evaluatePolicy(store, policy, actor.id);
    res.json({ data: result });
  });

  router.get("/admin/policies/:id/exceptions", (req, res) => {
    const data = [...store.policyExceptions.values()].filter((item) => item.policyId === req.params.id);
    res.json({ data });
  });

  router.post("/admin/policies/exceptions/:id/action", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = policyExceptionActionSchema.parse(req.body);
    const exception = store.policyExceptions.get(req.params.id);
    if (!exception) {
      res.status(404).json({ error: "Policy exception not found" });
      return;
    }

    if (parsed.action === "waive" || parsed.action === "renew") {
      if (!parsed.waiverExpiresAt) {
        res.status(400).json({ error: "waiverExpiresAt is required for waive/renew actions" });
        return;
      }
      exception.status = "waived";
      exception.waiverExpiresAt = parsed.waiverExpiresAt;
    } else if (parsed.action === "resolve") {
      exception.status = "resolved";
      exception.waiverExpiresAt = undefined;
    } else if (parsed.action === "reopen") {
      exception.status = "open";
      exception.waiverExpiresAt = undefined;
    }

    store.policyExceptions.set(exception.id, exception);
    const policy = store.policies.get(exception.policyId);
    if (policy) {
      store.pushTimeline({
        tenantId: policy.tenantId,
        workspaceId: policy.workspaceId,
        entityType: "policy",
        entityId: policy.id,
        eventType: "policy.exception.updated",
        actor: actor.id,
        createdAt: nowIso(),
        payload: {
          exceptionId: exception.id,
          action: parsed.action,
          reason: parsed.reason,
          status: exception.status,
          waiverExpiresAt: exception.waiverExpiresAt
        }
      });
    }

    res.json({ data: exception });
  });

  router.get("/admin/connectors", (_req, res) => {
    res.json({ data: [...store.connectors.values()] });
  });

  router.post("/admin/connectors", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = connectorCreateSchema.parse(req.body);
    const connector: ConnectorConfig = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      name: parsed.name,
      type: parsed.type,
      mode: parsed.mode,
      status: "Healthy",
      recordsIngested: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsFailed: 0,
      fieldMappings: parsed.fieldMappings,
      transforms: parsed.transforms.map((transform) => ({
        id: transform.id ?? store.createId(),
        field: transform.field,
        type: transform.type,
        config: transform.config
      })),
      filters: parsed.filters.map((filter) => ({
        id: filter.id ?? store.createId(),
        expression: filter.expression
      })),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.connectors.set(connector.id, connector);

    store.pushTimeline({
      tenantId: connector.tenantId,
      workspaceId: connector.workspaceId,
      entityType: "object",
      entityId: connector.id,
      eventType: "object.created",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { type: "connector" }
    });

    res.status(201).json({ data: connector });
  });

  router.post("/admin/connectors/:id/run", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = connectorRunSchema.parse(req.body);
    const connector = store.connectors.get(req.params.id);
    if (!connector) {
      res.status(404).json({ error: "Connector not found" });
      return;
    }

    const run: ConnectorRun = {
      id: store.createId(),
      connectorId: connector.id,
      mode: parsed.mode,
      startedAt: nowIso(),
      completedAt: nowIso(),
      status: connector.status === "Failed" ? "failed" : "success",
      summary:
        connector.status === "Failed"
          ? "Connector failed. Review auth and mapping."
          : `${parsed.mode} completed with no blocking errors.`
    };
    store.connectorRuns.set(run.id, run);

    connector.lastSuccessfulSync = run.status === "success" ? nowIso() : connector.lastSuccessfulSync;
    connector.recordsIngested += parsed.mode === "sync" ? 12 : 0;
    connector.recordsUpdated += parsed.mode === "sync" ? 5 : 0;
    connector.updatedAt = nowIso();
    store.connectors.set(connector.id, connector);

    store.pushTimeline({
      tenantId: connector.tenantId,
      workspaceId: connector.workspaceId,
      entityType: "object",
      entityId: connector.id,
      eventType: "connector.sync",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { ...run }
    });

    res.status(201).json({ data: run });
  });

  router.get("/admin/connectors/:id/runs", (req, res) => {
    const data = [...store.connectorRuns.values()].filter((run) => run.connectorId === req.params.id);
    res.json({ data });
  });

  router.get("/admin/notifications", (_req, res) => {
    res.json({ data: [...store.notificationRules.values()] });
  });

  router.post("/admin/notifications", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = notificationRuleCreateSchema.parse(req.body);
    const rule: NotificationRule = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      name: parsed.name,
      trigger: parsed.trigger,
      channels: parsed.channels,
      enabled: parsed.enabled,
      createdAt: nowIso()
    };
    store.notificationRules.set(rule.id, rule);
    res.status(201).json({ data: rule });
  });

  router.get("/admin/config-versions", (_req, res) => {
    res.json({ data: [...store.configVersions.values()] });
  });

  router.post("/admin/config-versions", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = configVersionCreateSchema.parse(req.body);
    const currentVersions = [...store.configVersions.values()].filter(
      (item) => item.kind === parsed.kind && item.name === parsed.name
    );
    const version: ConfigVersion = {
      id: store.createId(),
      tenantId: parsed.tenantId,
      workspaceId: parsed.workspaceId,
      kind: parsed.kind,
      name: parsed.name,
      version: currentVersions.length + 1,
      state: "draft",
      changedBy: actor.id,
      reason: parsed.reason,
      payload: parsed.payload,
      createdAt: nowIso()
    };
    store.configVersions.set(version.id, version);
    res.status(201).json({ data: version });
  });

  router.post("/admin/config-versions/:id/state", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = configVersionPublishSchema.parse(req.body);
    const version = store.configVersions.get(req.params.id);
    if (!version) {
      res.status(404).json({ error: "Config version not found" });
      return;
    }
    version.state = parsed.state;
    version.reason = parsed.reason;
    store.configVersions.set(version.id, version);

    store.pushTimeline({
      tenantId: version.tenantId,
      workspaceId: version.workspaceId,
      entityType: "policy",
      entityId: version.id,
      eventType: "config.published",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { state: parsed.state, kind: version.kind, name: version.name }
    });

    res.json({ data: version });
  });

  router.post("/import/csv/preview", (req, res) => {
    const parsed = csvPreviewSchema.parse(req.body);
    const sample = parsed.rows.slice(0, 5).map((row, index) => ({
      index,
      mapped: Object.entries(parsed.fieldMapping).reduce<Record<string, unknown>>((acc, [sourceField, targetField]) => {
        acc[targetField] = row[sourceField];
        return acc;
      }, {}),
      raw: row
    }));

    res.json({
      data: {
        objectType: parsed.objectType,
        totalRows: parsed.rows.length,
        mappedSample: sample,
        validation: {
          errors: [],
          warnings: sample.filter((item) => Object.keys(item.mapped).length === 0).map((item) => item.index)
        }
      }
    });
  });

  router.post("/import/csv/apply", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:create"));
    const parsed = csvPreviewSchema.parse(req.body);
    const createdIds: string[] = [];

    for (const row of parsed.rows) {
      const mapped = Object.entries(parsed.fieldMapping).reduce<Record<string, unknown>>((acc, [sourceField, targetField]) => {
        acc[targetField] = row[sourceField];
        return acc;
      }, {});
      const object: GraphObject = {
        id: store.createId(),
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: parsed.objectType,
        fields: Object.keys(mapped).length > 0 ? mapped : row,
        provenance: {},
        quality: {
          freshness: 0.7,
          completeness: 0.6,
          consistency: 0.8,
          coverage: 0.6
        },
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.objects.set(object.id, object);
      createdIds.push(object.id);
    }

    store.pushTimeline({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      entityType: "object",
      entityId: createdIds[0] ?? store.createId(),
      eventType: "object.created",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { importedCount: createdIds.length, objectType: parsed.objectType }
    });

    res.status(201).json({ data: { importedCount: createdIds.length, ids: createdIds } });
  });

  router.get("/approvals", (req, res) => {
    const workItemId = req.query.workItemId ? String(req.query.workItemId) : undefined;
    const data = [...store.approvals.values()].filter((approval) =>
      workItemId ? approval.workItemId === workItemId : true
    );
    res.json({ data });
  });

  router.get("/approvals/inbox", (req, res) => {
    const actor = getActor(req.headers);
    const approverId = req.query.approverId ? String(req.query.approverId) : actor.id;
    const decision = req.query.decision ? String(req.query.decision) : undefined;
    const includeContext = String(req.query.includeContext ?? "false").toLowerCase() === "true";

    const base = [...store.approvals.values()].filter(
      (approval) =>
        approval.approverId === approverId && (decision ? approval.decision === decision : true)
    );

    if (!includeContext) {
      res.json({ data: base });
      return;
    }

    const data = base.map((approval) => {
      const workItem = store.workItems.get(approval.workItemId);
      if (!workItem) {
        return {
          ...approval,
          riskLevel: "medium",
          recommendedDecision: "request-info",
          evidenceSummary: "Work item context missing."
        };
      }

      const priorityRisk =
        workItem.priority === "P0" || workItem.priority === "P1"
          ? "high"
          : workItem.priority === "P2"
            ? "medium"
            : "low";
      const riskLevel =
        workItem.tags.includes("vip") || workItem.tags.includes("legal-hold") ? "high" : priorityRisk;

      let recommendedDecision: "approve" | "reject" | "request-info";
      if (workItem.status === "Blocked") {
        recommendedDecision = "reject";
      } else if (!workItem.description || workItem.description.trim().length < 8 || workItem.linkedObjectIds.length === 0) {
        recommendedDecision = "request-info";
      } else if (riskLevel === "high" && workItem.comments.length < 1) {
        recommendedDecision = "request-info";
      } else {
        recommendedDecision = "approve";
      }

      return {
        ...approval,
        riskLevel,
        recommendedDecision,
        workItem: {
          id: workItem.id,
          title: workItem.title,
          type: workItem.type,
          status: workItem.status,
          priority: workItem.priority,
          assignmentGroup: workItem.assignmentGroup,
          requesterId: workItem.requesterId,
          tags: workItem.tags
        },
        evidenceSummary: `${workItem.comments.length} comment(s), ${workItem.attachments.length} attachment(s), ${workItem.linkedObjectIds.length} linked object(s).`
      };
    });
    res.json({ data });
  });

  router.post("/approvals/chains", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "approval:decide") || can(actor.role, "workflow:run"));
    const parsed = approvalChainCreateSchema.parse(req.body);
    const workItem = store.workItems.get(parsed.workItemId);
    if (!workItem) {
      res.status(404).json({ error: "Work item not found for approval chain" });
      return;
    }

    const chainId = store.createId();
    const createdApprovals: ApprovalRecord[] = [];
    for (const [index, candidate] of parsed.approvals.entries()) {
      const sod = validateSod([...store.sodRules.values()], workItem.type, workItem.requesterId, candidate.approverId);
      if (!sod.ok) {
        res.status(409).json({ error: sod.reason ?? "Separation-of-duties validation failed" });
        return;
      }

      const approval: ApprovalRecord = {
        id: store.createId(),
        tenantId: parsed.tenantId,
        workspaceId: parsed.workspaceId,
        workItemId: parsed.workItemId,
        type: candidate.type,
        approverId: candidate.approverId,
        decision: "pending",
        expiresAt: candidate.expiresAt,
        chainId,
        chainMode: parsed.mode,
        chainOrder: index + 1,
        createdAt: nowIso()
      };
      store.approvals.set(approval.id, approval);
      createdApprovals.push(approval);
      store.pushTimeline({
        tenantId: approval.tenantId,
        workspaceId: approval.workspaceId,
        entityType: "approval",
        entityId: approval.id,
        eventType: "approval.requested",
        actor: actor.id,
        reason: parsed.reason,
        createdAt: nowIso(),
        payload: {
          workItemId: approval.workItemId,
          chainId,
          chainMode: parsed.mode,
          chainOrder: approval.chainOrder
        }
      });
    }

    res.status(201).json({
      data: {
        chainId,
        mode: parsed.mode,
        workItemId: parsed.workItemId,
        approvals: createdApprovals
      }
    });
  });

  router.post("/approvals/:id/expiry", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "approval:decide"));
    const parsed = approvalExpirySchema.parse(req.body);
    const approval = store.approvals.get(req.params.id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    approval.expiresAt = parsed.expiresAt;
    store.approvals.set(approval.id, approval);
    res.json({ data: approval });
  });

  router.post("/approvals/escalations/run", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "approval:decide"));
    const parsed = approvalEscalationRunSchema.parse(req.body);

    const nowTs = Date.now();
    const expiredApprovals = [...store.approvals.values()].filter((approval) => {
      if (approval.decision !== "pending" || !approval.expiresAt) {
        return false;
      }
      const expiryTs = new Date(approval.expiresAt).getTime();
      return !Number.isNaN(expiryTs) && expiryTs <= nowTs;
    });

    const escalatedApprovalIds: string[] = [];
    const expiredApprovalIds: string[] = [];

    for (const approval of expiredApprovals) {
      expiredApprovalIds.push(approval.id);

      if (parsed.dryRun) {
        continue;
      }

      approval.decision = "expired";
      approval.decidedAt = nowIso();
      approval.comment = "Timed out and escalated";
      store.approvals.set(approval.id, approval);

      store.pushTimeline({
        tenantId: approval.tenantId,
        workspaceId: approval.workspaceId,
        entityType: "approval",
        entityId: approval.id,
        eventType: "approval.decided",
        actor: actor.id,
        createdAt: nowIso(),
        payload: {
          decision: "expired",
          comment: approval.comment
        }
      });

      const escalated: typeof approval = {
        id: store.createId(),
        tenantId: approval.tenantId,
        workspaceId: approval.workspaceId,
        workItemId: approval.workItemId,
        type: approval.type,
        approverId: parsed.fallbackApproverId,
        decision: "pending",
        comment: `Escalated from ${approval.id}`,
        chainId: approval.chainId,
        chainMode: approval.chainMode,
        chainOrder: approval.chainOrder,
        createdAt: nowIso(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };
      store.approvals.set(escalated.id, escalated);
      escalatedApprovalIds.push(escalated.id);

      store.pushTimeline({
        tenantId: escalated.tenantId,
        workspaceId: escalated.workspaceId,
        entityType: "approval",
        entityId: escalated.id,
        eventType: "approval.requested",
        actor: actor.id,
        reason: "Escalated after approval timeout",
        createdAt: nowIso(),
        payload: {
          previousApprovalId: approval.id,
          workItemId: approval.workItemId,
          type: approval.type
        }
      });
    }

    res.json({
      data: {
        mode: parsed.dryRun ? "dry-run" : "live",
        expiredCount: expiredApprovalIds.length,
        escalatedCount: escalatedApprovalIds.length,
        expiredApprovalIds,
        escalatedApprovalIds
      }
    });
  });

  router.post("/approvals/:id/decision", (req, res) => {
    const actor = getActor(req.headers);
    const parsed = approvalDecisionSchema.parse(req.body);
    const approval = workflows.decideApproval(req.params.id, actor, parsed.decision, parsed.comment);
    res.json({ data: approval });
  });

  router.post("/approvals/:id/delegate", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "approval:decide"));
    const parsed = approvalDelegationSchema.parse(req.body);
    const approval = store.approvals.get(req.params.id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    if (approval.approverId !== actor.id && actor.role !== "it-admin") {
      res.status(403).json({ error: "Only assigned approver or admin can delegate" });
      return;
    }
    approval.approverId = parsed.approverId;
    approval.comment = parsed.comment ?? approval.comment;
    store.approvals.set(approval.id, approval);
    res.json({ data: approval });
  });

  router.get("/workflows/definitions", (_req, res) => {
    res.json({ data: [...store.workflowDefinitions.values()] });
  });

  router.post("/workflows/definitions", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = workflowDefinitionCreateSchema.parse(req.body);
    const definition = {
      id: parsed.id ?? store.createId(),
      name: parsed.name,
      version: 1,
      playbook: parsed.playbook,
      trigger: parsed.trigger,
      steps: parsed.steps.map((step) => ({
        id: step.id ?? store.createId(),
        name: step.name,
        type: step.type,
        riskLevel: step.riskLevel,
        config: step.config
      })),
      active: false,
      createdAt: nowIso()
    };
    store.workflowDefinitions.set(definition.id, definition);

    const version: ConfigVersion = {
      id: store.createId(),
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      kind: "workflow",
      name: definition.name,
      version: definition.version,
      state: "draft",
      changedBy: actor.id,
      reason: "Created workflow draft",
      payload: definition,
      createdAt: nowIso()
    };
    store.configVersions.set(version.id, version);

    res.status(201).json({ data: definition });
  });

  router.post("/workflows/definitions/:id/state", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:edit"));
    const parsed = workflowDefinitionStateSchema.parse(req.body);
    const definition = store.workflowDefinitions.get(req.params.id);
    if (!definition) {
      res.status(404).json({ error: "Workflow definition not found" });
      return;
    }

    if (parsed.action === "publish") {
      definition.active = true;
      definition.publishedAt = nowIso();
    } else {
      definition.active = false;
    }
    definition.version += 1;
    store.workflowDefinitions.set(definition.id, definition);

    const version: ConfigVersion = {
      id: store.createId(),
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      kind: "workflow",
      name: definition.name,
      version: definition.version,
      state: parsed.action === "publish" ? "published" : "rolled_back",
      changedBy: actor.id,
      reason: parsed.reason,
      payload: { ...definition },
      createdAt: nowIso()
    };
    store.configVersions.set(version.id, version);

    store.pushTimeline({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      entityType: "workflow",
      entityId: definition.id,
      eventType: "config.published",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { action: parsed.action, reason: parsed.reason, version: definition.version }
    });

    res.json({ data: definition });
  });

  router.post("/workflows/definitions/:id/simulate", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = workflowSimulationSchema.parse(req.body);
    const definition = store.workflowDefinitions.get(req.params.id);
    if (!definition) {
      res.status(404).json({ error: "Workflow definition not found" });
      return;
    }
    const plan = definition.steps.map((step, index) => ({
      order: index + 1,
      stepId: step.id,
      name: step.name,
      type: step.type,
      riskLevel: step.riskLevel,
      requiresApproval: step.type === "approval" || step.riskLevel === "high"
    }));
    store.pushTimeline({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      entityType: "workflow",
      entityId: definition.id,
      eventType: "workflow.step.executed",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { simulation: true, inputs: parsed.inputs }
    });
    res.json({
      data: {
        workflowDefinitionId: definition.id,
        inputs: parsed.inputs,
        plan,
        outcome: "dry-run-complete"
      }
    });
  });

  router.post("/workflows/runs", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));

    const parsed = runWorkflowSchema.parse(req.body);
    const run = workflows.startRun(
      parsed.definitionId,
      parsed.tenantId,
      parsed.workspaceId,
      parsed.inputs,
      actor,
      parsed.linkedWorkItemId
    );

    res.status(201).json({ data: run });
  });

  router.post("/workflows/runs/:id/advance", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const run = workflows.advanceRun(req.params.id, actor);
    res.json({ data: run });
  });

  router.get("/workflows/runs/:id", (req, res) => {
    const run = store.workflowRuns.get(req.params.id);
    if (!run) {
      res.status(404).json({ error: "Workflow run not found" });
      return;
    }
    res.json({ data: run });
  });

  router.get("/device-lifecycle/runs", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const deviceId = req.query.deviceId ? String(req.query.deviceId) : undefined;
    const data = [...store.deviceLifecycleRuns.values()]
      .filter((run) => (deviceId ? run.deviceId === deviceId : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    res.json({ data });
  });

  router.post("/device-lifecycle/preview", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = deviceLifecyclePreviewSchema.parse(req.body);
    const plan = buildDeviceLifecyclePlan(parsed);
    if (!plan) {
      res.status(404).json({ error: "Device not found for lifecycle plan" });
      return;
    }
    const run: DeviceLifecycleRun = {
      id: store.createId(),
      mode: "preview",
      status: "planned",
      deviceId: plan.deviceId,
      requesterId: parsed.requesterId,
      plan,
      createdTaskIds: [],
      createdApprovalIds: [],
      createdObjectIds: [],
      createdAt: nowIso()
    };
    store.deviceLifecycleRuns.set(run.id, run);
    res.status(201).json({ data: run });
  });

  router.post("/device-lifecycle/execute", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = deviceLifecycleExecuteSchema.parse(req.body);
    const plan = buildDeviceLifecyclePlan(parsed);
    if (!plan) {
      res.status(404).json({ error: "Device not found for lifecycle execution" });
      return;
    }

    const approverByType: Record<string, string> = {
      manager: "manager-approver",
      "app-owner": "app-owner-approver",
      security: "security-approver",
      finance: "finance-approver",
      it: "it-approver",
      custom: "custom-approver"
    };

    for (const type of plan.approvalsRequired) {
      const approverId = approverByType[type] ?? `${type}-approver`;
      const sod = validateSod([...store.sodRules.values()], "Change", parsed.requesterId, approverId);
      if (!sod.ok) {
        res.status(409).json({ error: sod.reason ?? "Separation-of-duties validation failed" });
        return;
      }
    }

    const createdObjectIds: string[] = [];
    let device: GraphObject | undefined = parsed.deviceId ? store.objects.get(parsed.deviceId) : undefined;
    if (parsed.deviceId && (!device || device.type !== "Device")) {
      res.status(404).json({ error: "Device not found for lifecycle execution" });
      return;
    }

    if (!device) {
      device = {
        id: store.createId(),
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Device",
        fields: {
          asset_tag: `DL-${store.createId().slice(0, 8).toUpperCase()}`,
          model: parsed.model ?? "Standard laptop",
          vendor: parsed.vendor ?? "Preferred Vendor",
          location: parsed.location ?? "Unassigned",
          stockroom: parsed.stockroom ?? "Primary Stockroom",
          lifecycle_stage: "request",
          procurement_state: "requested",
          status: "Requested"
        },
        provenance: {},
        quality: {
          freshness: 1,
          completeness: 0.7,
          consistency: 0.9,
          coverage: 0.65
        },
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.objects.set(device.id, device);
      createdObjectIds.push(device.id);
      store.pushTimeline({
        tenantId: device.tenantId,
        workspaceId: device.workspaceId,
        entityType: "object",
        entityId: device.id,
        eventType: "object.created",
        actor: actor.id,
        createdAt: nowIso(),
        payload: { source: "device-lifecycle.execute" }
      });
    }

    const nextFields = { ...device.fields };
    if (parsed.location) {
      nextFields.location = parsed.location;
    }
    if (parsed.stockroom) {
      nextFields.stockroom = parsed.stockroom;
    }
    if (parsed.model) {
      nextFields.model = parsed.model;
    }
    if (parsed.vendor) {
      nextFields.vendor = parsed.vendor;
    }

    switch (parsed.targetStage) {
      case "request":
        nextFields.lifecycle_stage = "request";
        nextFields.procurement_state = "requested";
        nextFields.status = "Requested";
        nextFields.requested_at = nowIso();
        break;
      case "fulfill":
        nextFields.lifecycle_stage = "fulfill";
        nextFields.procurement_state = "received";
        nextFields.enrollment_status = "enrolled";
        nextFields.status = "In stock";
        nextFields.received_at = nowIso();
        break;
      case "deploy":
        nextFields.lifecycle_stage = "deploy";
        nextFields.assigned_to_person_id = parsed.assigneePersonId ?? nextFields.assigned_to_person_id;
        nextFields.assigned_date = nowIso();
        nextFields.enrollment_status = "active";
        nextFields.status = "Active";
        nextFields.deployment_mode = parsed.remoteReturn ? "remote-shipment" : "office-handoff";
        break;
      case "monitor":
        nextFields.lifecycle_stage = "monitor";
        nextFields.status = "Active";
        nextFields.compliance_state = nextFields.compliance_state ?? "compliant";
        nextFields.patch_state = nextFields.patch_state ?? "up-to-date";
        nextFields.last_checkin = nowIso();
        break;
      case "service":
        nextFields.lifecycle_stage = "service";
        nextFields.status = "Under repair";
        nextFields.service_issue = parsed.issueSummary ?? "General repair request";
        nextFields.service_requested_at = nowIso();
        break;
      case "return":
        nextFields.lifecycle_stage = "return";
        nextFields.status = "Return required";
        nextFields.return_required = true;
        nextFields.return_mode = parsed.remoteReturn ? "return-kit" : "office-return";
        nextFields.return_due_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case "retire":
        nextFields.lifecycle_stage = "retire";
        nextFields.status = "Disposed";
        nextFields.retirement_reason = parsed.retirementReason ?? "Lifecycle complete";
        nextFields.wipe_verified_at = nowIso();
        nextFields.disposed_at = nowIso();
        break;
      default:
        break;
    }

    device.fields = nextFields;
    device.updatedAt = nowIso();
    store.objects.set(device.id, device);

    const workItemType: WorkItem["type"] =
      parsed.targetStage === "service" ? "Incident" : parsed.targetStage === "request" ? "Request" : "Change";

    const workItem: WorkItem = {
      id: store.createId(),
      tenantId: device.tenantId,
      workspaceId: device.workspaceId,
      type: workItemType,
      status: "Submitted",
      priority: plan.riskLevel === "high" ? "P1" : plan.riskLevel === "medium" ? "P2" : "P3",
      title: `Device lifecycle ${parsed.targetStage}: ${String(device.fields.asset_tag ?? device.id)}`,
      description: parsed.reason,
      requesterId: parsed.requesterId,
      assignmentGroup: "Endpoint Operations",
      linkedObjectIds: [device.id],
      tags: ["device-lifecycle", parsed.targetStage],
      comments: [
        {
          id: store.createId(),
          authorId: actor.id,
          body: `Lifecycle transition ${plan.currentStage} -> ${parsed.targetStage}`,
          mentions: [],
          createdAt: nowIso()
        }
      ],
      attachments: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.workItems.set(workItem.id, workItem);

    const createdApprovalIds = plan.approvalsRequired.map((type) => {
      const approval = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        workItemId: workItem.id,
        type,
        approverId: approverByType[type] ?? `${type}-approver`,
        decision: "pending" as const,
        createdAt: nowIso()
      };
      store.approvals.set(approval.id, approval);
      return approval.id;
    });

    const assignmentGroupByStepId = (stepId: string): string => {
      if (stepId.includes("repair") || stepId.includes("triage")) {
        return "Endpoint Service";
      }
      if (stepId.includes("wipe") || stepId.includes("disposal")) {
        return "Security Operations";
      }
      if (stepId.includes("kit") || stepId.includes("condition")) {
        return "Endpoint Logistics";
      }
      return "Endpoint Operations";
    };

    const createdTaskIds: string[] = [];
    for (const step of plan.steps) {
      const task: WorkItem = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        type: "Task",
        status: "Submitted",
        priority: step.riskLevel === "high" ? "P1" : step.riskLevel === "medium" ? "P2" : "P3",
        title: `Device lifecycle task: ${step.name}`,
        description: `Execute lifecycle step ${step.id}.`,
        requesterId: parsed.requesterId,
        assignmentGroup: assignmentGroupByStepId(step.id),
        linkedObjectIds: [device.id, workItem.id],
        tags: ["device-lifecycle", "task", step.id],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.workItems.set(task.id, task);
      createdTaskIds.push(task.id);
    }

    const run: DeviceLifecycleRun = {
      id: store.createId(),
      mode: "live",
      status: "executed",
      deviceId: device.id,
      requesterId: parsed.requesterId,
      plan: {
        ...plan,
        deviceId: device.id
      },
      linkedWorkItemId: workItem.id,
      createdTaskIds,
      createdApprovalIds,
      createdObjectIds,
      createdAt: nowIso()
    };
    store.deviceLifecycleRuns.set(run.id, run);

    store.pushTimeline({
      tenantId: device.tenantId,
      workspaceId: device.workspaceId,
      entityType: "workflow",
      entityId: run.id,
      eventType: "device.lifecycle.executed",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        deviceId: device.id,
        workItemId: workItem.id,
        currentStage: plan.currentStage,
        targetStage: parsed.targetStage,
        riskLevel: plan.riskLevel,
        approvals: createdApprovalIds.length,
        tasks: createdTaskIds.length
      }
    });

    res.status(201).json({
      data: {
        run,
        device,
        workItem,
        approvalIds: createdApprovalIds,
        taskIds: createdTaskIds,
        createdObjectIds
      }
    });
  });

  router.get("/jml/joiner/runs", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const personId = req.query.personId ? String(req.query.personId) : undefined;
    const email = req.query.email ? String(req.query.email).toLowerCase() : undefined;
    const data = [...store.jmlJoinerRuns.values()]
      .filter((run) => {
        if (personId && run.personId !== personId) {
          return false;
        }
        if (email && String(run.plan.email).toLowerCase() !== email) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    res.json({ data });
  });

  router.post("/jml/joiner/preview", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = jmlJoinerPreviewSchema.parse(req.body);
    const plan = buildJmlJoinerPlan(parsed);
    if (!plan) {
      res.status(404).json({ error: "Person not found for joiner plan" });
      return;
    }
    const run: JmlJoinerRun = {
      id: store.createId(),
      mode: "preview",
      status: "planned",
      personId: plan.personId,
      requesterId: parsed.requesterId,
      plan,
      createdTaskIds: [],
      createdApprovalIds: [],
      createdObjectIds: [],
      createdAt: nowIso()
    };
    store.jmlJoinerRuns.set(run.id, run);
    res.status(201).json({ data: run });
  });

  router.post("/jml/joiner/execute", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = jmlJoinerExecuteSchema.parse(req.body);
    const plan = buildJmlJoinerPlan(parsed);
    if (!plan) {
      res.status(404).json({ error: "Person not found for joiner execution" });
      return;
    }

    const approverByType: Record<string, string> = {
      manager: plan.managerId ?? "manager-approver",
      "app-owner": "app-owner-approver",
      security: "security-approver",
      finance: "finance-approver",
      it: "it-approver",
      custom: "custom-approver"
    };

    for (const type of plan.approvalsRequired) {
      const approverId = approverByType[type] ?? `${type}-approver`;
      const sod = validateSod([...store.sodRules.values()], "Request", parsed.requesterId, approverId);
      if (!sod.ok) {
        res.status(409).json({ error: sod.reason ?? "Separation-of-duties validation failed" });
        return;
      }
    }

    const startDateParsed = parseIsoDate(plan.startDate);
    const startActive = startDateParsed ? startDateParsed.getTime() <= Date.now() : true;

    let person: GraphObject;
    if (plan.personId) {
      const existing = store.objects.get(plan.personId);
      if (!existing || existing.type !== "Person") {
        res.status(404).json({ error: "Person not found for joiner execution" });
        return;
      }
      existing.fields = {
        ...existing.fields,
        legal_name: plan.legalName,
        email: plan.email,
        role_profile: plan.role,
        job_title: plan.role,
        department: existing.fields.department ?? "Engineering",
        location: plan.location,
        manager: plan.managerId,
        employment_type: plan.employmentType,
        status: startActive ? "active" : "pre-hire",
        start_date: plan.startDate
      };
      existing.updatedAt = nowIso();
      store.objects.set(existing.id, existing);
      person = existing;
    } else {
      person = {
        id: store.createId(),
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Person",
        fields: {
          legal_name: plan.legalName,
          email: plan.email,
          role_profile: plan.role,
          job_title: plan.role,
          department: "Engineering",
          location: plan.location,
          manager: plan.managerId,
          employment_type: plan.employmentType,
          status: startActive ? "active" : "pre-hire",
          start_date: plan.startDate
        },
        provenance: {},
        quality: {
          freshness: 1,
          completeness: 0.8,
          consistency: 0.9,
          coverage: 0.7
        },
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.objects.set(person.id, person);
      store.pushTimeline({
        tenantId: person.tenantId,
        workspaceId: person.workspaceId,
        entityType: "object",
        entityId: person.id,
        eventType: "object.created",
        actor: actor.id,
        createdAt: nowIso(),
        payload: { source: "jml.joiner.execute" }
      });
    }

    const workItem: WorkItem = {
      id: store.createId(),
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      type: "Request",
      status: "Submitted",
      priority: plan.riskLevel === "high" ? "P1" : plan.riskLevel === "medium" ? "P2" : "P3",
      title: `JML joiner request: ${plan.legalName}`,
      description: parsed.reason,
      requesterId: parsed.requesterId,
      assignmentGroup: "Onboarding Operations",
      linkedObjectIds: [person.id],
      tags: ["jml", "joiner", "onboarding", plan.deviceTypePreference],
      comments: [
        {
          id: store.createId(),
          authorId: actor.id,
          body: `Joiner execution requested for ${plan.legalName} (${plan.role}) starting ${plan.startDate}.`,
          mentions: [],
          createdAt: nowIso()
        }
      ],
      attachments: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.workItems.set(workItem.id, workItem);

    const createdApprovalIds = plan.approvalsRequired.map((type) => {
      const approval = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        workItemId: workItem.id,
        type,
        approverId: approverByType[type] ?? `${type}-approver`,
        decision: "pending" as const,
        createdAt: nowIso()
      };
      store.approvals.set(approval.id, approval);
      return approval.id;
    });

    const createdObjectIds: string[] = [];
    if (!plan.personId) {
      createdObjectIds.push(person.id);
    }

    const identity: GraphObject = {
      id: store.createId(),
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      type: "Identity",
      fields: {
        provider: "PrimaryIdP",
        username: plan.email,
        email: plan.email,
        status: startActive ? "active" : "suspended",
        mfa_enabled: false,
        created_at: nowIso()
      },
      provenance: {},
      quality: {
        freshness: 1,
        completeness: 0.75,
        consistency: 0.9,
        coverage: 0.7
      },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.objects.set(identity.id, identity);
    createdObjectIds.push(identity.id);

    const identityRelationship: GraphRelationship = {
      id: store.createId(),
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      type: "has_identity",
      fromObjectId: person.id,
      toObjectId: identity.id,
      createdAt: nowIso(),
      createdBy: actor.id
    };
    store.relationships.set(identityRelationship.id, identityRelationship);

    const appsToProvision = [...new Set([...plan.baselineApps, ...plan.requestedApps])];
    for (const appName of appsToProvision) {
      const account: GraphObject = {
        id: store.createId(),
        tenantId: person.tenantId,
        workspaceId: person.workspaceId,
        type: "SaaSAccount",
        fields: {
          app: appName,
          person: person.id,
          status: "provisioning",
          created_at: nowIso()
        },
        provenance: {},
        quality: {
          freshness: 0.9,
          completeness: 0.7,
          consistency: 0.9,
          coverage: 0.7
        },
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.objects.set(account.id, account);
      createdObjectIds.push(account.id);

      const relationship: GraphRelationship = {
        id: store.createId(),
        tenantId: person.tenantId,
        workspaceId: person.workspaceId,
        type: "has_account",
        fromObjectId: person.id,
        toObjectId: account.id,
        createdAt: nowIso(),
        createdBy: actor.id
      };
      store.relationships.set(relationship.id, relationship);
    }

    const device: GraphObject = {
      id: store.createId(),
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      type: "Device",
      fields: {
        asset_tag: `NEW-${Math.floor(Math.random() * 100000)}`,
        device_type: plan.deviceTypePreference,
        enrollment_status: "pending",
        compliance_state: "pending",
        assigned_date: plan.startDate,
        location: plan.location,
        shipping_state: plan.remote ? "pending-shipment" : "pickup-scheduled",
        assigned_to_person_id: person.id
      },
      provenance: {},
      quality: {
        freshness: 0.9,
        completeness: 0.75,
        consistency: 0.92,
        coverage: 0.72
      },
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.objects.set(device.id, device);
    createdObjectIds.push(device.id);

    const assignmentRelationship: GraphRelationship = {
      id: store.createId(),
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      type: "assigned_to",
      fromObjectId: device.id,
      toObjectId: person.id,
      createdAt: nowIso(),
      createdBy: actor.id
    };
    store.relationships.set(assignmentRelationship.id, assignmentRelationship);

    const assignmentGroupByStepId: Record<string, string> = {
      "identity-prestage-step": "Identity Operations",
      "group-baseline-step": "Identity Operations",
      "app-provision-step": "Access Operations",
      "device-fulfillment-step": "Endpoint Operations",
      "compliance-welcome-step": "Onboarding Operations",
      "security-attestation-step": "Security Operations"
    };

    const createdTaskIds: string[] = [];
    for (const step of plan.steps) {
      const task: WorkItem = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        type: "Task",
        status: "Submitted",
        priority: step.riskLevel === "high" ? "P1" : step.riskLevel === "medium" ? "P2" : "P3",
        title: `Joiner task: ${step.name}`,
        description: `Execute joiner step ${step.id}.`,
        requesterId: parsed.requesterId,
        assignmentGroup: assignmentGroupByStepId[step.id] ?? "Onboarding Operations",
        linkedObjectIds: [person.id, workItem.id, device.id],
        tags: ["jml", "joiner", "task", step.id],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.workItems.set(task.id, task);
      createdTaskIds.push(task.id);
    }

    const run: JmlJoinerRun = {
      id: store.createId(),
      mode: "live",
      status: "executed",
      personId: person.id,
      requesterId: parsed.requesterId,
      plan: {
        ...plan,
        personId: person.id
      },
      linkedWorkItemId: workItem.id,
      createdTaskIds,
      createdApprovalIds,
      createdObjectIds,
      createdAt: nowIso()
    };
    store.jmlJoinerRuns.set(run.id, run);

    store.pushTimeline({
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      entityType: "workflow",
      entityId: run.id,
      eventType: "jml.joiner.executed",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        personId: person.id,
        workItemId: workItem.id,
        riskLevel: plan.riskLevel,
        approvals: createdApprovalIds.length,
        tasks: createdTaskIds.length,
        objects: createdObjectIds.length
      }
    });

    res.status(201).json({
      data: {
        run,
        workItem,
        approvalIds: createdApprovalIds,
        taskIds: createdTaskIds,
        createdObjectIds
      }
    });
  });

  router.get("/jml/mover/runs", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const personId = req.query.personId ? String(req.query.personId) : undefined;
    const data = [...store.jmlMoverRuns.values()]
      .filter((run) => (personId ? run.personId === personId : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    res.json({ data });
  });

  router.post("/jml/mover/preview", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = jmlMoverPreviewSchema.parse(req.body);
    const plan = buildJmlMoverPlan(parsed);
    if (!plan) {
      res.status(404).json({ error: "Person not found for mover plan" });
      return;
    }
    const run: JmlMoverRun = {
      id: store.createId(),
      mode: "preview",
      status: "planned",
      personId: plan.personId,
      requesterId: parsed.requesterId,
      plan,
      createdTaskIds: [],
      createdApprovalIds: [],
      createdAt: nowIso()
    };
    store.jmlMoverRuns.set(run.id, run);
    res.status(201).json({ data: run });
  });

  router.post("/jml/mover/execute", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = jmlMoverExecuteSchema.parse(req.body);
    const plan = buildJmlMoverPlan(parsed);
    if (!plan) {
      res.status(404).json({ error: "Person not found for mover execution" });
      return;
    }

    for (const type of plan.approvalsRequired) {
      const approverId = `${type}-approver`;
      const sod = validateSod([...store.sodRules.values()], "Change", parsed.requesterId, approverId);
      if (!sod.ok) {
        res.status(409).json({ error: sod.reason ?? "Separation-of-duties validation failed" });
        return;
      }
    }

    const person = store.objects.get(plan.personId);
    if (!person || person.type !== "Person") {
      res.status(404).json({ error: "Person not found for mover execution" });
      return;
    }

    const workItem: WorkItem = {
      id: store.createId(),
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      type: "Change",
      status: "Submitted",
      priority: plan.riskLevel === "high" ? "P1" : plan.riskLevel === "medium" ? "P2" : "P3",
      title: `JML mover change: ${String(person.fields.legal_name ?? person.id)}`,
      description: parsed.reason,
      requesterId: parsed.requesterId,
      assignmentGroup: "Identity Operations",
      linkedObjectIds: [person.id],
      tags: ["jml", "mover", "entitlements"],
      comments: [
        {
          id: store.createId(),
          authorId: actor.id,
          body: `Mover execution requested: role ${plan.currentRole} -> ${plan.targetRole}`,
          mentions: [],
          createdAt: nowIso()
        }
      ],
      attachments: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.workItems.set(workItem.id, workItem);

    const createdApprovalIds = plan.approvalsRequired.map((type) => {
      const approval = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        workItemId: workItem.id,
        type,
        approverId: `${type}-approver`,
        decision: "pending" as const,
        createdAt: nowIso()
      };
      store.approvals.set(approval.id, approval);
      return approval.id;
    });

    const createdTaskIds: string[] = [];
    const taskActions = [
      ...plan.addGroups.map((value) => ({ kind: "add-group", value })),
      ...plan.removeGroups.map((value) => ({ kind: "remove-group", value })),
      ...plan.addApps.map((value) => ({ kind: "add-app", value })),
      ...plan.removeApps.map((value) => ({ kind: "remove-app", value }))
    ];
    for (const action of taskActions) {
      const task: WorkItem = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        type: "Task",
        status: "Submitted",
        priority: "P3",
        title: `Mover ${action.kind}: ${action.value}`,
        description: `Apply mover entitlement action ${action.kind} for ${action.value}.`,
        requesterId: parsed.requesterId,
        assignmentGroup: "Identity Operations",
        linkedObjectIds: [person.id, workItem.id],
        tags: ["jml", "mover", "task"],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.workItems.set(task.id, task);
      createdTaskIds.push(task.id);
    }

    const currentGroups = parseStringArrayField(person.fields.current_groups);
    const currentApps = parseStringArrayField(person.fields.current_apps);
    const nextGroups = [...new Set([...currentGroups, ...plan.addGroups])].filter(
      (group) => !plan.removeGroups.includes(group)
    );
    const nextApps = [...new Set([...currentApps, ...plan.addApps])].filter((app) => !plan.removeApps.includes(app));

    person.fields = {
      ...person.fields,
      role_profile: plan.targetRole,
      job_title: plan.targetRole,
      department: plan.targetDepartment ?? person.fields.department,
      location: plan.targetLocation ?? person.fields.location,
      current_groups: nextGroups,
      current_apps: nextApps
    };
    person.updatedAt = nowIso();
    store.objects.set(person.id, person);

    const run: JmlMoverRun = {
      id: store.createId(),
      mode: "live",
      status: "executed",
      personId: person.id,
      requesterId: parsed.requesterId,
      plan,
      linkedWorkItemId: workItem.id,
      createdTaskIds,
      createdApprovalIds,
      createdAt: nowIso()
    };
    store.jmlMoverRuns.set(run.id, run);

    store.pushTimeline({
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      entityType: "workflow",
      entityId: run.id,
      eventType: "jml.mover.executed",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        personId: person.id,
        workItemId: workItem.id,
        riskLevel: plan.riskLevel,
        approvals: createdApprovalIds.length,
        tasks: createdTaskIds.length
      }
    });

    res.status(201).json({
      data: {
        run,
        workItem,
        approvalIds: createdApprovalIds,
        taskIds: createdTaskIds
      }
    });
  });

  router.get("/jml/leaver/runs", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const personId = req.query.personId ? String(req.query.personId) : undefined;
    const data = [...store.jmlLeaverRuns.values()]
      .filter((run) => (personId ? run.personId === personId : true))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    res.json({ data });
  });

  router.post("/jml/leaver/preview", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = jmlLeaverPreviewSchema.parse(req.body);
    const plan = buildJmlLeaverPlan(parsed);
    if (!plan) {
      res.status(404).json({ error: "Person not found for leaver plan" });
      return;
    }

    const run: JmlLeaverRun = {
      id: store.createId(),
      mode: "preview",
      status: "planned",
      personId: plan.personId,
      requesterId: parsed.requesterId,
      plan,
      createdTaskIds: [],
      createdApprovalIds: [],
      createdAt: nowIso()
    };
    store.jmlLeaverRuns.set(run.id, run);
    res.status(201).json({ data: run });
  });

  router.post("/jml/leaver/execute", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "workflow:run"));
    const parsed = jmlLeaverExecuteSchema.parse(req.body);
    const plan = buildJmlLeaverPlan(parsed);
    if (!plan) {
      res.status(404).json({ error: "Person not found for leaver execution" });
      return;
    }

    const person = store.objects.get(plan.personId);
    if (!person || person.type !== "Person") {
      res.status(404).json({ error: "Person not found for leaver execution" });
      return;
    }

    const managerApproverId =
      typeof person.fields.manager === "string" && person.fields.manager.trim().length > 0
        ? person.fields.manager
        : "manager-approver";
    const approverByType: Record<string, string> = {
      manager: managerApproverId,
      "app-owner": "app-owner-approver",
      security: "security-approver",
      finance: "finance-approver",
      it: "it-approver",
      custom: "legal-approver"
    };

    for (const type of plan.approvalsRequired) {
      const approverId = approverByType[type] ?? `${type}-approver`;
      const sod = validateSod([...store.sodRules.values()], "Change", parsed.requesterId, approverId);
      if (!sod.ok) {
        res.status(409).json({ error: sod.reason ?? "Separation-of-duties validation failed" });
        return;
      }
    }

    const workItem: WorkItem = {
      id: store.createId(),
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      type: "Change",
      status: "Submitted",
      priority: plan.riskLevel === "high" ? "P1" : "P2",
      title: `JML leaver change: ${plan.personName}`,
      description: parsed.reason,
      requesterId: parsed.requesterId,
      assignmentGroup: "Offboarding Operations",
      linkedObjectIds: [person.id],
      tags: [
        "jml",
        "leaver",
        "offboarding",
        parsed.legalHold ? "legal-hold" : "standard",
        parsed.vip ? "vip" : "non-vip"
      ],
      comments: [
        {
          id: store.createId(),
          authorId: actor.id,
          body: `Leaver execution requested for ${plan.personName} effective ${plan.effectiveDate}.`,
          mentions: [],
          createdAt: nowIso()
        }
      ],
      attachments: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    store.workItems.set(workItem.id, workItem);

    const createdApprovalIds = plan.approvalsRequired.map((type) => {
      const approval = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        workItemId: workItem.id,
        type,
        approverId: approverByType[type] ?? `${type}-approver`,
        decision: "pending" as const,
        createdAt: nowIso()
      };
      store.approvals.set(approval.id, approval);
      return approval.id;
    });

    const refs = personReferenceSet(person);
    const relationshipDeviceIds = new Set(
      [...store.relationships.values()]
        .filter((relationship) => relationship.type === "assigned_to" && relationship.toObjectId === person.id)
        .map((relationship) => relationship.fromObjectId)
    );

    const identityTargets = [...store.objects.values()].filter((object) => {
      if (object.type !== "Identity") {
        return false;
      }
      return (
        matchesPersonRef(object.fields.person_id, refs) ||
        matchesPersonRef(object.fields.person, refs) ||
        matchesPersonRef(object.fields.personId, refs) ||
        matchesPersonRef(object.fields.email, refs) ||
        matchesPersonRef(object.fields.username, refs)
      );
    });
    const saasTargets = [...store.objects.values()].filter((object) => {
      if (object.type !== "SaaSAccount") {
        return false;
      }
      return (
        matchesPersonRef(object.fields.person_id, refs) ||
        matchesPersonRef(object.fields.person, refs) ||
        matchesPersonRef(object.fields.email, refs)
      );
    });
    const deviceTargets = [...store.objects.values()].filter((object) => {
      if (object.type !== "Device") {
        return false;
      }
      return (
        relationshipDeviceIds.has(object.id) ||
        matchesPersonRef(object.fields.assigned_to_person_id, refs) ||
        matchesPersonRef(object.fields.assigned_to, refs) ||
        matchesPersonRef(object.fields.checked_out_by, refs)
      );
    });
    const ownedTargets = [...store.objects.values()].filter((object) => {
      if (object.id === person.id) {
        return false;
      }
      return (
        matchesPersonRef(object.fields.owner, refs) ||
        matchesPersonRef(object.fields.owned_by, refs) ||
        matchesPersonRef(object.fields.owner_email, refs)
      );
    });

    const reclaimSeatForApp = (appName: string) => {
      const app = appName.trim().toLowerCase();
      if (!app) {
        return;
      }
      const matchingLicenses = [...store.objects.values()].filter((object) => {
        if (object.type !== "License") {
          return false;
        }
        const licenseApp = String(object.fields.app ?? object.fields.vendor ?? "").trim().toLowerCase();
        return licenseApp === app;
      });
      if (matchingLicenses.length === 0) {
        return;
      }

      for (const license of matchingLicenses) {
        const assignedSeats = Number(license.fields.assigned_seats ?? 0);
        const availableSeats = Number(license.fields.available_seats ?? 0);
        license.fields = {
          ...license.fields,
          assigned_seats: Number.isFinite(assignedSeats) ? Math.max(0, assignedSeats - 1) : 0,
          available_seats: Number.isFinite(availableSeats) ? availableSeats + 1 : 1
        };
        license.updatedAt = nowIso();
        store.objects.set(license.id, license);
      }
    };

    for (const identity of identityTargets) {
      identity.fields = {
        ...identity.fields,
        status: parsed.contractorConversion ? "active" : "suspended",
        deprovisioned_at: parsed.contractorConversion ? undefined : plan.effectiveDate,
        legal_hold: parsed.legalHold || undefined,
        conversion_mode: parsed.contractorConversion || undefined
      };
      identity.updatedAt = nowIso();
      store.objects.set(identity.id, identity);
    }

    for (const account of saasTargets) {
      const appName = String(account.fields.app ?? "");
      account.fields = {
        ...account.fields,
        status: parsed.contractorConversion ? "conversion-review" : parsed.legalHold ? "suspended" : "deprovisioned",
        deprovisioned_at: parsed.contractorConversion ? undefined : plan.effectiveDate,
        legal_hold: parsed.legalHold || undefined
      };
      account.updatedAt = nowIso();
      store.objects.set(account.id, account);
      if (!parsed.contractorConversion && !parsed.legalHold) {
        reclaimSeatForApp(appName);
      }
    }

    for (const object of ownedTargets) {
      object.fields = {
        ...object.fields,
        owner: managerApproverId,
        transferred_from: person.id,
        transfer_reason: "jml-leaver"
      };
      object.updatedAt = nowIso();
      store.objects.set(object.id, object);
    }

    for (const device of deviceTargets) {
      device.fields = {
        ...device.fields,
        custody_status: parsed.deviceRecoveryState === "recovered" ? "recovered" : "return_required",
        offboarding_return_due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        lost_stolen_state: parsed.deviceRecoveryState === "not-recovered" ? "lost" : device.fields.lost_stolen_state,
        containment_action:
          parsed.deviceRecoveryState === "not-recovered" ? "pending-approval" : device.fields.containment_action
      };
      device.updatedAt = nowIso();
      store.objects.set(device.id, device);
    }

    const assignmentGroupByStepId: Record<string, string> = {
      "identity-access-step": "Identity Operations",
      "saas-reclaim-step": "Access Operations",
      "ownership-transfer-step": "Platform Operations",
      "asset-recovery-step": "Endpoint Operations",
      "asset-containment-step": "Security Operations",
      "regional-compliance-step": "IT Compliance",
      "evidence-closeout-step": "IT Audit"
    };

    const createdTaskIds: string[] = [];
    for (const step of plan.steps) {
      const task: WorkItem = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        type: "Task",
        status: "Submitted",
        priority: step.riskLevel === "high" ? "P1" : step.riskLevel === "medium" ? "P2" : "P3",
        title: `Leaver task: ${step.name}`,
        description: `Execute leaver step ${step.id}.`,
        requesterId: parsed.requesterId,
        assignmentGroup: assignmentGroupByStepId[step.id] ?? "Offboarding Operations",
        linkedObjectIds: [person.id, workItem.id, ...deviceTargets.map((device) => device.id)],
        tags: ["jml", "leaver", "task", step.id],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.workItems.set(task.id, task);
      createdTaskIds.push(task.id);
    }

    let followUpIncidentId: string | undefined;
    if (parsed.deviceRecoveryState === "not-recovered") {
      const incident: WorkItem = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        type: "Incident",
        status: "Submitted",
        priority: "P1",
        title: `Unrecovered offboarding asset: ${plan.personName}`,
        description: "Leaver assets were not recovered at termination and require containment workflow.",
        requesterId: parsed.requesterId,
        assignmentGroup: "Security Operations",
        linkedObjectIds: [person.id, workItem.id, ...deviceTargets.map((device) => device.id)],
        tags: ["jml", "leaver", "asset-recovery", "security"],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.workItems.set(incident.id, incident);
      followUpIncidentId = incident.id;
    }

    person.fields = {
      ...person.fields,
      status: parsed.contractorConversion ? "leave" : "terminated",
      end_date: plan.effectiveDate,
      employment_type: parsed.contractorConversion ? "contractor" : person.fields.employment_type,
      legal_hold: parsed.legalHold || undefined,
      vip: parsed.vip || undefined,
      offboarding_region: plan.region,
      conversion_mode: parsed.contractorConversion || undefined
    };
    person.updatedAt = nowIso();
    store.objects.set(person.id, person);

    const run: JmlLeaverRun = {
      id: store.createId(),
      mode: "live",
      status: "executed",
      personId: person.id,
      requesterId: parsed.requesterId,
      plan,
      linkedWorkItemId: workItem.id,
      createdTaskIds,
      createdApprovalIds,
      createdAt: nowIso()
    };
    store.jmlLeaverRuns.set(run.id, run);

    store.pushTimeline({
      tenantId: person.tenantId,
      workspaceId: person.workspaceId,
      entityType: "workflow",
      entityId: run.id,
      eventType: "jml.leaver.executed",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {
        personId: person.id,
        workItemId: workItem.id,
        riskLevel: plan.riskLevel,
        approvals: createdApprovalIds.length,
        tasks: createdTaskIds.length,
        legalHold: parsed.legalHold,
        vip: parsed.vip,
        deviceRecoveryState: parsed.deviceRecoveryState
      }
    });

    res.status(201).json({
      data: {
        run,
        workItem,
        approvalIds: createdApprovalIds,
        taskIds: createdTaskIds,
        updatedObjects: {
          identities: identityTargets.length,
          saasAccounts: saasTargets.length,
          devices: deviceTargets.length,
          ownershipTransfers: ownedTargets.length
        },
        followUpIncidentId
      }
    });
  });

  router.get("/playbooks", (_req, res) => {
    res.json({
      data: {
        workflows: [...store.workflowDefinitions.values()].map((d) => ({
          id: d.id,
          playbook: d.playbook,
          name: d.name,
          version: d.version,
          active: d.active
        }))
      }
    });
  });

  router.get("/evidence/:workItemId", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "audit:export") || can(actor.role, "workflow:run"));
    if (!store.workItems.has(req.params.workItemId)) {
      res.status(404).json({ error: "Work item not found" });
      return;
    }

    const evidence = buildEvidencePackage(store, req.params.workItemId);
    res.json({ data: evidence });
  });

  router.post("/ai/query", (req, res) => {
    const parsed = aiPromptSchema.parse(req.body);
    const prompt = parsed.prompt.toLowerCase();

    const matchedObjects = [...store.objects.values()].filter((object) => {
      const stringified = JSON.stringify(object.fields).toLowerCase();
      return stringified.includes(prompt);
    });

    res.json({
      data: {
        answer: `Found ${matchedObjects.length} matching objects for query`,
        confidence: matchedObjects.length > 0 ? 0.78 : 0.42,
        executedFilter: { containsText: prompt },
        objects: matchedObjects.map((object) => ({ id: object.id, type: object.type }))
      }
    });
  });

  router.post("/ai/plan-preview", (req, res) => {
    const objective = String(req.body.objective ?? "");
    const candidate = [...store.workflowDefinitions.values()].find((definition) =>
      objective.toLowerCase().includes(definition.playbook.toLowerCase()) ||
      objective.toLowerCase().includes(definition.name.toLowerCase())
    );

    if (!candidate) {
      res.json({
        data: {
          objective,
          plan: [],
          confidence: 0.35,
          note: "No matching workflow. Refine objective or create a workflow definition."
        }
      });
      return;
    }

    res.json({
      data: {
        objective,
        confidence: 0.82,
        workflowDefinitionId: candidate.id,
        affectedSystems: [...new Set(candidate.steps.map((step) => String(step.config.targetSystem ?? "internal")))],
        plan: candidate.steps.map((step, index) => ({
          order: index + 1,
          stepId: step.id,
          name: step.name,
          type: step.type,
          riskLevel: step.riskLevel,
          requiresApproval: step.type === "approval" || step.riskLevel === "high"
        })),
        executionOptions: ["dry-run", "live", "edit-plan", "send-for-approval"]
      }
    });
  });

  router.post("/ai/request-draft", (req, res) => {
    const parsed = aiPromptSchema.parse(req.body);
    const prompt = parsed.prompt;
    const lowerPrompt = prompt.toLowerCase();
    const type = lowerPrompt.includes("access")
      ? "Request"
      : lowerPrompt.includes("lost") || lowerPrompt.includes("stolen")
        ? "Incident"
        : "Request";

    const approvals = [
      "manager",
      ...(lowerPrompt.includes("admin") ? ["security"] : []),
      ...(lowerPrompt.includes("purchase") ? ["finance"] : [])
    ];

    res.json({
      data: {
        prompt,
        draft: {
          type,
          title: prompt.slice(0, 100) || "Draft request",
          requesterId: String(req.body.requesterId ?? "person-1"),
          workflowHint: type === "Incident" ? "wf-device-return-v1" : "wf-saas-access-v1"
        },
        approvals,
        requiresConfirmation: true
      }
    });
  });

  router.post("/ai/reconciliation-suggestions", (_req, res) => {
    const suggestions = [...store.objects.values()]
      .filter((object) => object.type === "Device")
      .map((object) => ({
        objectId: object.id,
        reason: "Possible duplicate by serial/asset tag match from MDM and EDR",
        confidence: 0.82
      }))
      .slice(0, 10);

    res.json({ data: { suggestions } });
  });

  router.post("/ai/policy-draft", (req, res) => {
    const parsed = aiPromptSchema.parse(req.body);
    const prompt = parsed.prompt.toLowerCase();
    const highRisk = prompt.includes("quarantine") || prompt.includes("disable");

    res.json({
      data: {
        prompt: parsed.prompt,
        draftPolicy: {
          name: "AI Drafted Policy",
          objectType: prompt.includes("device") ? "Device" : "Identity",
          expression: {
            field: prompt.includes("encryption") ? "encryption_state" : "mfa_enabled",
            operator: "equals",
            value: prompt.includes("encryption") ? "enabled" : true
          },
          remediation: {
            notify: true,
            createTask: true,
            escalationDays: 7,
            quarantine: highRisk
          },
          reviewRequired: true
        }
      }
    });
  });

  router.post("/ai/workflow-draft", (req, res) => {
    const parsed = aiPromptSchema.parse(req.body);
    const lower = parsed.prompt.toLowerCase();

    res.json({
      data: {
        prompt: parsed.prompt,
        workflow: {
          name: lower.includes("onboard") ? "Onboarding Draft Workflow" : "Automation Draft Workflow",
          trigger: lower.includes("termination") ? "hris.termination" : "manual.request",
          steps: [
            { name: "Collect inputs", type: "human-task", riskLevel: "low" },
            { name: "Run baseline automation", type: "automation", riskLevel: "medium" },
            {
              name: lower.includes("admin") ? "Security approval" : "Manager approval",
              type: "approval",
              riskLevel: "medium"
            },
            { name: "Finalize and notify", type: "notification", riskLevel: "low" }
          ],
          requiresReview: true
        }
      }
    });
  });

  router.get("/ai/anomaly-insights", (_req, res) => {
    const staleConnectors = [...store.connectors.values()].filter((connector) => connector.status !== "Healthy");
    const openPolicyExceptions = [...store.policyExceptions.values()].filter((exception) => exception.status === "open");

    res.json({
      data: {
        insights: [
          {
            id: "insight-shadow-it",
            title: "Potential shadow IT growth",
            severity: "medium",
            summary: "Detected access requests for unsanctioned tools exceeding baseline trend."
          },
          {
            id: "insight-connectors",
            title: "Connector instability",
            severity: staleConnectors.length > 0 ? "high" : "low",
            summary: `${staleConnectors.length} connectors are degraded or failed.`
          },
          {
            id: "insight-policy-gaps",
            title: "Policy remediation backlog",
            severity: openPolicyExceptions.length > 10 ? "high" : "medium",
            summary: `${openPolicyExceptions.length} policy exceptions are unresolved.`
          }
        ]
      }
    });
  });

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }

    if (error instanceof Error && error.message.includes("Permission denied")) {
      res.status(403).json({ error: error.message });
      return;
    }

    if (error instanceof Error && error.message.includes("requires")) {
      res.status(400).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  };
  router.use(errorHandler);

  return router;
};
