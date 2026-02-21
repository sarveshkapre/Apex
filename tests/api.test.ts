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

  it("returns cloud tag coverage with noncompliant resources", async () => {
    const { app } = createApp();

    const response = await request(app)
      .get("/v1/cloud/tag-governance/coverage")
      .set("x-actor-id", "sec-1")
      .set("x-actor-role", "security-analyst");

    expect(response.status).toBe(200);
    expect(response.body.data.totalResources).toBeGreaterThan(0);
    expect(response.body.data.nonCompliantResources).toBeGreaterThan(0);
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

    const afterLive = await request(app).get("/v1/work-items");
    const afterLiveExceptions = (afterLive.body.data as Array<{ type: string }>).filter((item) => item.type === "Exception")
      .length;
    expect(afterLiveExceptions).toBeGreaterThan(beforeExceptions);
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
});
