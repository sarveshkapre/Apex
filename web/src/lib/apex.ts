import {
  Approval,
  CatalogItem,
  DashboardKpis,
  GraphObject,
  IntegrationHealth,
  KnowledgeArticle,
  QualityDashboard,
  WorkItem,
  WorkflowDefinition
} from "@/lib/types";
import {
  mockApprovals,
  mockCatalog,
  mockDashboards,
  mockIntegrations,
  mockKb,
  mockObjects,
  mockQuality,
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
