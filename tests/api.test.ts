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
});
