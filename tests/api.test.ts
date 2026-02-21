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
});
