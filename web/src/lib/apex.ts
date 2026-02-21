import {
  Approval,
  ApprovalEscalationRunResult,
  ApprovalMatrixRule,
  AiInsight,
  CatalogItem,
  CatalogPreviewResult,
  CatalogSubmitResult,
  CloudTagCoverage,
  CloudTagEnforcementResult,
  ConfigVersion,
  ConnectorConfig,
  ContractRenewalOverview,
  ContractRenewalRun,
  CustomObjectSchema,
  DashboardKpis,
  DeviceLifecycleExecutionResult,
  DeviceLifecycleRun,
  DeviceAcknowledgementResult,
  EvidencePackage,
  ExternalTicketLink,
  ExternalTicketComment,
  FieldRestriction,
  GraphObject,
  GraphRelationship,
  GlobalSearchResponse,
  IntegrationHealth,
  JmlJoinerExecutionResult,
  JmlJoinerRun,
  JmlLeaverExecutionResult,
  JmlLeaverRun,
  JmlMoverExecutionResult,
  JmlMoverRun,
  KnowledgeArticle,
  LostStolenReportResult,
  NotificationRule,
  ObjectMergeExecuteResult,
  ObjectMergePreviewResult,
  ObjectMergeRun,
  PolicyDefinition,
  PolicyException,
  PolicyEvaluationResult,
  QualityDashboard,
  ReportDefinition,
  ReportExportArtifact,
  ReportRun,
  SaasReclaimPolicy,
  SaasReclaimRun,
  SavedView,
  SodRule,
  SlaBreachesResponse,
  RelationshipType,
  WorkflowSimulationResult,
  WorkItem,
  WorkItemBulkAction,
  WorkItemBulkResult,
  WorkflowDefinition,
  WorkflowRun
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

export const listRelationships = async (objectId?: string): Promise<GraphRelationship[]> => {
  const query = objectId ? `?objectId=${encodeURIComponent(objectId)}` : "";
  return safe(() => get<GraphRelationship[]>(`/relationships${query}`), []);
};

export const searchGlobal = async (params: {
  q: string;
  objectType?: string;
  status?: string;
  location?: string;
  owner?: string;
  complianceState?: string;
  lastSeenDays?: number;
}): Promise<GlobalSearchResponse> => {
  const query = new URLSearchParams();
  query.set("q", params.q);
  if (params.objectType) query.set("objectType", params.objectType);
  if (params.status) query.set("status", params.status);
  if (params.location) query.set("location", params.location);
  if (params.owner) query.set("owner", params.owner);
  if (params.complianceState) query.set("complianceState", params.complianceState);
  if (params.lastSeenDays !== undefined) query.set("lastSeenDays", String(params.lastSeenDays));

  return safe(
    () => get<GlobalSearchResponse>(`/search?${query.toString()}`),
    {
      query: params.q,
      filtersApplied: {
        objectType: params.objectType,
        status: params.status,
        location: params.location,
        owner: params.owner,
        complianceState: params.complianceState,
        lastSeenDays: params.lastSeenDays
      },
      facets: {
        types: [],
        status: [],
        location: [],
        owner: [],
        complianceState: []
      },
      results: []
    }
  );
};

export const createRelationship = async (payload: {
  fromObjectId: string;
  toObjectId: string;
  type: RelationshipType;
}): Promise<GraphRelationship> => {
  const response = await fetch(`${API_BASE}/relationships`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      ...payload
    })
  });
  if (!response.ok) {
    throw new Error("Failed to create relationship");
  }
  const json = (await response.json()) as ApiResponse<GraphRelationship>;
  return json.data;
};

export const unlinkRelationship = async (relationshipId: string, reason: string): Promise<GraphRelationship> => {
  const response = await fetch(`${API_BASE}/relationships/${relationshipId}/unlink`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({ reason })
  });
  if (!response.ok) {
    throw new Error("Failed to unlink relationship");
  }
  const json = (await response.json()) as ApiResponse<GraphRelationship>;
  return json.data;
};

export const createChildObject = async (payload: {
  parentObjectId: string;
  childType: string;
  relationshipType: RelationshipType;
  fields: Record<string, unknown>;
}): Promise<{
  parentObjectId: string;
  childObject: GraphObject;
  relationship: GraphRelationship;
}> => {
  const response = await fetch(`${API_BASE}/objects/${payload.parentObjectId}/children`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-asset-manager",
      "x-actor-role": "asset-manager"
    },
    body: JSON.stringify({
      childType: payload.childType,
      relationshipType: payload.relationshipType,
      fields: payload.fields
    })
  });
  if (!response.ok) {
    throw new Error("Failed to create child object");
  }
  const json = (await response.json()) as ApiResponse<{
    parentObjectId: string;
    childObject: GraphObject;
    relationship: GraphRelationship;
  }>;
  return json.data;
};

export const startObjectWorkflow = async (payload: {
  objectId: string;
  definitionId: string;
  inputs: Record<string, unknown>;
}): Promise<{ run: WorkflowRun; objectId: string }> => {
  const response = await fetch(`${API_BASE}/objects/${payload.objectId}/workflows/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({
      definitionId: payload.definitionId,
      inputs: payload.inputs
    })
  });
  if (!response.ok) {
    throw new Error("Failed to start workflow from object context");
  }
  const json = (await response.json()) as ApiResponse<{ run: WorkflowRun; objectId: string }>;
  return json.data;
};

export const reportDeviceLostStolen = async (payload: {
  deviceId: string;
  reporterId: string;
  lastKnownLocation: string;
  occurredAt: string;
  circumstances: string;
  suspectedTheft: boolean;
  requestImmediateLock: boolean;
  requestWipe: boolean;
  createCredentialRotationTask: boolean;
}): Promise<LostStolenReportResult> => {
  const response = await fetch(`${API_BASE}/devices/${payload.deviceId}/lost-stolen/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "portal-user-1",
      "x-actor-role": "end-user"
    },
    body: JSON.stringify({
      reporterId: payload.reporterId,
      lastKnownLocation: payload.lastKnownLocation,
      occurredAt: payload.occurredAt,
      circumstances: payload.circumstances,
      suspectedTheft: payload.suspectedTheft,
      requestImmediateLock: payload.requestImmediateLock,
      requestWipe: payload.requestWipe,
      createCredentialRotationTask: payload.createCredentialRotationTask
    })
  });
  if (!response.ok) {
    throw new Error("Failed to report lost/stolen device");
  }
  const json = (await response.json()) as ApiResponse<LostStolenReportResult>;
  return json.data;
};

export const acknowledgeDeviceCustody = async (payload: {
  deviceId: string;
  type: "receipt" | "return-shipment";
  acknowledgedBy: string;
  note?: string;
}): Promise<DeviceAcknowledgementResult> => {
  const response = await fetch(`${API_BASE}/devices/${payload.deviceId}/acknowledgements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "portal-user-1",
      "x-actor-role": "end-user"
    },
    body: JSON.stringify({
      type: payload.type,
      acknowledgedBy: payload.acknowledgedBy,
      note: payload.note
    })
  });
  if (!response.ok) {
    throw new Error("Failed to acknowledge device custody");
  }
  const json = (await response.json()) as ApiResponse<DeviceAcknowledgementResult>;
  return json.data;
};

export const applyObjectManualOverride = async (payload: {
  objectId: string;
  field: string;
  value: unknown;
  reason: string;
  overrideUntil?: string;
}): Promise<GraphObject> => {
  const response = await fetch(`${API_BASE}/objects/${payload.objectId}/manual-override`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-security",
      "x-actor-role": "security-analyst"
    },
    body: JSON.stringify({
      field: payload.field,
      value: payload.value,
      reason: payload.reason,
      overrideUntil: payload.overrideUntil
    })
  });
  if (!response.ok) {
    throw new Error("Failed to apply manual override");
  }
  const json = (await response.json()) as ApiResponse<GraphObject>;
  return json.data;
};

export const listObjectMergeRuns = async (objectId?: string): Promise<ObjectMergeRun[]> => {
  const query = objectId ? `?objectId=${encodeURIComponent(objectId)}` : "";
  return safe(() => get<ObjectMergeRun[]>(`/object-merges/runs${query}`), []);
};

export const previewObjectMerge = async (payload: {
  targetObjectId: string;
  sourceObjectId: string;
}): Promise<ObjectMergePreviewResult> => {
  const response = await fetch(`${API_BASE}/object-merges/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to preview object merge");
  }
  const json = (await response.json()) as ApiResponse<ObjectMergePreviewResult>;
  return json.data;
};

export const executeObjectMerge = async (payload: {
  targetObjectId: string;
  sourceObjectId: string;
  reason: string;
}): Promise<ObjectMergeExecuteResult> => {
  const response = await fetch(`${API_BASE}/object-merges/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to execute object merge");
  }
  const json = (await response.json()) as ApiResponse<ObjectMergeExecuteResult>;
  return json.data;
};

export const revertObjectMerge = async (mergeRunId: string) => {
  return fetch(`${API_BASE}/object-merges/${mergeRunId}/revert`, {
    method: "POST",
    headers: {
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    }
  });
};

export const listWorkItems = async (): Promise<WorkItem[]> => {
  return safe(() => get<WorkItem[]>("/work-items"), mockWorkItems);
};

export const runWorkItemBulkAction = async (payload: {
  workItemIds: string[];
  action: WorkItemBulkAction;
  assigneeId?: string;
  assignmentGroup?: string;
  priority?: "P0" | "P1" | "P2" | "P3" | "P4";
  tag?: string;
  comment?: string;
  workflowStep?: "triage" | "start" | "wait" | "block" | "complete" | "cancel";
}): Promise<WorkItemBulkResult> => {
  const response = await fetch(`${API_BASE}/work-items/bulk`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-agent",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Bulk queue action failed");
  }
  const json = (await response.json()) as ApiResponse<WorkItemBulkResult>;
  return json.data;
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

export const listReportDefinitions = async (): Promise<ReportDefinition[]> => {
  return safe(() => get<ReportDefinition[]>("/reports/definitions"), []);
};

export const createReportDefinition = async (payload: {
  name: string;
  description?: string;
  objectType?: string;
  containsText?: string;
  columns: string[];
  scheduleFrequency?: "manual" | "daily" | "weekly";
  scheduleHourUtc?: number;
}) => {
  return fetch(`${API_BASE}/reports/definitions`, {
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
      description: payload.description,
      objectType: payload.objectType,
      filters: {
        containsText: payload.containsText,
        fieldEquals: {}
      },
      columns: payload.columns,
      schedule: payload.scheduleFrequency
        ? {
            frequency: payload.scheduleFrequency,
            hourUtc: payload.scheduleHourUtc
          }
        : undefined,
      enabled: true
    })
  });
};

export const updateReportDefinition = async (
  definitionId: string,
  payload: Partial<{
    name: string;
    description: string;
    objectType: string;
    containsText: string;
    columns: string[];
    scheduleFrequency: "manual" | "daily" | "weekly";
    scheduleHourUtc?: number;
    enabled: boolean;
  }>
) => {
  return fetch(`${API_BASE}/reports/definitions/${definitionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      ...payload,
      filters:
        payload.containsText !== undefined
          ? {
              containsText: payload.containsText,
              fieldEquals: {}
            }
          : undefined,
      schedule:
        payload.scheduleFrequency !== undefined
          ? {
              frequency: payload.scheduleFrequency,
              hourUtc: payload.scheduleHourUtc
            }
          : undefined
    })
  });
};

export const runReportDefinition = async (
  definitionId: string,
  trigger: "manual" | "scheduled" = "manual"
): Promise<ReportRun> => {
  const response = await fetch(`${API_BASE}/reports/definitions/${definitionId}/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({ trigger })
  });
  if (!response.ok) {
    throw new Error("Failed to run report definition");
  }
  const json = (await response.json()) as ApiResponse<ReportRun>;
  return json.data;
};

export const listDeviceLifecycleRuns = async (deviceId?: string): Promise<DeviceLifecycleRun[]> => {
  const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
  return safe(() => get<DeviceLifecycleRun[]>(`/device-lifecycle/runs${query}`), []);
};

export const previewDeviceLifecycle = async (payload: {
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
}): Promise<DeviceLifecycleRun> => {
  const response = await fetch(`${API_BASE}/device-lifecycle/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to generate device lifecycle preview");
  }
  const json = (await response.json()) as ApiResponse<DeviceLifecycleRun>;
  return json.data;
};

export const executeDeviceLifecycle = async (payload: {
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
  reason: string;
}): Promise<DeviceLifecycleExecutionResult> => {
  const response = await fetch(`${API_BASE}/device-lifecycle/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to execute device lifecycle workflow");
  }
  const json = (await response.json()) as ApiResponse<DeviceLifecycleExecutionResult>;
  return json.data;
};

export const listJmlJoinerRuns = async (params?: { personId?: string; email?: string }): Promise<JmlJoinerRun[]> => {
  const query = new URLSearchParams();
  if (params?.personId) {
    query.set("personId", params.personId);
  }
  if (params?.email) {
    query.set("email", params.email);
  }
  const suffix = query.toString().length > 0 ? `?${query.toString()}` : "";
  return safe(() => get<JmlJoinerRun[]>(`/jml/joiner/runs${suffix}`), []);
};

export const previewJmlJoiner = async (payload: {
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
}): Promise<JmlJoinerRun> => {
  const response = await fetch(`${API_BASE}/jml/joiner/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to generate joiner preview");
  }
  const json = (await response.json()) as ApiResponse<JmlJoinerRun>;
  return json.data;
};

export const executeJmlJoiner = async (payload: {
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
  reason: string;
}): Promise<JmlJoinerExecutionResult> => {
  const response = await fetch(`${API_BASE}/jml/joiner/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to execute joiner workflow");
  }
  const json = (await response.json()) as ApiResponse<JmlJoinerExecutionResult>;
  return json.data;
};

export const listJmlMoverRuns = async (personId?: string): Promise<JmlMoverRun[]> => {
  const query = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  return safe(() => get<JmlMoverRun[]>(`/jml/mover/runs${query}`), []);
};

export const previewJmlMover = async (payload: {
  personId: string;
  targetRole: string;
  targetDepartment?: string;
  targetLocation?: string;
  requesterId: string;
}): Promise<JmlMoverRun> => {
  const response = await fetch(`${API_BASE}/jml/mover/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to generate mover preview");
  }
  const json = (await response.json()) as ApiResponse<JmlMoverRun>;
  return json.data;
};

export const executeJmlMover = async (payload: {
  personId: string;
  targetRole: string;
  targetDepartment?: string;
  targetLocation?: string;
  requesterId: string;
  reason: string;
}): Promise<JmlMoverExecutionResult> => {
  const response = await fetch(`${API_BASE}/jml/mover/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to execute mover workflow");
  }
  const json = (await response.json()) as ApiResponse<JmlMoverExecutionResult>;
  return json.data;
};

export const listJmlLeaverRuns = async (personId?: string): Promise<JmlLeaverRun[]> => {
  const query = personId ? `?personId=${encodeURIComponent(personId)}` : "";
  return safe(() => get<JmlLeaverRun[]>(`/jml/leaver/runs${query}`), []);
};

export const previewJmlLeaver = async (payload: {
  personId: string;
  requesterId: string;
  effectiveDate?: string;
  region?: string;
  legalHold: boolean;
  vip: boolean;
  contractorConversion: boolean;
  deviceRecoveryState: "pending" | "recovered" | "not-recovered";
}): Promise<JmlLeaverRun> => {
  const response = await fetch(`${API_BASE}/jml/leaver/preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to generate leaver preview");
  }
  const json = (await response.json()) as ApiResponse<JmlLeaverRun>;
  return json.data;
};

export const executeJmlLeaver = async (payload: {
  personId: string;
  requesterId: string;
  reason: string;
  effectiveDate?: string;
  region?: string;
  legalHold: boolean;
  vip: boolean;
  contractorConversion: boolean;
  deviceRecoveryState: "pending" | "recovered" | "not-recovered";
}): Promise<JmlLeaverExecutionResult> => {
  const response = await fetch(`${API_BASE}/jml/leaver/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to execute leaver workflow");
  }
  const json = (await response.json()) as ApiResponse<JmlLeaverExecutionResult>;
  return json.data;
};

export const listReportRuns = async (definitionId?: string): Promise<ReportRun[]> => {
  const query = definitionId ? `?definitionId=${encodeURIComponent(definitionId)}` : "";
  return safe(() => get<ReportRun[]>(`/reports/runs${query}`), []);
};

export const exportReportRun = async (runId: string): Promise<ReportExportArtifact> => {
  const response = await fetch(`${API_BASE}/reports/runs/${runId}/export`, {
    headers: {
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    }
  });
  if (!response.ok) {
    throw new Error("Failed to export report run");
  }
  const json = (await response.json()) as ApiResponse<ReportExportArtifact>;
  return json.data;
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

export const decideApproval = async (
  approvalId: string,
  decision: "approved" | "rejected" | "info-requested",
  comment?: string
) => {
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

export const setApprovalExpiry = async (approvalId: string, expiresAt: string) => {
  return fetch(`${API_BASE}/approvals/${approvalId}/expiry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "manager-approver",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({ expiresAt })
  });
};

export const runApprovalEscalations = async (
  fallbackApproverId: string,
  dryRun = false
): Promise<ApprovalEscalationRunResult> => {
  const response = await fetch(`${API_BASE}/approvals/escalations/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "manager-approver",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({ fallbackApproverId, dryRun })
  });
  if (!response.ok) {
    throw new Error("Approval escalation run failed");
  }
  const json = (await response.json()) as ApiResponse<ApprovalEscalationRunResult>;
  return json.data;
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

export const listPolicyExceptions = async (policyId?: string, status?: "open" | "waived" | "resolved"): Promise<PolicyException[]> => {
  const params = new URLSearchParams();
  if (policyId) {
    params.set("policyId", policyId);
  }
  if (status) {
    params.set("status", status);
  }
  const query = params.toString() ? `?${params.toString()}` : "";
  return safe(() => get<PolicyException[]>(`/admin/policies/exceptions${query}`), []);
};

export const actionPolicyException = async (
  exceptionId: string,
  payload: {
    action: "waive" | "resolve" | "reopen" | "renew";
    reason: string;
    waiverExpiresAt?: string;
  }
) => {
  return fetch(`${API_BASE}/admin/policies/exceptions/${exceptionId}/action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify(payload)
  });
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

export const getContractRenewalOverview = async (daysAhead = 90): Promise<ContractRenewalOverview> => {
  return safe(
    () => get<ContractRenewalOverview>(`/contracts/renewals/overview?daysAhead=${encodeURIComponent(String(daysAhead))}`),
    {
      daysAhead,
      scannedContracts: 0,
      dueContracts: 0,
      dueSoonContracts: 0,
      overdueContracts: 0,
      candidates: []
    }
  );
};

export const listContractRenewalRuns = async (status?: "success" | "failed" | "partial"): Promise<ContractRenewalRun[]> => {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return safe(() => get<ContractRenewalRun[]>(`/contracts/renewals/runs${query}`), []);
};

export const runContractRenewals = async (payload: {
  daysAhead: number;
  mode: "dry-run" | "live";
}): Promise<ContractRenewalRun> => {
  const response = await fetch(`${API_BASE}/contracts/renewals/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error("Failed to run contract renewal reminders");
  }
  const json = (await response.json()) as ApiResponse<ContractRenewalRun>;
  return json.data;
};

export const listSaasReclaimPolicies = async (): Promise<SaasReclaimPolicy[]> => {
  return safe(() => get<SaasReclaimPolicy[]>("/saas/reclaim/policies"), []);
};

export const createSaasReclaimPolicy = async (payload: {
  name: string;
  appName: string;
  inactivityDays: number;
  warningDays: number;
  autoReclaim: boolean;
  schedule: "manual" | "daily" | "weekly";
  enabled: boolean;
}) => {
  return fetch(`${API_BASE}/saas/reclaim/policies`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify({
      tenantId: "tenant-demo",
      workspaceId: "workspace-demo",
      ...payload
    })
  });
};

export const updateSaasReclaimPolicy = async (
  policyId: string,
  payload: Partial<{
    name: string;
    appName: string;
    inactivityDays: number;
    warningDays: number;
    autoReclaim: boolean;
    schedule: "manual" | "daily" | "weekly";
    enabled: boolean;
  }>
) => {
  return fetch(`${API_BASE}/saas/reclaim/policies/${policyId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-admin",
      "x-actor-role": "it-admin"
    },
    body: JSON.stringify(payload)
  });
};

export const listSaasReclaimRuns = async (policyId?: string): Promise<SaasReclaimRun[]> => {
  const query = policyId ? `?policyId=${encodeURIComponent(policyId)}` : "";
  return safe(() => get<SaasReclaimRun[]>(`/saas/reclaim/runs${query}`), []);
};

export const runSaasReclaim = async (policyId: string, mode: "dry-run" | "live"): Promise<SaasReclaimRun> => {
  const response = await fetch(`${API_BASE}/saas/reclaim/runs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({ policyId, mode })
  });
  if (!response.ok) {
    throw new Error("Failed to run SaaS reclaim");
  }
  const json = (await response.json()) as ApiResponse<SaasReclaimRun>;
  return json.data;
};

export const retrySaasReclaimRun = async (
  runId: string,
  mode: "dry-run" | "live" = "live"
): Promise<SaasReclaimRun> => {
  const response = await fetch(`${API_BASE}/saas/reclaim/runs/${runId}/retry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "ui-operator",
      "x-actor-role": "it-agent"
    },
    body: JSON.stringify({ mode })
  });
  if (!response.ok) {
    throw new Error("Failed to retry SaaS reclaim run");
  }
  const json = (await response.json()) as ApiResponse<SaasReclaimRun>;
  return json.data;
};
