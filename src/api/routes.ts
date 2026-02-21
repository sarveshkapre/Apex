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
  ExternalTicketComment,
  ExternalTicketLink,
  FieldRestriction,
  GraphObject,
  GraphRelationship,
  JmlMoverPlan,
  JmlMoverRun,
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
  configVersionCreateSchema,
  configVersionPublishSchema,
  connectorCreateSchema,
  connectorRunSchema,
  csvPreviewSchema,
  customSchemaCreateSchema,
  exceptionActionSchema,
  externalTicketCommentSchema,
  externalTicketLinkCreateSchema,
  fieldRestrictionCreateSchema,
  notificationRuleCreateSchema,
  objectCreateSchema,
  objectUpdateSchema,
  policyExceptionActionSchema,
  policyCreateSchema,
  jmlMoverPreviewSchema,
  jmlMoverExecuteSchema,
  reportDefinitionCreateSchema,
  reportDefinitionUpdateSchema,
  reportRunCreateSchema,
  relationshipCreateSchema,
  runWorkflowSchema,
  savedViewCreateSchema,
  contractRenewalOverviewSchema,
  contractRenewalRunSchema,
  signalIngestSchema,
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

    const approvalsRequired = approvalsForRequest(
      [...store.approvalMatrixRules.values()],
      "Change",
      riskLevel,
      undefined
    );

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

  router.post("/relationships", (req, res) => {
    const actor = getActor(req.headers);
    permission(can(actor.role, "object:update"));

    const parsed = relationshipCreateSchema.parse(req.body);
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

  router.get("/relationships", (_req, res) => {
    res.json({ data: [...store.relationships.values()] });
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

    const approvalTypes = approvalsForRequest(
      [...store.approvalMatrixRules.values()],
      "Request",
      item.riskLevel,
      parsed.estimatedCost
    );

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

    const createdApprovals = approvalTypes.map((type) => {
      const approverId = `${type}-approver`;
      const approval = {
        id: store.createId(),
        tenantId: workItem.tenantId,
        workspaceId: workItem.workspaceId,
        workItemId: workItem.id,
        type,
        approverId,
        decision: "pending" as const,
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
    const q = String(req.query.q ?? "").toLowerCase();
    const objects = [...store.objects.values()]
      .filter((object) => JSON.stringify(object).toLowerCase().includes(q))
      .map((object) => ({ id: object.id, type: object.type, title: String(object.fields.name ?? object.id) }));
    const workItems = [...store.workItems.values()]
      .filter((item) => JSON.stringify(item).toLowerCase().includes(q))
      .map((item) => ({ id: item.id, type: item.type, title: item.title }));
    const workflowsFound = [...store.workflowDefinitions.values()]
      .filter((workflow) => JSON.stringify(workflow).toLowerCase().includes(q))
      .map((workflow) => ({ id: workflow.id, type: "Workflow", title: workflow.name }));
    const kb = kbArticles
      .filter((article) => JSON.stringify(article).toLowerCase().includes(q))
      .map((article) => ({ id: article.id, type: "KB", title: article.title }));
    res.json({
      data: {
        query: q,
        results: [...objects, ...workItems, ...workflowsFound, ...kb]
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
    const data = [...store.approvals.values()].filter(
      (approval) =>
        approval.approverId === approverId && (decision ? approval.decision === decision : true)
    );
    res.json({ data });
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
