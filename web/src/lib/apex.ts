import {
  Approval,
  ApprovalMatrixRule,
  AiInsight,
  CatalogItem,
  CatalogPreviewResult,
  CatalogSubmitResult,
  CloudTagCoverage,
  CloudTagEnforcementResult,
  ConfigVersion,
  ConnectorConfig,
  CustomObjectSchema,
  DashboardKpis,
  EvidencePackage,
  ExternalTicketLink,
  ExternalTicketComment,
  FieldRestriction,
  GraphObject,
  IntegrationHealth,
  KnowledgeArticle,
  NotificationRule,
  PolicyDefinition,
  PolicyEvaluationResult,
  QualityDashboard,
  SavedView,
  SodRule,
  SlaBreachesResponse,
  WorkflowSimulationResult,
  WorkItem,
  WorkflowDefinition
} from "@/lib/types";
import {
  mockAiInsights,
  mockApprovals,
  mockCatalog,
  mockConfigVersions,
  mockConnectorConfigs,
  mockDashboards,
  mockCustomSchemas,
  mockExternalLinks,
  mockIntegrations,
  mockKb,
  mockNotificationRules,
  mockObjects,
  mockPolicies,
  mockQuality,
  mockSavedViews,
  mockSlaBreaches,
  mockWorkItems,
  mockWorkflows
} from "@/lib/mock-data";

const API_BASE = process.env.APEX_API_URL ?? "http://localhost:4000/v1";

type ApiResponse<T> = {
  data: T;
};

const parseJson = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    throw new Error(`Apex API request failed (${response.status})`);
  }
  return (await response.json()) as T;
};

const get = async <T>(path: string): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    cache: "no-store",
    headers: {
      "x-actor-id": "ui-system",
      "x-actor-role": "it-admin"
    }
  });
  const json = await parseJson<ApiResponse<T>>(response);
  return json.data;
};

const safe = async <T>(task: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await task();
  } catch {
    return fallback;
  }
};

export const listObjects = async (): Promise<GraphObject[]> => {
  return safe(() => get<GraphObject[]>("/objects"), mockObjects);
};

export const listObjectsByType = async (type: string): Promise<GraphObject[]> => {
  return safe(
    () => get<GraphObject[]>(`/objects?type=${encodeURIComponent(type)}`),
    mockObjects.filter((item) => item.type === type)
  );
};

export const listWorkItems = async (): Promise<WorkItem[]> => {
  return safe(() => get<WorkItem[]>("/work-items"), mockWorkItems);
};

export const listApprovals = async (): Promise<Approval[]> => {
  return safe(() => get<Approval[]>("/approvals"), mockApprovals);
};

export const listWorkflowDefinitions = async (): Promise<WorkflowDefinition[]> => {
  return safe(() => get<WorkflowDefinition[]>("/workflows/definitions"), mockWorkflows);
};

export const getQualityDashboard = async (): Promise<QualityDashboard> => {
  return safe(() => get<QualityDashboard>("/quality"), mockQuality);
};

export const getIntegrations = async (): Promise<IntegrationHealth[]> => {
  return safe(() => get<IntegrationHealth[]>("/integrations/health"), mockIntegrations);
};

export const getKnowledge = async (): Promise<KnowledgeArticle[]> => {
  return safe(() => get<KnowledgeArticle[]>("/kb/articles"), mockKb);
};

export const getDashboard = async (type: string): Promise<DashboardKpis> => {
  return safe(
    () => get<DashboardKpis>(`/dashboards/${encodeURIComponent(type)}`),
    mockDashboards[type] ?? mockDashboards.executive
  );
};

export const getCatalog = async (): Promise<CatalogItem[]> => {
  return safe(() => get<CatalogItem[]>("/catalog/items"), mockCatalog);
};

export const createCatalogItem = async (payload: {
  name: string;
  description: string;
  category: string;
  expectedDelivery: string;
  audience: string[];
  regions: string[];
  riskLevel: "low" | "medium" | "high";
  defaultWorkflowDefinitionId?: string;
  formFields: Array<{
    key: string;
    label: string;
    type: "string" | "number" | "date" | "enum" | "bool" | "text";
    required: boolean;
    options?: string[];
  }>;
}) => {
  return fetch(`${API_BASE}/catalog/items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      active: true,
      ...payload
    })
  });
};

export const updateCatalogItem = async (
  catalogItemId: string,
  payload: Partial<{
    name: string;
    description: string;
    category: string;
    expectedDelivery: string;
    audience: string[];
    regions: string[];
    riskLevel: "low" | "medium" | "high";
    active: boolean;
    defaultWorkflowDefinitionId?: string;
  }>
) => {
  return fetch(`${API_BASE}/catalog/items/${catalogItemId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify(payload)
  });
};

export const previewCatalogItem = async (
  catalogItemId: string,
  fieldValues: Record<string, unknown>
): Promise<CatalogPreviewResult> => {
  return safe(
    async () => {
      const response = await fetch(`${API_BASE}/catalog/items/${catalogItemId}/preview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": "portal-user-1",
          "x-actor-role": "end-user"
        },
        body: JSON.stringify({ fieldValues })
      });
      if (!response.ok) {
        throw new Error("Catalog preview failed");
      }
      const json = (await response.json()) as ApiResponse<CatalogPreviewResult>;
      return json.data;
    },
    {
      catalogItemId,
      fields: []
    }
  );
};

export const submitCatalogRequest = async (payload: {
  catalogItemId: string;
  requesterId: string;
  title: string;
  description?: string;
  estimatedCost?: number;
  fieldValues: Record<string, unknown>;
}): Promise<CatalogSubmitResult> => {
  const response = await fetch(`${API_BASE}/catalog/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "portal-user-1",
      "x-actor-role": "end-user"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(String(failure.error ?? "Request failed"));
  }
  const json = (await response.json()) as ApiResponse<CatalogSubmitResult>;
  return json.data;
};

export const runWorkflow = async (definitionId: string, inputs: Record<string, unknown>) => {
  const response = await fetch(`${API_BASE}/workflows/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({
      definitionId,
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      inputs
    })
  });
  if (!response.ok) {
    throw new Error("Failed to start workflow");
  }
  return response.json();
};

export const createWorkflowDefinition = async (payload: {
  name: string;
  playbook: string;
  triggerKind: "event" | "schedule" | "manual";
  triggerValue: string;
  steps: Array<{ name: string; type: string; riskLevel: "low" | "medium" | "high" }>;
}) => {
  return fetch(`${API_BASE}/workflows/definitions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      name: payload.name,
      playbook: payload.playbook,
      trigger: {
        kind: payload.triggerKind,
        value: payload.triggerValue
      },
      steps: payload.steps.map((step) => ({
        ...step,
        config: {}
      }))
    })
  });
};

export const transitionWorkflowDefinition = async (
  definitionId: string,
  action: "publish" | "rollback",
  reason: string
) => {
  return fetch(`${API_BASE}/workflows/definitions/${definitionId}/state`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({ action, reason })
  });
};

export const simulateWorkflowDefinition = async (
  definitionId: string,
  inputs: Record<string, unknown>
): Promise<WorkflowSimulationResult> => {
  return safe(
    async () => {
      const response = await fetch(`${API_BASE}/workflows/definitions/${definitionId}/simulate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": "ui-operator",
          "x-actor-role": "it-agent"
        },
        body: JSON.stringify({ inputs })
      });
      if (!response.ok) {
        throw new Error("simulation failed");
      }
      const json = (await response.json()) as ApiResponse<WorkflowSimulationResult>;
      return json.data;
    },
    {
      workflowDefinitionId: definitionId,
      plan: [],
      outcome: "failed"
    }
  );
};

export const listApprovalsInbox = async (approverId: string): Promise<Approval[]> => {
  return safe(
    () => get<Approval[]>(`/approvals/inbox?approverId=${encodeURIComponent(approverId)}`),
    mockApprovals
  );
};

export const decideApproval = async (approvalId: string, decision: "approved" | "rejected", comment?: string) => {
  return fetch(`${API_BASE}/approvals/${approvalId}/decision`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "manager-approver",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({ decision, comment })
  });
};

export const delegateApproval = async (approvalId: string, approverId: string, comment?: string) => {
  return fetch(`${API_BASE}/approvals/${approvalId}/delegate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "manager-approver",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({ approverId, comment })
  });
};

export const listExceptions = async (): Promise<WorkItem[]> => {
  return safe(() => get<WorkItem[]>("/exceptions"), mockWorkItems.filter((item) => item.type === "Exception"));
};

export const runExceptionAction = async (
  exceptionId: string,
  action: "retry" | "resolve" | "escalate",
  reason: string
) => {
  return fetch(`${API_BASE}/exceptions/${exceptionId}/action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "operator-1",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({ action, reason })
  });
};

export const getSlaBreaches = async (): Promise<SlaBreachesResponse> => {
  return safe(() => get<SlaBreachesResponse>("/sla/breaches"), mockSlaBreaches);
};

export const listCustomSchemas = async (): Promise<CustomObjectSchema[]> => {
  return safe(() => get<CustomObjectSchema[]>("/admin/schemas"), mockCustomSchemas);
};

export const createCustomSchema = async (payload: {
  name: string;
  pluralName: string;
  description?: string;
}) => {
  return fetch(`${API_BASE}/admin/schemas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      name: payload.name,
      pluralName: payload.pluralName,
      description: payload.description,
      fields: [],
      relationships: []
    })
  });
};

export const listPolicies = async (): Promise<PolicyDefinition[]> => {
  return safe(() => get<PolicyDefinition[]>("/admin/policies"), mockPolicies);
};

export const createPolicy = async (payload: {
  name: string;
  objectType: string;
  field: string;
  value: string;
}) => {
  return fetch(`${API_BASE}/admin/policies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      name: payload.name,
      description: `Generated policy for ${payload.objectType}.${payload.field}`,
      objectType: payload.objectType,
      severity: "medium",
      expression: {
        field: payload.field,
        operator: "equals",
        value: payload.value
      },
      remediation: {
        notify: true,
        createTask: true
      },
      active: true
    })
  });
};

export const evaluatePolicy = async (policyId: string): Promise<PolicyEvaluationResult> => {
  return safe(
    async () => {
      const response = await fetch(`${API_BASE}/admin/policies/${policyId}/evaluate`, {
        method: "POST",
        headers: {
          "x-actor-id": "ui-admin",
          "x-actor-role": "it-admin"
        }
      });
      if (!response.ok) {
        throw new Error("Policy evaluation failed");
      }
      const json = (await response.json()) as ApiResponse<PolicyEvaluationResult>;
      return json.data;
    },
    { policyId, evaluatedCount: 0, exceptionCount: 0 }
  );
};

export const listConnectorConfigs = async (): Promise<ConnectorConfig[]> => {
  return safe(() => get<ConnectorConfig[]>("/admin/connectors"), mockConnectorConfigs);
};

export const createConnector = async (payload: { name: string; type: ConnectorConfig["type"] }) => {
  return fetch(`${API_BASE}/admin/connectors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      name: payload.name,
      type: payload.type,
      mode: "bidirectional",
      fieldMappings: {},
      transforms: [],
      filters: []
    })
  });
};

export const runConnector = async (connectorId: string, mode: "test" | "dry-run" | "sync") => {
  return fetch(`${API_BASE}/admin/connectors/${connectorId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({ mode })
  });
};

export const listNotificationRules = async (): Promise<NotificationRule[]> => {
  return safe(() => get<NotificationRule[]>("/admin/notifications"), mockNotificationRules);
};

export const createNotificationRule = async (payload: { name: string; trigger: string; channels: string[] }) => {
  return fetch(`${API_BASE}/admin/notifications`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      name: payload.name,
      trigger: payload.trigger,
      channels: payload.channels,
      enabled: true
    })
  });
};

export const listConfigVersions = async (): Promise<ConfigVersion[]> => {
  return safe(() => get<ConfigVersion[]>("/admin/config-versions"), mockConfigVersions);
};

export const listFieldRestrictions = async (): Promise<FieldRestriction[]> => {
  return safe(() => get<FieldRestriction[]>("/admin/rbac/field-restrictions"), []);
};

export const createFieldRestriction = async (payload: {
  objectType: string;
  field: string;
  readRoles: string[];
  writeRoles: string[];
  maskStyle?: "hidden" | "redacted";
}) => {
  return fetch(`${API_BASE}/admin/rbac/field-restrictions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify(payload)
  });
};

export const listSodRules = async (): Promise<SodRule[]> => {
  return safe(() => get<SodRule[]>("/admin/rbac/sod-rules"), []);
};

export const createSodRule = async (payload: {
  name: string;
  description: string;
  requestTypes: string[];
  enabled: boolean;
}) => {
  return fetch(`${API_BASE}/admin/rbac/sod-rules`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify(payload)
  });
};

export const listApprovalMatrixRules = async (): Promise<ApprovalMatrixRule[]> => {
  return safe(() => get<ApprovalMatrixRule[]>("/admin/rbac/approval-matrix"), []);
};

export const createApprovalMatrixRule = async (payload: {
  name: string;
  requestType: string;
  riskLevel: "low" | "medium" | "high";
  costThreshold?: number;
  approverTypes: string[];
  enabled: boolean;
}) => {
  return fetch(`${API_BASE}/admin/rbac/approval-matrix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify(payload)
  });
};

export const authorizeAction = async (action: string): Promise<{ actor: { id: string; role: string }; action: string; allowed: boolean }> => {
  return safe(
    async () => {
      const response = await fetch(`${API_BASE}/admin/rbac/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": "ui-admin",
          "x-actor-role": "it-admin"
        },
        body: JSON.stringify({ action })
      });
      if (!response.ok) {
        throw new Error("Authorization check failed");
      }
      const json = (await response.json()) as ApiResponse<{
        actor: { id: string; role: string };
        action: string;
        allowed: boolean;
      }>;
      return json.data;
    },
    {
      actor: { id: "ui-admin", role: "it-admin" },
      action,
      allowed: false
    }
  );
};

export const createConfigVersion = async (payload: { kind: string; name: string; reason: string }) => {
  return fetch(`${API_BASE}/admin/config-versions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      kind: payload.kind,
      name: payload.name,
      reason: payload.reason,
      payload: {}
    })
  });
};

export const transitionConfigVersion = async (
  id: string,
  state: "published" | "rolled_back",
  reason: string
) => {
  return fetch(`${API_BASE}/admin/config-versions/${id}/state`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({ state, reason })
  });
};

export const listSavedViews = async (): Promise<SavedView[]> => {
  return safe(() => get<SavedView[]>("/views"), mockSavedViews);
};

export const createSavedView = async (payload: { name: string; objectType: string; columns: string[] }) => {
  return fetch(`${API_BASE}/views`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-user",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      name: payload.name,
      objectType: payload.objectType,
      filters: {},
      columns: payload.columns
    })
  });
};

export const listExternalTicketLinks = async (): Promise<ExternalTicketLink[]> => {
  return safe(() => get<ExternalTicketLink[]>("/overlay/external-ticket-links"), mockExternalLinks);
};

export const listExternalTicketComments = async (externalTicketLinkId: string): Promise<ExternalTicketComment[]> => {
  return safe(() => get<ExternalTicketComment[]>(`/overlay/external-ticket-links/${externalTicketLinkId}/comments`), []);
};

export const addExternalTicketComment = async (externalTicketLinkId: string, body: string) => {
  return fetch(`${API_BASE}/overlay/external-ticket-links/${externalTicketLinkId}/comments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-agent",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({ body })
  });
};

export const linkExternalTicket = async (payload: {
  workItemId: string;
  provider: "ServiceNow" | "Jira" | "Other";
  externalTicketId: string;
}) => {
  return fetch(`${API_BASE}/overlay/external-ticket-links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-agent",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
};

export const syncExternalTicketLink = async (id: string) => {
  return fetch(`${API_BASE}/overlay/external-ticket-links/${id}/sync`, {
    method: "POST",
    headers: {
      "x-actor-id": "ui-agent",
      "x-actor-role": "it-agent"
    }
  });
};

export const previewCsvImport = async (rows: Array<Record<string, unknown>>) => {
  return fetch(`${API_BASE}/import/csv/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      objectType: "Device",
      rows,
      fieldMapping: {
        serial_number: "serial_number",
        asset_tag: "asset_tag",
        model: "model"
      }
    })
  });
};

export const applyCsvImport = async (rows: Array<Record<string, unknown>>) => {
  return fetch(`${API_BASE}/import/csv/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      objectType: "Device",
      rows,
      fieldMapping: {
        serial_number: "serial_number",
        asset_tag: "asset_tag",
        model: "model"
      }
    })
  });
};

export const getAiInsights = async (): Promise<AiInsight[]> => {
  return safe(
    async () => {
      const response = await fetch(`${API_BASE}/ai/anomaly-insights`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Failed");
      }
      const json = (await response.json()) as ApiResponse<{ insights: AiInsight[] }>;
      return json.data.insights;
    },
    mockAiInsights
  );
};

export const getEvidencePackage = async (workItemId: string): Promise<EvidencePackage> => {
  return safe(
    () => get<EvidencePackage>(`/evidence/${workItemId}`),
    {
      id: "fallback-evidence",
      workItemId,
      generatedAt: new Date().toISOString(),
      timeline: [],
      approvals: [],
      actionLogs: [],
      affectedObjects: []
    }
  );
};

export const getCloudTagCoverage = async (requiredTags?: string[]): Promise<CloudTagCoverage> => {
  const query = requiredTags && requiredTags.length > 0 ? `?requiredTags=${encodeURIComponent(requiredTags.join(","))}` : "";
  return safe(
    () => get<CloudTagCoverage>(`/cloud/tag-governance/coverage${query}`),
    {
      requiredTags: ["owner", "cost_center", "environment", "data_classification"],
      totalResources: 0,
      compliantResources: 0,
      nonCompliantResources: 0,
      coveragePercent: 100,
      nonCompliant: []
    }
  );
};

export const enforceCloudTags = async (payload: {
  requiredTags?: string[];
  dryRun: boolean;
  autoTag: boolean;
}): Promise<CloudTagEnforcementResult> => {
  const response = await fetch(`${API_BASE}/cloud/tag-governance/enforce`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to enforce cloud tags");
  }
  const json = (await response.json()) as ApiResponse<CloudTagEnforcementResult>;
  return json.data;
};
