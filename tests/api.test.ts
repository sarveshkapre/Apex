import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";

describe("Apex API", () => {
  it("creates an object and returns it", async () => {
    const { app } = createApp();

    const response = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Person",
        fields: {
          legal_name: "Jane Doe",
          email: "jane@example.com",
          worker_id: "W123",
          status: "active"
        }
      });

    expect(response.status).toBe(201);
    expect(response.body.data.type).toBe("Person");
  });

  it("gates high-risk workflow steps for non-privileged actors", async () => {
    const { app } = createApp();

    const response = await request(app)
      .post("/v1/workflows/runs")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        definitionId: "wf-device-return-v1",
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        inputs: {}
      });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe("waiting-approval");
  });

  it("reconciles device signal into existing canonical object", async () => {
    const { app } = createApp();

    const listBefore = await request(app).get("/v1/objects").query({ type: "Device" });
    expect(listBefore.body.data.length).toBe(1);

    const response = await request(app)
      .post("/v1/signals/ingest")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        sourceId: "jamf",
        objectType: "Device",
        externalId: "jamf-123",
        confidence: 0.9,
        snapshot: {
          serial_number: "SN-001",
          asset_tag: "LAP-001",
          hostname: "mbp-01",
          encryption_state: "enabled"
        }
      });

    expect([200, 201]).toContain(response.status);

    const listAfter = await request(app).get("/v1/objects").query({ type: "Device" });
    expect(listAfter.body.data.length).toBe(1);
  });

  it("returns global search results with facets and filters", async () => {
    const { app } = createApp();

    const search = await request(app)
      .get("/v1/search")
      .query({
        q: "device",
        objectType: "Device"
      });
    expect(search.status).toBe(200);
    expect(search.body.data.query).toBe("device");
    expect(Array.isArray(search.body.data.results)).toBe(true);
    expect(search.body.data.results.every((item: { type: string }) => item.type === "Device")).toBe(true);
    expect(Array.isArray(search.body.data.facets.types)).toBe(true);

    const filtered = await request(app)
      .get("/v1/search")
      .query({
        q: "laptop",
        complianceState: "compliant"
      });
    expect(filtered.status).toBe(200);
    expect(Array.isArray(filtered.body.data.results)).toBe(true);
    expect(filtered.body.data.filtersApplied.complianceState).toBe("compliant");
  });

  it("merges duplicate objects and supports reversible rollback", async () => {
    const { app } = createApp();

    const target = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Device",
        fields: {
          serial_number: "SN-DUP-001",
          asset_tag: "LAP-DUP-TARGET",
          hostname: "target-host",
          model: "MacBook Pro"
        }
      });
    expect(target.status).toBe(201);

    const source = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Device",
        fields: {
          serial_number: "SN-DUP-001",
          asset_tag: "LAP-DUP-SOURCE",
          hostname: "source-host",
          compliance_state: "non-compliant"
        }
      });
    expect(source.status).toBe(201);

    const people = await request(app).get("/v1/objects").query({ type: "Person" });
    expect(people.status).toBe(200);
    const personId = people.body.data[0].id as string;

    const relationship = await request(app)
      .post("/v1/relationships")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "assigned_to",
        fromObjectId: source.body.data.id,
        toObjectId: personId
      });
    expect(relationship.status).toBe(201);

    const linkedItem = await request(app)
      .post("/v1/work-items")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Request",
        priority: "P2",
        title: "Merge duplicate follow-up",
        requesterId: "person-1",
        linkedObjectIds: [source.body.data.id],
        tags: []
      });
    expect(linkedItem.status).toBe(201);

    const preview = await request(app)
      .post("/v1/object-merges/preview")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        targetObjectId: target.body.data.id,
        sourceObjectId: source.body.data.id
      });
    expect(preview.status).toBe(201);
    expect(preview.body.data.run.fieldDecisions.length).toBeGreaterThan(0);
    expect(preview.body.data.impact.relationshipsToMove).toBeGreaterThanOrEqual(1);

    const executed = await request(app)
      .post("/v1/object-merges/execute")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        targetObjectId: target.body.data.id,
        sourceObjectId: source.body.data.id,
        reason: "Duplicate serial across MDM + EDR"
      });
    expect(executed.status).toBe(201);
    expect(executed.body.data.run.status).toBe("executed");

    const sourceAfterMerge = await request(app).get(`/v1/objects/${source.body.data.id}`);
    expect(sourceAfterMerge.status).toBe(404);

    const relationshipsAfterMerge = await request(app).get("/v1/relationships");
    expect(relationshipsAfterMerge.status).toBe(200);
    expect(
      relationshipsAfterMerge.body.data.some(
        (item: { fromObjectId: string; toObjectId: string }) =>
          item.fromObjectId === target.body.data.id && item.toObjectId === personId
      )
    ).toBe(true);

    const workItemsAfterMerge = await request(app).get("/v1/work-items");
    const mergedWorkItem = workItemsAfterMerge.body.data.find((item: { id: string }) => item.id === linkedItem.body.data.id);
    expect(mergedWorkItem.linkedObjectIds.includes(target.body.data.id)).toBe(true);
    expect(mergedWorkItem.linkedObjectIds.includes(source.body.data.id)).toBe(false);

    const reverted = await request(app)
      .post(`/v1/object-merges/${executed.body.data.run.id}/revert`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({});
    expect(reverted.status).toBe(200);
    expect(reverted.body.data.run.status).toBe("reverted");

    const sourceAfterRevert = await request(app).get(`/v1/objects/${source.body.data.id}`);
    expect(sourceAfterRevert.status).toBe(200);
  });

  it("supports graph object actions: link guardrails, unlink, child creation, and workflow start", async () => {
    const { app } = createApp();

    const objects = await request(app).get("/v1/objects");
    expect(objects.status).toBe(200);
    const device = objects.body.data.find((item: { type: string }) => item.type === "Device");
    const person = objects.body.data.find((item: { type: string }) => item.type === "Person");
    expect(device).toBeTruthy();
    expect(person).toBeTruthy();
    const deviceId = (device as { id: string }).id;
    const personId = (person as { id: string }).id;

    const invalidSelfLink = await request(app)
      .post("/v1/relationships")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "assigned_to",
        fromObjectId: deviceId,
        toObjectId: deviceId
      });
    expect(invalidSelfLink.status).toBe(400);

    const linked = await request(app)
      .post("/v1/relationships")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "assigned_to",
        fromObjectId: deviceId,
        toObjectId: personId
      });
    expect(linked.status).toBe(201);

    const duplicate = await request(app)
      .post("/v1/relationships")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "assigned_to",
        fromObjectId: deviceId,
        toObjectId: personId
      });
    expect(duplicate.status).toBe(409);

    const unlinked = await request(app)
      .post(`/v1/relationships/${linked.body.data.id}/unlink`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ reason: "Incorrect link" });
    expect(unlinked.status).toBe(200);

    const relationshipsAfter = await request(app).get("/v1/relationships").query({ objectId: deviceId });
    expect(relationshipsAfter.status).toBe(200);
    expect(
      relationshipsAfter.body.data.some((item: { id: string }) => item.id === linked.body.data.id)
    ).toBe(false);

    const child = await request(app)
      .post(`/v1/objects/${deviceId}/children`)
      .set("x-actor-id", "asset-1")
      .set("x-actor-role", "asset-manager")
      .send({
        childType: "Accessory",
        relationshipType: "contains",
        fields: {
          type: "dock",
          serial_number: "ACC-DOCK-001"
        }
      });
    expect(child.status).toBe(201);
    expect(child.body.data.childObject.type).toBe("Accessory");
    expect(child.body.data.relationship.fromObjectId).toBe(deviceId);

    const started = await request(app)
      .post(`/v1/objects/${deviceId}/workflows/start`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        definitionId: "wf-jml-joiner-v1",
        inputs: {
          trigger: "manual-graph"
        }
      });
    expect(started.status).toBe(201);
    expect(started.body.data.objectId).toBe(deviceId);
    expect(started.body.data.run.inputs.objectId).toBe(deviceId);
    expect(started.body.data.run.inputs.objectType).toBe("Device");
  });

  it("runs guided lost/stolen report with approval-gated lock and wipe actions", async () => {
    const { app } = createApp();

    const devices = await request(app).get("/v1/objects").query({ type: "Device" });
    expect(devices.status).toBe(200);
    const deviceId = devices.body.data[0].id as string;

    const reported = await request(app)
      .post(`/v1/devices/${deviceId}/lost-stolen/report`)
      .set("x-actor-id", "portal-user-1")
      .set("x-actor-role", "end-user")
      .send({
        reporterId: "person-1",
        lastKnownLocation: "San Francisco Office",
        occurredAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        circumstances: "Device left in rideshare and could not be recovered.",
        suspectedTheft: true,
        requestImmediateLock: true,
        requestWipe: true,
        createCredentialRotationTask: true
      });

    expect(reported.status).toBe(201);
    expect(reported.body.data.incident.type).toBe("Incident");
    expect(reported.body.data.incident.priority).toBe("P0");
    expect(reported.body.data.approvals.length).toBeGreaterThanOrEqual(2);
    expect(reported.body.data.actionPlan.some((step: { requiresApproval: boolean }) => step.requiresApproval)).toBe(true);
    expect(reported.body.data.followUpTasks.length).toBeGreaterThanOrEqual(1);

    const device = await request(app).get(`/v1/objects/${deviceId}`);
    expect(device.status).toBe(200);
    expect(device.body.data.fields.lost_stolen_status).toBe("reported");
  });

  it("supports low-risk lost/stolen report without destructive action approvals", async () => {
    const { app } = createApp();

    const devices = await request(app).get("/v1/objects").query({ type: "Device" });
    const deviceId = devices.body.data[0].id as string;

    const reported = await request(app)
      .post(`/v1/devices/${deviceId}/lost-stolen/report`)
      .set("x-actor-id", "portal-user-1")
      .set("x-actor-role", "end-user")
      .send({
        reporterId: "person-1",
        lastKnownLocation: "HQ Front Desk",
        occurredAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        circumstances: "Device is missing after office move.",
        suspectedTheft: false,
        requestImmediateLock: false,
        requestWipe: false,
        createCredentialRotationTask: false
      });

    expect(reported.status).toBe(201);
    expect(reported.body.data.incident.priority).toBe("P1");
    expect(reported.body.data.approvals.length).toBe(0);
    expect(reported.body.data.actionPlan.every((step: { requiresApproval: boolean }) => !step.requiresApproval)).toBe(true);
  });

  it("records device receipt and return-shipment acknowledgements", async () => {
    const { app } = createApp();

    const devices = await request(app).get("/v1/objects").query({ type: "Device" });
    expect(devices.status).toBe(200);
    const deviceId = devices.body.data[0].id as string;

    const receipt = await request(app)
      .post(`/v1/devices/${deviceId}/acknowledgements`)
      .set("x-actor-id", "portal-user-1")
      .set("x-actor-role", "end-user")
      .send({
        type: "receipt",
        acknowledgedBy: "person-1",
        note: "Received package and completed setup."
      });
    expect(receipt.status).toBe(201);
    expect(receipt.body.data.acknowledgement.type).toBe("receipt");
    expect(receipt.body.data.device.fields.receipt_acknowledged_by).toBe("person-1");

    const returnAck = await request(app)
      .post(`/v1/devices/${deviceId}/acknowledgements`)
      .set("x-actor-id", "portal-user-1")
      .set("x-actor-role", "end-user")
      .send({
        type: "return-shipment",
        acknowledgedBy: "person-1",
        note: "Return kit dropped off with courier."
      });
    expect(returnAck.status).toBe(201);
    expect(returnAck.body.data.acknowledgement.type).toBe("return-shipment");
    expect(returnAck.body.data.device.fields.return_shipment_acknowledged_by).toBe("person-1");

    const timeline = await request(app).get(`/v1/timeline/${deviceId}`);
    expect(timeline.status).toBe(200);
    expect(
      timeline.body.data.filter((event: { reason?: string }) => String(event.reason ?? "").startsWith("device-acknowledgement")).length
    ).toBeGreaterThanOrEqual(2);
  });

  it("adds comment and attachment to a work item", async () => {
    const { app } = createApp();

    const created = await request(app)
      .post("/v1/work-items")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Request",
        priority: "P2",
        title: "Need help with VPN",
        requesterId: "person-1",
        linkedObjectIds: [],
        tags: []
      });

    expect(created.status).toBe(201);
    const workItemId = created.body.data.id as string;

    const comment = await request(app)
      .post(`/v1/work-items/${workItemId}/comments`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ body: "Investigating now", mentions: ["person-1"] });
    expect(comment.status).toBe(201);

    const attachment = await request(app)
      .post(`/v1/work-items/${workItemId}/attachments`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ fileName: "vpn-log.txt", url: "https://example.com/vpn-log.txt" });
    expect(attachment.status).toBe(201);
  });

  it("creates and evaluates a policy", async () => {
    const { app } = createApp();

    const policy = await request(app)
      .post("/v1/admin/policies")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: "Encryption required",
        description: "Devices must be encrypted",
        objectType: "Device",
        severity: "high",
        expression: {
          field: "encryption_state",
          operator: "equals",
          value: "enabled"
        },
        remediation: {
          notify: true,
          createTask: true
        },
        active: true
      });

    expect(policy.status).toBe(201);

    const evaluated = await request(app)
      .post(`/v1/admin/policies/${policy.body.data.id}/evaluate`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({});

    expect(evaluated.status).toBe(200);
    expect(typeof evaluated.body.data.evaluatedCount).toBe("number");
  });

  it("supports workflow draft lifecycle and simulation", async () => {
    const { app } = createApp();

    const created = await request(app)
      .post("/v1/workflows/definitions")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        name: "Test workflow",
        playbook: "Custom",
        trigger: { kind: "manual", value: "manual.test" },
        steps: [
          { name: "Collect", type: "human-task", riskLevel: "low", config: {} },
          { name: "Approve", type: "approval", riskLevel: "medium", config: {} }
        ]
      });
    expect(created.status).toBe(201);

    const definitionId = created.body.data.id as string;
    const simulated = await request(app)
      .post(`/v1/workflows/definitions/${definitionId}/simulate`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ inputs: { requesterId: "person-1" } });
    expect(simulated.status).toBe(200);
    expect(simulated.body.data.outcome).toBe("dry-run-complete");

    const published = await request(app)
      .post(`/v1/workflows/definitions/${definitionId}/state`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ action: "publish", reason: "Ready" });
    expect(published.status).toBe(200);
    expect(published.body.data.active).toBe(true);
  });

  it("runs sandbox dry-runs for policies and workflows without mutating live policy state", async () => {
    const { app } = createApp();

    const policy = await request(app)
      .post("/v1/admin/policies")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: "Sandbox Encryption Check",
        description: "Dry-run policy validation",
        objectType: "Device",
        severity: "medium",
        expression: {
          field: "encryption_state",
          operator: "equals",
          value: "enabled"
        },
        remediation: {
          notify: true,
          createTask: true
        },
        active: true
      });
    expect(policy.status).toBe(201);

    const exceptionsBefore = await request(app).get("/v1/admin/policies/exceptions");
    expect(exceptionsBefore.status).toBe(200);
    const workItemsBefore = await request(app).get("/v1/work-items");
    expect(workItemsBefore.status).toBe(200);

    const policySandbox = await request(app)
      .post("/v1/admin/sandbox/runs")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        kind: "policy",
        targetId: policy.body.data.id,
        inputs: { trigger: "pre-publish" }
      });
    expect(policySandbox.status).toBe(201);
    expect(policySandbox.body.data.kind).toBe("policy");
    expect(policySandbox.body.data.mode).toBe("dry-run");
    expect(typeof policySandbox.body.data.result.wouldCreateExceptions).toBe("number");

    const exceptionsAfter = await request(app).get("/v1/admin/policies/exceptions");
    expect(exceptionsAfter.status).toBe(200);
    expect(exceptionsAfter.body.data.length).toBe(exceptionsBefore.body.data.length);
    const workItemsAfter = await request(app).get("/v1/work-items");
    expect(workItemsAfter.status).toBe(200);
    expect(workItemsAfter.body.data.length).toBe(workItemsBefore.body.data.length);

    const workflowSandbox = await request(app)
      .post("/v1/admin/sandbox/runs")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        kind: "workflow",
        targetId: "wf-device-return-v1",
        inputs: { requesterId: "person-1" }
      });
    expect(workflowSandbox.status).toBe(201);
    expect(workflowSandbox.body.data.kind).toBe("workflow");
    expect(workflowSandbox.body.data.result.outcome).toBe("dry-run-complete");

    const runs = await request(app)
      .get("/v1/admin/sandbox/runs")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin");
    expect(runs.status).toBe(200);
    expect(runs.body.data.length).toBeGreaterThanOrEqual(2);
    expect(runs.body.data.some((item: { kind: string }) => item.kind === "policy")).toBe(true);
    expect(runs.body.data.some((item: { kind: string }) => item.kind === "workflow")).toBe(true);
  });

  it("blocks publishing policy/workflow config versions until sandbox readiness passes", async () => {
    const { app } = createApp();

    const policy = await request(app)
      .post("/v1/admin/policies")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: "Publish Gate Policy",
        description: "Used to validate config publish gating",
        objectType: "Device",
        severity: "medium",
        expression: {
          field: "encryption_state",
          operator: "equals",
          value: "enabled"
        },
        remediation: {
          notify: true,
          createTask: true
        },
        active: true
      });
    expect(policy.status).toBe(201);

    const config = await request(app)
      .post("/v1/admin/config-versions")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        kind: "policy",
        name: "Publish Gate Policy",
        targetKind: "policy",
        targetId: policy.body.data.id,
        reason: "Prepare publish gate test",
        payload: {}
      });
    expect(config.status).toBe(201);
    const versionId = config.body.data.id as string;

    const readinessBefore = await request(app)
      .get("/v1/admin/config-versions/readiness")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin");
    expect(readinessBefore.status).toBe(200);
    const beforeRow = readinessBefore.body.data.find((item: { versionId: string }) => item.versionId === versionId);
    expect(beforeRow.requiredSandbox).toBe(true);
    expect(beforeRow.ready).toBe(false);

    const blockedPublish = await request(app)
      .post(`/v1/admin/config-versions/${versionId}/state`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ state: "published", reason: "Attempt publish before sandbox" });
    expect(blockedPublish.status).toBe(409);
    expect(blockedPublish.body.error).toContain("Sandbox validation required");

    const sandbox = await request(app)
      .post("/v1/admin/sandbox/runs")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        kind: "policy",
        targetId: policy.body.data.id,
        inputs: { trigger: "pre-publish" }
      });
    expect(sandbox.status).toBe(201);

    const readinessAfter = await request(app)
      .get("/v1/admin/config-versions/readiness")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin");
    expect(readinessAfter.status).toBe(200);
    const afterRow = readinessAfter.body.data.find((item: { versionId: string }) => item.versionId === versionId);
    expect(afterRow.ready).toBe(true);
    expect(typeof afterRow.latestSandboxRunId).toBe("string");

    const published = await request(app)
      .post(`/v1/admin/config-versions/${versionId}/state`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ state: "published", reason: "Sandbox complete" });
    expect(published.status).toBe(200);
    expect(published.body.data.state).toBe("published");
  });

  it("supports exception action lifecycle", async () => {
    const { app } = createApp();

    const exceptions = await request(app).get("/v1/exceptions");
    expect(exceptions.status).toBe(200);
    expect(exceptions.body.data.length).toBeGreaterThan(0);

    const exceptionId = exceptions.body.data[0].id as string;
    const resolved = await request(app)
      .post(`/v1/exceptions/${exceptionId}/action`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ action: "resolve", reason: "Handled by endpoint team" });

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe("Completed");
  });

  it("enforces field-level masking and write restrictions", async () => {
    const { app } = createApp();

    const restriction = await request(app)
      .post("/v1/admin/rbac/field-restrictions")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        objectType: "Person",
        field: "compensation",
        readRoles: ["finance", "it-admin"],
        writeRoles: ["finance", "it-admin"],
        maskStyle: "redacted"
      });
    expect(restriction.status).toBe(201);

    const created = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Person",
        fields: {
          legal_name: "Sensitive User",
          email: "sensitive@example.com",
          compensation: 200000
        }
      });
    expect(created.status).toBe(201);

    const personId = created.body.data.id as string;
    const masked = await request(app)
      .get(`/v1/objects/${personId}`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent");
    expect(masked.status).toBe(200);
    expect(masked.body.data.fields.compensation).toBe("[REDACTED]");

    const updateDenied = await request(app)
      .patch(`/v1/objects/${personId}`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ fields: { compensation: 250000 } });
    expect(updateDenied.status).toBe(403);
  });

  it("applies manual field override with provenance and timeline evidence", async () => {
    const { app } = createApp();

    const created = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Device",
        fields: {
          serial_number: "SN-OVR-001",
          encryption_state: "enabled"
        }
      });
    expect(created.status).toBe(201);
    const objectId = created.body.data.id as string;

    const override = await request(app)
      .post(`/v1/objects/${objectId}/manual-override`)
      .set("x-actor-id", "sec-1")
      .set("x-actor-role", "security-analyst")
      .send({
        field: "encryption_state",
        value: "disabled",
        reason: "Investigative exception for forensics",
        overrideUntil: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
      });
    expect(override.status).toBe(200);
    expect(override.body.data.fields.encryption_state).toBe("disabled");

    const provenance = override.body.data.provenance.encryption_state as Array<{
      overriddenBy?: string;
      overrideReason?: string;
    }>;
    expect(Array.isArray(provenance)).toBe(true);
    expect(provenance[provenance.length - 1].overriddenBy).toBe("sec-1");
    expect(provenance[provenance.length - 1].overrideReason).toBe("Investigative exception for forensics");

    const timeline = await request(app).get(`/v1/timeline/${objectId}`);
    expect(timeline.status).toBe(200);
    expect(
      timeline.body.data.some((event: { eventType: string }) => event.eventType === "manual.override")
    ).toBe(true);
  });

  it("rejects invalid manual override expiry and respects field write restrictions", async () => {
    const { app } = createApp();

    const created = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Person",
        fields: {
          legal_name: "Override Target",
          compensation: 100000
        }
      });
    expect(created.status).toBe(201);
    const objectId = created.body.data.id as string;

    const restriction = await request(app)
      .post("/v1/admin/rbac/field-restrictions")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        objectType: "Person",
        field: "compensation",
        readRoles: ["finance", "it-admin"],
        writeRoles: ["finance", "it-admin"],
        maskStyle: "redacted"
      });
    expect(restriction.status).toBe(201);

    const invalidUntil = await request(app)
      .post(`/v1/objects/${objectId}/manual-override`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        field: "legal_name",
        value: "Override Applied",
        reason: "Testing expiry validation",
        overrideUntil: new Date(Date.now() - 60 * 1000).toISOString()
      });
    expect(invalidUntil.status).toBe(400);

    const denied = await request(app)
      .post(`/v1/objects/${objectId}/manual-override`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        field: "compensation",
        value: 150000,
        reason: "Attempt restricted override"
      });
    expect(denied.status).toBe(403);
  });

  it("updates catalog item without resetting defaulted fields", async () => {
    const { app } = createApp();

    const before = await request(app).get("/v1/catalog/items");
    expect(before.status).toBe(200);
    const existing = before.body.data.find((item: { id: string }) => item.id === "cat-laptop");
    expect(existing).toBeTruthy();

    const patched = await request(app)
      .patch("/v1/catalog/items/cat-laptop")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ description: "Updated laptop request description" });
    expect(patched.status).toBe(200);
    expect(patched.body.data.description).toBe("Updated laptop request description");
    expect(patched.body.data.audience.length).toBeGreaterThan(0);
    expect(patched.body.data.regions.length).toBeGreaterThan(0);
    expect(patched.body.data.formFields.length).toBeGreaterThan(0);
  });

  it("rejects catalog submit on SoD conflicts without creating work items", async () => {
    const { app } = createApp();

    const before = await request(app).get("/v1/work-items");
    expect(before.status).toBe(200);
    const beforeCount = before.body.data.length as number;

    const submitted = await request(app)
      .post("/v1/catalog/submit")
      .set("x-actor-id", "requester-1")
      .set("x-actor-role", "end-user")
      .send({
        catalogItemId: "cat-laptop",
        requesterId: "manager-approver",
        title: "Need standard laptop"
      });
    expect(submitted.status).toBe(409);

    const after = await request(app).get("/v1/work-items");
    expect(after.status).toBe(200);
    expect(after.body.data.length).toBe(beforeCount);
  });

  it("creates approval chain from catalog risk matrix", async () => {
    const { app } = createApp();

    const submitted = await request(app)
      .post("/v1/catalog/submit")
      .set("x-actor-id", "requester-2")
      .set("x-actor-role", "end-user")
      .send({
        catalogItemId: "cat-admin",
        requesterId: "person-1",
        title: "Need temporary admin privileges"
      });

    expect(submitted.status).toBe(201);
    const approvalTypes = submitted.body.data.approvals.map((item: { type: string }) => item.type);
    expect(approvalTypes).toContain("manager");
    expect(approvalTypes).toContain("security");
  });

  it("applies conditional approval matrix rules by region, tags, and linked object types", async () => {
    const { app } = createApp();

    const addRegionalRule = await request(app)
      .post("/v1/admin/rbac/approval-matrix")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        name: "EU device procurement finance gate",
        requestType: "Request",
        riskLevel: "medium",
        regions: ["eu"],
        requiredTags: ["devices"],
        approverTypes: ["finance"],
        enabled: true
      });
    expect(addRegionalRule.status).toBe(201);

    const addObjectTypeRule = await request(app)
      .post("/v1/admin/rbac/approval-matrix")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        name: "Device-linked request security review",
        requestType: "Request",
        riskLevel: "medium",
        linkedObjectTypes: ["Device"],
        approverTypes: ["security"],
        enabled: true
      });
    expect(addObjectTypeRule.status).toBe(201);

    const matched = await request(app)
      .post("/v1/catalog/submit")
      .set("x-actor-id", "requester-3")
      .set("x-actor-role", "end-user")
      .send({
        catalogItemId: "cat-laptop",
        requesterId: "person-1",
        title: "EU laptop request",
        fieldValues: {
          region: "eu",
          linked_object_types: ["Device"]
        }
      });
    expect(matched.status).toBe(201);
    const matchedTypes = matched.body.data.approvals.map((item: { type: string }) => item.type);
    expect(matchedTypes).toContain("manager");
    expect(matchedTypes).toContain("finance");
    expect(matchedTypes).toContain("security");

    const unmatched = await request(app)
      .post("/v1/catalog/submit")
      .set("x-actor-id", "requester-3")
      .set("x-actor-role", "end-user")
      .send({
        catalogItemId: "cat-laptop",
        requesterId: "person-1",
        title: "US laptop request",
        fieldValues: {
          region: "us",
          linked_object_types: ["SaaSAccount"]
        }
      });
    expect(unmatched.status).toBe(201);
    const unmatchedTypes = unmatched.body.data.approvals.map((item: { type: string }) => item.type);
    expect(unmatchedTypes).toContain("manager");
    expect(unmatchedTypes).not.toContain("finance");
    expect(unmatchedTypes).not.toContain("security");
  });

  it("simulates approval matrix routing and falls back when no rule matches", async () => {
    const { app } = createApp();

    const addRule = await request(app)
      .post("/v1/admin/rbac/approval-matrix")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        name: "EU high-cost device routing",
        requestType: "Request",
        riskLevel: "medium",
        costThreshold: 1000,
        regions: ["eu"],
        requiredTags: ["devices"],
        linkedObjectTypes: ["Device"],
        approverTypes: ["finance", "security"],
        enabled: true
      });
    expect(addRule.status).toBe(201);

    const matched = await request(app)
      .post("/v1/admin/rbac/approval-matrix/simulate")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        requestType: "Request",
        riskLevel: "medium",
        estimatedCost: 1500,
        region: "eu",
        tags: ["devices", "laptop"],
        linkedObjectTypes: ["Device"]
      });
    expect(matched.status).toBe(200);
    expect(matched.body.data.fallbackUsed).toBe(false);
    expect(matched.body.data.approverTypes).toContain("finance");
    expect(matched.body.data.approverTypes).toContain("security");
    expect(matched.body.data.matchedRules.length).toBeGreaterThanOrEqual(1);

    const fallback = await request(app)
      .post("/v1/admin/rbac/approval-matrix/simulate")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        requestType: "Incident",
        riskLevel: "high",
        estimatedCost: 200,
        region: "us",
        tags: ["software"],
        linkedObjectTypes: ["SaaSAccount"]
      });
    expect(fallback.status).toBe(200);
    expect(fallback.body.data.fallbackUsed).toBe(true);
    expect(fallback.body.data.approverTypes).toEqual(["manager"]);
    expect(fallback.body.data.matchedRules).toEqual([]);
  });

  it("supports request-info approval decision and sets work item to Waiting", async () => {
    const { app } = createApp();

    const submitted = await request(app)
      .post("/v1/catalog/submit")
      .set("x-actor-id", "requester-2")
      .set("x-actor-role", "end-user")
      .send({
        catalogItemId: "cat-admin",
        requesterId: "person-1",
        title: "Need temporary admin privileges for request-info path"
      });
    expect(submitted.status).toBe(201);
    const approvalId = submitted.body.data.approvals[0].id as string;
    const workItemId = submitted.body.data.workItem.id as string;

    const decided = await request(app)
      .post(`/v1/approvals/${approvalId}/decision`)
      .set("x-actor-id", "manager-approver")
      .set("x-actor-role", "it-admin")
      .send({
        decision: "info-requested",
        comment: "Need additional business justification and duration."
      });
    expect(decided.status).toBe(200);
    expect(decided.body.data.decision).toBe("info-requested");

    const approvals = await request(app).get("/v1/approvals").query({ workItemId });
    expect(approvals.status).toBe(200);
    const approval = approvals.body.data.find((item: { id: string }) => item.id === approvalId);
    expect(approval.decision).toBe("info-requested");

    const workItems = await request(app).get("/v1/work-items");
    const workItem = workItems.body.data.find((item: { id: string }) => item.id === workItemId);
    expect(workItem.status).toBe("Waiting");
  });

  it("accepts requester info response and reopens info-requested approvals", async () => {
    const { app } = createApp();

    const submitted = await request(app)
      .post("/v1/catalog/submit")
      .set("x-actor-id", "requester-2")
      .set("x-actor-role", "end-user")
      .send({
        catalogItemId: "cat-admin",
        requesterId: "person-1",
        title: "Need temporary admin privileges for responder loop"
      });
    expect(submitted.status).toBe(201);
    const approvalId = submitted.body.data.approvals[0].id as string;
    const workItemId = submitted.body.data.workItem.id as string;

    const requested = await request(app)
      .post(`/v1/approvals/${approvalId}/decision`)
      .set("x-actor-id", "manager-approver")
      .set("x-actor-role", "it-admin")
      .send({
        decision: "info-requested",
        comment: "Need stronger business rationale."
      });
    expect(requested.status).toBe(200);

    const responded = await request(app)
      .post(`/v1/work-items/${workItemId}/respond-info-request`)
      .set("x-actor-id", "person-1")
      .set("x-actor-role", "end-user")
      .send({
        body: "Admin access is required for migration incident triage for 72 hours.",
        attachment: {
          fileName: "migration-incident-context.pdf",
          url: "https://example.com/migration-incident-context.pdf"
        }
      });
    expect(responded.status).toBe(200);
    expect(responded.body.data.reopenedApprovalIds).toContain(approvalId);
    expect(responded.body.data.workItem.status).toBe("Submitted");

    const approvals = await request(app).get("/v1/approvals").query({ workItemId });
    expect(approvals.status).toBe(200);
    const reopened = approvals.body.data.find((item: { id: string }) => item.id === approvalId);
    expect(reopened.decision).toBe("pending");

    const workItems = await request(app).get("/v1/work-items");
    const workItem = workItems.body.data.find((item: { id: string }) => item.id === workItemId);
    expect(workItem.comments.some((comment: { body: string }) => comment.body.includes("Requester response:"))).toBe(true);
    expect(workItem.attachments.length).toBeGreaterThan(0);
  });

  it("evaluates any-of approval chains and supersedes pending peers", async () => {
    const { app } = createApp();

    const workItemResponse = await request(app)
      .post("/v1/work-items")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Request",
        priority: "P2",
        title: "Approval chain any-mode test",
        requesterId: "person-1",
        assignmentGroup: "Access Ops"
      });
    expect(workItemResponse.status).toBe(201);
    const workItemId = workItemResponse.body.data.id as string;

    const chain = await request(app)
      .post("/v1/approvals/chains")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        workItemId,
        mode: "any",
        approvals: [
          { type: "manager", approverId: "manager-approver" },
          { type: "security", approverId: "security-approver" }
        ],
        reason: "Test parallel any-of behavior"
      });
    expect(chain.status).toBe(201);
    expect(chain.body.data.approvals.length).toBe(2);

    const firstApprovalId = chain.body.data.approvals[0].id as string;
    const decide = await request(app)
      .post(`/v1/approvals/${firstApprovalId}/decision`)
      .set("x-actor-id", "manager-approver")
      .set("x-actor-role", "it-admin")
      .send({
        decision: "approved",
        comment: "Approved by manager"
      });
    expect(decide.status).toBe(200);

    const approvals = await request(app).get("/v1/approvals").query({ workItemId });
    expect(approvals.status).toBe(200);
    const approved = approvals.body.data.find((item: { decision: string; id: string }) => item.id === firstApprovalId);
    expect(approved.decision).toBe("approved");
    const superseded = approvals.body.data.find(
      (item: { id: string; decision: string; comment?: string }) =>
        item.id !== firstApprovalId &&
        item.decision === "expired" &&
        item.comment?.includes("Superseded by any-of approval chain decision")
    );
    expect(superseded).toBeTruthy();

    const workItems = await request(app).get("/v1/work-items");
    const workItem = workItems.body.data.find((item: { id: string }) => item.id === workItemId);
    expect(workItem.status).toBe("In Progress");
  });

  it("keeps all-of approval chains pending until every approval is approved", async () => {
    const { app } = createApp();

    const workItemResponse = await request(app)
      .post("/v1/work-items")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Change",
        priority: "P1",
        title: "Approval chain all-mode test",
        description: "Change requires manager and security approvals.",
        requesterId: "person-1",
        assignmentGroup: "Access Ops",
        linkedObjectIds: ["obj-1"],
        tags: ["vip"]
      });
    expect(workItemResponse.status).toBe(201);
    const workItemId = workItemResponse.body.data.id as string;

    const chain = await request(app)
      .post("/v1/approvals/chains")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        workItemId,
        mode: "all",
        approvals: [
          { type: "manager", approverId: "manager-approver" },
          { type: "security", approverId: "security-approver" }
        ]
      });
    expect(chain.status).toBe(201);

    const firstApprovalId = chain.body.data.approvals[0].id as string;
    const secondApprovalId = chain.body.data.approvals[1].id as string;

    const firstApprove = await request(app)
      .post(`/v1/approvals/${firstApprovalId}/decision`)
      .set("x-actor-id", "manager-approver")
      .set("x-actor-role", "it-admin")
      .send({ decision: "approved", comment: "Manager approved." });
    expect(firstApprove.status).toBe(200);

    const midWorkItems = await request(app).get("/v1/work-items");
    const midWorkItem = midWorkItems.body.data.find((item: { id: string }) => item.id === workItemId);
    expect(midWorkItem.status).toBe("Submitted");

    const secondApprove = await request(app)
      .post(`/v1/approvals/${secondApprovalId}/decision`)
      .set("x-actor-id", "security-approver")
      .set("x-actor-role", "it-admin")
      .send({ decision: "approved", comment: "Security approved." });
    expect(secondApprove.status).toBe(200);

    const finalWorkItems = await request(app).get("/v1/work-items");
    const finalWorkItem = finalWorkItems.body.data.find((item: { id: string }) => item.id === workItemId);
    expect(finalWorkItem.status).toBe("In Progress");
  });

  it("returns approval inbox context with risk and recommendation hints", async () => {
    const { app } = createApp();

    const workItemResponse = await request(app)
      .post("/v1/work-items")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Request",
        priority: "P1",
        title: "Approval inbox context test",
        description: "Need sensitive access with supporting details",
        requesterId: "person-1",
        assignmentGroup: "Access Ops",
        linkedObjectIds: ["obj-2"],
        tags: ["vip"]
      });
    expect(workItemResponse.status).toBe(201);
    const workItemId = workItemResponse.body.data.id as string;

    const chain = await request(app)
      .post("/v1/approvals/chains")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        workItemId,
        mode: "all",
        approvals: [{ type: "manager", approverId: "manager-approver" }]
      });
    expect(chain.status).toBe(201);

    const inbox = await request(app)
      .get("/v1/approvals/inbox")
      .set("x-actor-id", "manager-approver")
      .set("x-actor-role", "it-admin")
      .query({ approverId: "manager-approver", includeContext: true });
    expect(inbox.status).toBe(200);
    const match = inbox.body.data.find((item: { workItem?: { id: string } }) => item.workItem?.id === workItemId);
    expect(match).toBeTruthy();
    expect(match.riskLevel).toBe("high");
    expect(["approve", "request-info", "reject"]).toContain(match.recommendedDecision);
    expect(typeof match.evidenceSummary).toBe("string");
  });

  it("expires timed-out approvals and escalates them to fallback approver", async () => {
    const { app } = createApp();

    const submitted = await request(app)
      .post("/v1/catalog/submit")
      .set("x-actor-id", "requester-2")
      .set("x-actor-role", "end-user")
      .send({
        catalogItemId: "cat-admin",
        requesterId: "person-1",
        title: "Need temporary admin privileges for escalation test"
      });
    expect(submitted.status).toBe(201);
    expect(submitted.body.data.approvals.length).toBeGreaterThan(0);

    const approvalId = submitted.body.data.approvals[0].id as string;
    const setExpiry = await request(app)
      .post(`/v1/approvals/${approvalId}/expiry`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ expiresAt: new Date(Date.now() - 60 * 1000).toISOString() });
    expect(setExpiry.status).toBe(200);

    const dryRun = await request(app)
      .post("/v1/approvals/escalations/run")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ fallbackApproverId: "security-escalation", dryRun: true });
    expect(dryRun.status).toBe(200);
    expect(dryRun.body.data.expiredCount).toBeGreaterThanOrEqual(1);
    expect(dryRun.body.data.escalatedCount).toBe(0);

    const liveRun = await request(app)
      .post("/v1/approvals/escalations/run")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ fallbackApproverId: "security-escalation", dryRun: false });
    expect(liveRun.status).toBe(200);
    expect(liveRun.body.data.expiredCount).toBeGreaterThanOrEqual(1);
    expect(liveRun.body.data.escalatedCount).toBeGreaterThanOrEqual(1);

    const approvals = await request(app).get("/v1/approvals").query({ workItemId: submitted.body.data.workItem.id });
    expect(approvals.status).toBe(200);

    const original = approvals.body.data.find((item: { id: string }) => item.id === approvalId);
    expect(original.decision).toBe("expired");

    const escalated = approvals.body.data.find(
      (item: { id: string; approverId: string; decision: string }) =>
        item.id !== approvalId && item.approverId === "security-escalation" && item.decision === "pending"
    );
    expect(escalated).toBeTruthy();
  });

  it("returns cloud tag coverage with noncompliant resources", async () => {
    const { app } = createApp();

    const response = await request(app)
      .get("/v1/cloud/tag-governance/coverage")
      .set("x-actor-id", "sec-1")
      .set("x-actor-role", "security-analyst");

    expect(response.status).toBe(200);
    expect(response.body.data.totalResources).toBeGreaterThan(0);
    expect(response.body.data.nonCompliantResources).toBeGreaterThan(0);
    expect(typeof response.body.data.autoTagReadyResources).toBe("number");
    expect(typeof response.body.data.approvalRequiredResources).toBe("number");
    expect(Array.isArray(response.body.data.nonCompliant[0].tagSuggestions)).toBe(true);
  });

  it("runs cloud tag enforcement in dry-run and live modes", async () => {
    const { app } = createApp();

    const before = await request(app).get("/v1/work-items");
    const beforeExceptions = (before.body.data as Array<{ type: string }>).filter((item) => item.type === "Exception")
      .length;

    const dryRun = await request(app)
      .post("/v1/cloud/tag-governance/enforce")
      .set("x-actor-id", "operator-1")
      .set("x-actor-role", "it-agent")
      .send({ dryRun: true, autoTag: true });

    expect(dryRun.status).toBe(200);
    expect(dryRun.body.data.mode).toBe("dry-run");

    const afterDryRun = await request(app).get("/v1/work-items");
    const afterDryRunExceptions = (afterDryRun.body.data as Array<{ type: string }>).filter(
      (item) => item.type === "Exception"
    ).length;
    expect(afterDryRunExceptions).toBe(beforeExceptions);

    const live = await request(app)
      .post("/v1/cloud/tag-governance/enforce")
      .set("x-actor-id", "operator-1")
      .set("x-actor-role", "it-agent")
      .send({ dryRun: false, autoTag: true });
    expect(live.status).toBe(200);
    expect(live.body.data.mode).toBe("live");
    expect(live.body.data.exceptionsCreated).toBeGreaterThan(0);
    expect(typeof live.body.data.approvalsCreated).toBe("number");

    const afterLive = await request(app).get("/v1/work-items");
    const afterLiveExceptions = (afterLive.body.data as Array<{ type: string }>).filter((item) => item.type === "Exception")
      .length;
    expect(afterLiveExceptions).toBeGreaterThan(beforeExceptions);
  });

  it("creates approval-gated cloud remediation for medium-confidence mappings", async () => {
    const { app } = createApp();

    const run = await request(app)
      .post("/v1/cloud/tag-governance/enforce")
      .set("x-actor-id", "operator-1")
      .set("x-actor-role", "it-agent")
      .send({
        dryRun: false,
        autoTag: true,
        autoTagMinConfidence: 0.95,
        approvalGatedConfidenceFloor: 0.6,
        requireApprovalForMediumConfidence: true,
        approvalType: "security",
        approvalAssigneeId: "security-approver"
      });

    expect(run.status).toBe(200);
    expect(run.body.data.mode).toBe("live");
    expect(run.body.data.approvalsCreated).toBeGreaterThan(0);
    expect(run.body.data.approvalWorkItemsCreated).toBeGreaterThan(0);

    const approvalRemediation = run.body.data.remediations.find(
      (item: { approvalId?: string; approvalWorkItemId?: string }) => item.approvalId && item.approvalWorkItemId
    );
    expect(approvalRemediation).toBeTruthy();
    if (!approvalRemediation) {
      throw new Error("Expected an approval-gated remediation record");
    }
    expect(approvalRemediation.approvalRequired.length).toBeGreaterThan(0);

    const approvals = await request(app)
      .get("/v1/approvals")
      .set("x-actor-id", "security-1")
      .set("x-actor-role", "security-analyst");
    expect(approvals.status).toBe(200);
    const approval = approvals.body.data.find((item: { id: string }) => item.id === approvalRemediation.approvalId);
    expect(approval).toBeTruthy();
    expect(approval.decision).toBe("pending");

    const workItems = await request(app)
      .get("/v1/work-items")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent");
    expect(workItems.status).toBe(200);
    const change = workItems.body.data.find((item: { id: string }) => item.id === approvalRemediation.approvalWorkItemId);
    expect(change).toBeTruthy();
    expect(change.type).toBe("Change");
    expect(change.status).toBe("Waiting");
  });

  it("applies approved cloud remediation runs and updates resource tags", async () => {
    const { app } = createApp();

    const customCloud = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "CloudResource",
        fields: {
          provider: "AWS",
          resource_type: "ec2.instance",
          name: "dev-runner-01",
          region: "us-east-1",
          team_owner: "cloud-platform",
          tags: {}
        }
      });
    expect(customCloud.status).toBe(201);
    const resourceId = customCloud.body.data.id as string;

    const run = await request(app)
      .post("/v1/cloud/tag-governance/enforce")
      .set("x-actor-id", "operator-1")
      .set("x-actor-role", "it-agent")
      .send({
        requiredTags: ["owner"],
        dryRun: false,
        autoTag: true,
        autoTagMinConfidence: 0.9,
        approvalGatedConfidenceFloor: 0.6,
        requireApprovalForMediumConfidence: true,
        approvalType: "security",
        approvalAssigneeId: "security-approver"
      });
    expect(run.status).toBe(200);
    expect(run.body.data.runId).toBeTruthy();

    const remediation = run.body.data.remediations.find(
      (item: { resourceId: string; approvalId?: string; approvalWorkItemId?: string }) =>
        item.resourceId === resourceId && item.approvalId && item.approvalWorkItemId
    );
    expect(remediation).toBeTruthy();
    if (!remediation) {
      throw new Error("Expected approval remediation for custom cloud resource");
    }

    const approve = await request(app)
      .post(`/v1/approvals/${remediation.approvalId}/decision`)
      .set("x-actor-id", "security-approver")
      .set("x-actor-role", "it-admin")
      .send({ decision: "approved" });
    expect(approve.status).toBe(200);

    const applied = await request(app)
      .post(`/v1/cloud/tag-governance/runs/${run.body.data.runId}/apply`)
      .set("x-actor-id", "operator-1")
      .set("x-actor-role", "it-agent")
      .send({});
    expect(applied.status).toBe(200);
    expect(["applied", "partial"]).toContain(applied.body.data.status);
    expect(applied.body.data.appliedResources).toBeGreaterThan(0);
    expect(applied.body.data.applySummary.appliedDelta).toBeGreaterThan(0);

    const resource = await request(app)
      .get(`/v1/objects/${resourceId}`)
      .set("x-actor-id", "operator-1")
      .set("x-actor-role", "it-agent");
    expect(resource.status).toBe(200);
    expect(resource.body.data.fields.tags.owner).toBe("cloud-platform");

    const workItems = await request(app).get("/v1/work-items");
    const approvalChange = workItems.body.data.find((item: { id: string }) => item.id === remediation.approvalWorkItemId);
    expect(approvalChange).toBeTruthy();
    expect(approvalChange.status).toBe("Completed");

    const runs = await request(app)
      .get("/v1/cloud/tag-governance/runs")
      .set("x-actor-id", "operator-1")
      .set("x-actor-role", "it-agent");
    expect(runs.status).toBe(200);
    expect(runs.body.data.some((item: { id: string }) => item.id === run.body.data.runId)).toBe(true);
  });

  it("returns 404 when evidence export target work item does not exist", async () => {
    const { app } = createApp();
    const response = await request(app)
      .get("/v1/evidence/missing-work-item")
      .set("x-actor-id", "aud-1")
      .set("x-actor-role", "auditor");
    expect(response.status).toBe(404);
  });

  it("supports policy exception waiver lifecycle actions", async () => {
    const { app } = createApp();

    const policy = await request(app)
      .post("/v1/admin/policies")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: "Intentional fail policy",
        description: "Generate an exception for lifecycle testing",
        objectType: "Device",
        severity: "medium",
        expression: {
          field: "encryption_state",
          operator: "equals",
          value: "disabled"
        },
        remediation: {
          notify: true,
          createTask: false
        },
        active: true
      });
    expect(policy.status).toBe(201);

    const evaluated = await request(app)
      .post(`/v1/admin/policies/${policy.body.data.id}/evaluate`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({});
    expect(evaluated.status).toBe(200);
    expect(evaluated.body.data.exceptionCount).toBeGreaterThan(0);

    const listed = await request(app)
      .get(`/v1/admin/policies/${policy.body.data.id}/exceptions`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin");
    expect(listed.status).toBe(200);
    const exceptionId = listed.body.data[0].id as string;

    const missingExpiry = await request(app)
      .post(`/v1/admin/policies/exceptions/${exceptionId}/action`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ action: "waive", reason: "Approved exception" });
    expect(missingExpiry.status).toBe(400);

    const waived = await request(app)
      .post(`/v1/admin/policies/exceptions/${exceptionId}/action`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        action: "waive",
        reason: "Temporary exception approved",
        waiverExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      });
    expect(waived.status).toBe(200);
    expect(waived.body.data.status).toBe("waived");

    const filtered = await request(app)
      .get("/v1/admin/policies/exceptions")
      .query({ status: "waived" })
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin");
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.some((item: { id: string }) => item.id === exceptionId)).toBe(true);

    const reopened = await request(app)
      .post(`/v1/admin/policies/exceptions/${exceptionId}/action`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ action: "reopen", reason: "Waiver expired" });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.status).toBe("open");

    const resolved = await request(app)
      .post(`/v1/admin/policies/exceptions/${exceptionId}/action`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ action: "resolve", reason: "Compliant now" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe("resolved");
  });

  it("manages SaaS reclaim policies", async () => {
    const { app } = createApp();

    const list = await request(app).get("/v1/saas/reclaim/policies");
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);

    const created = await request(app)
      .post("/v1/saas/reclaim/policies")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: "Slack reclaim policy",
        appName: "Slack",
        inactivityDays: 21,
        warningDays: 5,
        autoReclaim: false,
        schedule: "weekly",
        enabled: true
      });
    expect(created.status).toBe(201);

    const patched = await request(app)
      .patch(`/v1/saas/reclaim/policies/${created.body.data.id}`)
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({ autoReclaim: true, inactivityDays: 30 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.autoReclaim).toBe(true);
    expect(patched.body.data.inactivityDays).toBe(30);
  });

  it("runs and retries SaaS reclaim workflow", async () => {
    const { app } = createApp();

    const policies = await request(app).get("/v1/saas/reclaim/policies");
    expect(policies.status).toBe(200);
    const policyId = policies.body.data[0].id as string;

    const dryRun = await request(app)
      .post("/v1/saas/reclaim/runs")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ policyId, mode: "dry-run" });
    expect(dryRun.status).toBe(201);
    expect(dryRun.body.data.mode).toBe("dry-run");
    expect(typeof dryRun.body.data.candidateCount).toBe("number");

    const liveRun = await request(app)
      .post("/v1/saas/reclaim/runs")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ policyId, mode: "live" });
    expect(liveRun.status).toBe(201);
    expect(["success", "failed", "partial"]).toContain(liveRun.body.data.status);

    const listedRuns = await request(app).get("/v1/saas/reclaim/runs").query({ policyId });
    expect(listedRuns.status).toBe(200);
    expect(listedRuns.body.data.length).toBeGreaterThan(0);

    const retried = await request(app)
      .post(`/v1/saas/reclaim/runs/${liveRun.body.data.id}/retry`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ mode: "live" });
    expect(retried.status).toBe(201);
    expect(["retry", "dry-run"]).toContain(retried.body.data.mode);
  });

  it("returns contract renewal overview for upcoming contracts", async () => {
    const { app } = createApp();

    const overview = await request(app)
      .get("/v1/contracts/renewals/overview")
      .query({ daysAhead: 90 })
      .set("x-actor-id", "fin-1")
      .set("x-actor-role", "finance");

    expect(overview.status).toBe(200);
    expect(overview.body.data.scannedContracts).toBeGreaterThan(0);
    expect(overview.body.data.dueContracts).toBeGreaterThan(0);
    expect(Array.isArray(overview.body.data.candidates)).toBe(true);
  });

  it("runs contract renewal reminders and stores run history", async () => {
    const { app } = createApp();

    const dryRun = await request(app)
      .post("/v1/contracts/renewals/runs")
      .set("x-actor-id", "proc-1")
      .set("x-actor-role", "it-agent")
      .send({ mode: "dry-run", daysAhead: 90 });

    expect(dryRun.status).toBe(201);
    expect(dryRun.body.data.mode).toBe("dry-run");
    expect(dryRun.body.data.tasksCreated).toBe(0);

    const liveRun = await request(app)
      .post("/v1/contracts/renewals/runs")
      .set("x-actor-id", "proc-1")
      .set("x-actor-role", "it-agent")
      .send({ mode: "live", daysAhead: 90 });

    expect(liveRun.status).toBe(201);
    expect(["success", "failed", "partial"]).toContain(liveRun.body.data.status);
    expect(liveRun.body.data.dueContracts).toBeGreaterThan(0);

    const runs = await request(app).get("/v1/contracts/renewals/runs");
    expect(runs.status).toBe(200);
    expect(runs.body.data.length).toBeGreaterThan(0);
  });

  it("creates report definitions and executes report runs with export artifact", async () => {
    const { app } = createApp();

    const created = await request(app)
      .post("/v1/reports/definitions")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        name: "Device inventory report",
        description: "Inventory export for devices",
        objectType: "Device",
        filters: {
          containsText: "asset_tag",
          fieldEquals: {}
        },
        columns: ["id", "type", "asset_tag", "serial_number"],
        schedule: {
          frequency: "weekly",
          hourUtc: 12
        },
        enabled: true
      });
    expect(created.status).toBe(201);
    const definitionId = created.body.data.id as string;

    const run = await request(app)
      .post(`/v1/reports/definitions/${definitionId}/run`)
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({ trigger: "manual" });
    expect(run.status).toBe(201);
    expect(run.body.data.rowCount).toBeGreaterThanOrEqual(1);

    const listedRuns = await request(app).get("/v1/reports/runs").query({ definitionId });
    expect(listedRuns.status).toBe(200);
    expect(listedRuns.body.data.length).toBeGreaterThan(0);

    const exportArtifact = await request(app).get(`/v1/reports/runs/${run.body.data.id}/export`);
    expect(exportArtifact.status).toBe(200);
    expect(typeof exportArtifact.body.data.content).toBe("string");
    expect(exportArtifact.body.data.content.includes("asset_tag")).toBe(true);
  });

  it("applies queue bulk actions across selected work items", async () => {
    const { app } = createApp();

    const createdOne = await request(app)
      .post("/v1/work-items")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Request",
        priority: "P3",
        title: "Bulk test item one",
        requesterId: "person-1",
        linkedObjectIds: [],
        tags: []
      });
    expect(createdOne.status).toBe(201);

    const createdTwo = await request(app)
      .post("/v1/work-items")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Incident",
        priority: "P3",
        title: "Bulk test item two",
        requesterId: "person-2",
        linkedObjectIds: [],
        tags: []
      });
    expect(createdTwo.status).toBe(201);

    const ids = [createdOne.body.data.id, createdTwo.body.data.id] as string[];

    const assign = await request(app)
      .post("/v1/work-items/bulk")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        workItemIds: ids,
        action: "assign",
        assigneeId: "agent-9",
        assignmentGroup: "Endpoint Ops"
      });
    expect(assign.status).toBe(200);
    expect(assign.body.data.updatedCount).toBe(2);

    const priority = await request(app)
      .post("/v1/work-items/bulk")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        workItemIds: ids,
        action: "priority",
        priority: "P1"
      });
    expect(priority.status).toBe(200);

    const tagged = await request(app)
      .post("/v1/work-items/bulk")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        workItemIds: ids,
        action: "tag",
        tag: "bulk-updated"
      });
    expect(tagged.status).toBe(200);

    const commented = await request(app)
      .post("/v1/work-items/bulk")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        workItemIds: ids,
        action: "comment",
        comment: "Bulk comment applied"
      });
    expect(commented.status).toBe(200);

    const advanced = await request(app)
      .post("/v1/work-items/bulk")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        workItemIds: ids,
        action: "workflow-step",
        workflowStep: "triage"
      });
    expect(advanced.status).toBe(200);

    const listed = await request(app).get("/v1/work-items");
    const updated = listed.body.data.filter((item: { id: string }) => ids.includes(item.id));
    expect(updated.length).toBe(2);
    expect(updated.every((item: { assigneeId?: string }) => item.assigneeId === "agent-9")).toBe(true);
    expect(updated.every((item: { assignmentGroup?: string }) => item.assignmentGroup === "Endpoint Ops")).toBe(true);
    expect(updated.every((item: { priority: string }) => item.priority === "P1")).toBe(true);
    expect(updated.every((item: { status: string }) => item.status === "Triaged")).toBe(true);
    expect(updated.every((item: { tags: string[] }) => item.tags.includes("bulk-updated"))).toBe(true);
    expect(updated.every((item: { comments: Array<{ body: string }> }) => item.comments.some((comment) => comment.body === "Bulk comment applied"))).toBe(true);
  });

  it("exports selected queue work items and validates bulk action payloads", async () => {
    const { app } = createApp();

    const workItems = await request(app).get("/v1/work-items");
    expect(workItems.status).toBe(200);
    const ids = (workItems.body.data as Array<{ id: string }>).slice(0, 2).map((item) => item.id);
    expect(ids.length).toBeGreaterThan(0);

    const exported = await request(app)
      .post("/v1/work-items/bulk")
      .set("x-actor-id", "auditor-1")
      .set("x-actor-role", "auditor")
      .send({
        workItemIds: ids,
        action: "export"
      });
    expect(exported.status).toBe(200);
    expect(exported.body.data.format).toBe("csv");
    expect(typeof exported.body.data.content).toBe("string");
    expect(exported.body.data.content.includes("\"id\"")).toBe(true);

    const invalid = await request(app)
      .post("/v1/work-items/bulk")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        workItemIds: ids,
        action: "priority"
      });
    expect(invalid.status).toBe(400);
  });

  it("generates device lifecycle preview for service stage", async () => {
    const { app } = createApp();

    const devices = await request(app).get("/v1/objects").query({ type: "Device" });
    expect(devices.status).toBe(200);
    const deviceId = devices.body.data[0].id as string;

    const preview = await request(app)
      .post("/v1/device-lifecycle/preview")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        deviceId,
        targetStage: "service",
        location: "San Francisco",
        stockroom: "SF-HQ",
        remoteReturn: true,
        requesterId: "person-1",
        issueSummary: "Battery replacement"
      });

    expect(preview.status).toBe(201);
    expect(preview.body.data.plan.targetStage).toBe("service");
    expect(preview.body.data.plan.steps.length).toBeGreaterThan(0);
    expect(preview.body.data.plan.riskLevel).toBe("medium");
  });

  it("executes device lifecycle workflow for new device request and retire transition", async () => {
    const { app } = createApp();

    const created = await request(app)
      .post("/v1/device-lifecycle/execute")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        targetStage: "request",
        location: "Austin",
        stockroom: "ATX-1",
        remoteReturn: true,
        requesterId: "person-1",
        model: "ThinkPad T14",
        vendor: "Lenovo",
        reason: "New hire laptop request"
      });

    expect(created.status).toBe(201);
    expect(created.body.data.run.plan.targetStage).toBe("request");
    expect(created.body.data.createdObjectIds.length).toBeGreaterThan(0);
    const createdDeviceId = created.body.data.run.deviceId as string;

    const retire = await request(app)
      .post("/v1/device-lifecycle/execute")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        deviceId: createdDeviceId,
        targetStage: "retire",
        location: "Austin",
        stockroom: "ATX-1",
        remoteReturn: false,
        requesterId: "person-1",
        retirementReason: "End of refresh cycle",
        reason: "Retire aging device"
      });

    expect(retire.status).toBe(201);
    expect(retire.body.data.workItem.type).toBe("Change");
    expect(retire.body.data.approvalIds.length).toBeGreaterThan(0);
    expect(retire.body.data.taskIds.length).toBeGreaterThan(0);

    const device = await request(app).get(`/v1/objects/${createdDeviceId}`);
    expect(device.status).toBe(200);
    expect(device.body.data.fields.lifecycle_stage).toBe("retire");
    expect(device.body.data.fields.status).toBe("Disposed");

    const runs = await request(app).get("/v1/device-lifecycle/runs").query({ deviceId: createdDeviceId });
    expect(runs.status).toBe(200);
    expect(runs.body.data.length).toBeGreaterThan(0);
  });

  it("generates JML joiner preview with baseline entitlements and steps", async () => {
    const { app } = createApp();

    const preview = await request(app)
      .post("/v1/jml/joiner/preview")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        legalName: "Alex Onboard",
        email: "alex.onboard@example.com",
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        location: "San Francisco",
        role: "engineer",
        managerId: "manager-approver",
        employmentType: "employee",
        requiredApps: ["Figma"],
        deviceTypePreference: "laptop",
        remote: true,
        requesterId: "person-1"
      });

    expect(preview.status).toBe(201);
    expect(preview.body.data.plan.email).toBe("alex.onboard@example.com");
    expect(preview.body.data.plan.baselineGroups.length).toBeGreaterThan(0);
    expect(preview.body.data.plan.steps.length).toBeGreaterThan(0);
    expect(preview.body.data.plan.approvalsRequired).toContain("manager");
  });

  it("executes JML joiner flow and creates person, identity, device, and onboarding tasks", async () => {
    const { app } = createApp();

    const executed = await request(app)
      .post("/v1/jml/joiner/execute")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        legalName: "Priya Hire",
        email: "priya.hire@example.com",
        startDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        location: "New York",
        role: "manager",
        managerId: "manager-approver",
        employmentType: "contractor",
        requiredApps: ["Figma", "Notion"],
        deviceTypePreference: "desktop",
        remote: false,
        requesterId: "person-1",
        reason: "Onboarding approved"
      });

    expect(executed.status).toBe(201);
    expect(executed.body.data.workItem.type).toBe("Request");
    expect(executed.body.data.approvalIds.length).toBeGreaterThan(0);
    expect(executed.body.data.taskIds.length).toBeGreaterThan(0);
    expect(executed.body.data.createdObjectIds.length).toBeGreaterThanOrEqual(3);

    const run = executed.body.data.run;
    expect(run.plan.legalName).toBe("Priya Hire");
    expect(run.personId).toBeDefined();

    const person = await request(app).get(`/v1/objects/${run.personId as string}`);
    expect(person.status).toBe(200);
    expect(person.body.data.type).toBe("Person");
    expect(person.body.data.fields.status).toBe("pre-hire");

    const relationships = await request(app).get("/v1/relationships").query({ objectId: run.personId as string });
    expect(relationships.status).toBe(200);
    expect(
      (relationships.body.data as Array<{ type: string }>).some((relationship) => relationship.type === "has_identity")
    ).toBe(true);
    expect(
      (relationships.body.data as Array<{ type: string }>).some((relationship) => relationship.type === "assigned_to")
    ).toBe(true);

    const runs = await request(app).get("/v1/jml/joiner/runs").query({ email: "priya.hire@example.com" });
    expect(runs.status).toBe(200);
    expect(runs.body.data.length).toBeGreaterThan(0);
  });

  it("generates JML mover preview with entitlement diff", async () => {
    const { app } = createApp();

    const people = await request(app).get("/v1/objects").query({ type: "Person" });
    expect(people.status).toBe(200);
    const personId = people.body.data[0].id as string;

    const preview = await request(app)
      .post("/v1/jml/mover/preview")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        personId,
        targetRole: "manager",
        targetDepartment: "Product",
        targetLocation: "New York",
        requesterId: "person-1"
      });

    expect(preview.status).toBe(201);
    expect(preview.body.data.plan.targetRole).toBe("manager");
    expect(Array.isArray(preview.body.data.plan.addGroups)).toBe(true);
  });

  it("executes JML mover flow and creates change work item with approvals/tasks", async () => {
    const { app } = createApp();

    const people = await request(app).get("/v1/objects").query({ type: "Person" });
    const personId = people.body.data[0].id as string;

    const executed = await request(app)
      .post("/v1/jml/mover/execute")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        personId,
        targetRole: "manager",
        targetDepartment: "Product",
        targetLocation: "New York",
        requesterId: "person-1",
        reason: "Role change approved"
      });

    expect(executed.status).toBe(201);
    expect(executed.body.data.workItem.type).toBe("Change");
    expect(executed.body.data.approvalIds.length).toBeGreaterThan(0);
    expect(executed.body.data.taskIds.length).toBeGreaterThan(0);

    const runs = await request(app).get("/v1/jml/mover/runs").query({ personId });
    expect(runs.status).toBe(200);
    expect(runs.body.data.length).toBeGreaterThan(0);
  });

  it("generates JML leaver preview including legal hold and unrecovered asset containment", async () => {
    const { app } = createApp();

    const people = await request(app).get("/v1/objects").query({ type: "Person" });
    expect(people.status).toBe(200);
    const personId = people.body.data[0].id as string;

    const preview = await request(app)
      .post("/v1/jml/leaver/preview")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        personId,
        requesterId: "person-1",
        effectiveDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        region: "DE",
        legalHold: true,
        vip: true,
        contractorConversion: false,
        deviceRecoveryState: "not-recovered"
      });

    expect(preview.status).toBe(201);
    expect(preview.body.data.plan.legalHold).toBe(true);
    expect(preview.body.data.plan.vip).toBe(true);
    expect(preview.body.data.plan.approvalsRequired).toContain("security");
    expect(preview.body.data.plan.steps.some((step: { id: string }) => step.id === "asset-containment-step")).toBe(true);
    expect(preview.body.data.plan.steps.some((step: { id: string }) => step.id === "regional-compliance-step")).toBe(true);
  });

  it("executes JML leaver flow and updates identities, SaaS, ownership, and devices", async () => {
    const { app } = createApp();

    const people = await request(app).get("/v1/objects").query({ type: "Person" });
    expect(people.status).toBe(200);
    const person = people.body.data[0];
    const personId = person.id as string;
    const email = String(person.fields.email ?? "");

    const identity = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Identity",
        fields: {
          person_id: personId,
          email,
          status: "active"
        }
      });
    expect(identity.status).toBe(201);

    const saasAccount = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "SaaSAccount",
        fields: {
          person: personId,
          app: "Figma",
          status: "active"
        }
      });
    expect(saasAccount.status).toBe(201);

    const license = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "License",
        fields: {
          app: "Figma",
          assigned_seats: 5,
          available_seats: 2
        }
      });
    expect(license.status).toBe(201);

    const ownedResource = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "CloudResource",
        fields: {
          name: "prod-app-node-1",
          owner: personId
        }
      });
    expect(ownedResource.status).toBe(201);

    const device = await request(app)
      .post("/v1/objects")
      .set("x-actor-id", "admin-1")
      .set("x-actor-role", "it-admin")
      .send({
        tenantId: "tenant-demo",
        workspaceId: "workspace-demo",
        type: "Device",
        fields: {
          serial_number: "SN-LEAVER-1",
          assigned_to_person_id: personId
        }
      });
    expect(device.status).toBe(201);

    const executed = await request(app)
      .post("/v1/jml/leaver/execute")
      .set("x-actor-id", "agent-1")
      .set("x-actor-role", "it-agent")
      .send({
        personId,
        requesterId: "person-1",
        effectiveDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        region: "US",
        legalHold: false,
        vip: true,
        contractorConversion: false,
        deviceRecoveryState: "not-recovered",
        reason: "Termination processed"
      });

    expect(executed.status).toBe(201);
    expect(executed.body.data.workItem.type).toBe("Change");
    expect(executed.body.data.approvalIds.length).toBeGreaterThan(0);
    expect(executed.body.data.taskIds.length).toBeGreaterThan(0);
    expect(executed.body.data.updatedObjects.identities).toBeGreaterThan(0);
    expect(executed.body.data.updatedObjects.saasAccounts).toBeGreaterThan(0);
    expect(executed.body.data.updatedObjects.devices).toBeGreaterThan(0);
    expect(executed.body.data.updatedObjects.ownershipTransfers).toBeGreaterThan(0);
    expect(executed.body.data.followUpIncidentId).toBeDefined();

    const personAfter = await request(app).get(`/v1/objects/${personId}`);
    expect(personAfter.status).toBe(200);
    expect(personAfter.body.data.fields.status).toBe("terminated");

    const identityAfter = await request(app).get(`/v1/objects/${identity.body.data.id as string}`);
    expect(identityAfter.status).toBe(200);
    expect(identityAfter.body.data.fields.status).toBe("suspended");

    const accountAfter = await request(app).get(`/v1/objects/${saasAccount.body.data.id as string}`);
    expect(accountAfter.status).toBe(200);
    expect(accountAfter.body.data.fields.status).toBe("deprovisioned");

    const licenseAfter = await request(app).get(`/v1/objects/${license.body.data.id as string}`);
    expect(licenseAfter.status).toBe(200);
    expect(licenseAfter.body.data.fields.assigned_seats).toBe(4);
    expect(licenseAfter.body.data.fields.available_seats).toBe(3);

    const runs = await request(app).get("/v1/jml/leaver/runs").query({ personId });
    expect(runs.status).toBe(200);
    expect(runs.body.data.length).toBeGreaterThan(0);
  });
});
