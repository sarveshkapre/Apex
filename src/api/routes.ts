import { ErrorRequestHandler, Router } from "express";
import { ZodError } from "zod";
import {
  ApiActor,
  GraphObject,
  GraphRelationship,
  SourceSignal,
  WorkItem,
  UserRole
} from "../domain/types";
import { ApexStore } from "../store/store";
import { nowIso } from "../utils/time";
import { can } from "../services/rbac";
import {
  approvalDecisionSchema,
  objectCreateSchema,
  objectUpdateSchema,
  relationshipCreateSchema,
  runWorkflowSchema,
  signalIngestSchema,
  workItemCreateSchema,
  workItemUpdateSchema
} from "./schemas";
import { findCandidates, ingestSignal } from "../services/reconciliation";
import { computeQualityDashboard } from "../services/quality";
import { buildEvidencePackage } from "../services/evidence";
import { WorkflowEngine } from "../services/workflowEngine";

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

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "apex-control-plane", now: nowIso() });
  });

  router.get("/objects", (req, res) => {
    const type = req.query.type ? String(req.query.type) : undefined;
    const data = [...store.objects.values()].filter((obj) => (type ? obj.type === type : true));
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
    const object = store.objects.get(req.params.id);
    if (!object) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    res.json({ data: object });
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

  router.get("/catalog/items", (_req, res) => {
    res.json({ data: catalogItems });
  });

  router.get("/kb/articles", (_req, res) => {
    res.json({ data: kbArticles });
  });

  router.get("/integrations/health", (_req, res) => {
    res.json({ data: integrationsHealth });
  });

  router.get("/dashboards/:name", (req, res) => {
    const key = req.params.name as keyof typeof dashboards;
    res.json({ data: dashboards[key] ?? dashboards.executive });
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

  router.get("/approvals", (req, res) => {
    const workItemId = req.query.workItemId ? String(req.query.workItemId) : undefined;
    const data = [...store.approvals.values()].filter((approval) =>
      workItemId ? approval.workItemId === workItemId : true
    );
    res.json({ data });
  });

  router.post("/approvals/:id/decision", (req, res) => {
    const actor = getActor(req.headers);
    const parsed = approvalDecisionSchema.parse(req.body);
    const approval = workflows.decideApproval(req.params.id, actor, parsed.decision, parsed.comment);
    res.json({ data: approval });
  });

  router.get("/workflows/definitions", (_req, res) => {
    res.json({ data: [...store.workflowDefinitions.values()] });
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

    const evidence = buildEvidencePackage(store, req.params.workItemId);
    res.json({ data: evidence });
  });

  router.post("/ai/query", (req, res) => {
    const prompt = String(req.body.prompt ?? "").toLowerCase();

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
    const prompt = String(req.body.prompt ?? "");
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

  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof ZodError) {
      res.status(400).json({ error: "Validation failed", details: error.issues });
      return;
    }

    if (error instanceof Error && error.message.includes("Permission denied")) {
      res.status(403).json({ error: error.message });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  };
  router.use(errorHandler);

  return router;
};
