import {
  Approval,
  AiInsight,
  CatalogItem,
  ConfigVersion,
  ConnectorConfig,
  CustomObjectSchema,
  DashboardKpis,
  ExternalTicketLink,
  GraphObject,
  IntegrationHealth,
  KnowledgeArticle,
  NotificationRule,
  PolicyDefinition,
  PolicyEvaluationResult,
  QualityDashboard,
  SavedView,
  SlaBreachesResponse,
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
