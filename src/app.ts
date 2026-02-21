import express from "express";
import { createRoutes } from "./api/routes";
import { p0WorkflowDefinitions } from "./playbooks/p0";
import { ApexStore } from "./store/store";
import { nowIso } from "./utils/time";

export const createApp = (): { app: express.Express; store: ApexStore } => {
  const app = express();
  const store = new ApexStore();

  for (const def of p0WorkflowDefinitions) {
    store.workflowDefinitions.set(def.id, def);
  }

  const sampleDeviceId = store.createId();
  store.objects.set(sampleDeviceId, {
    id: sampleDeviceId,
    tenantId: "tenant-demo",
    workspaceId: "workspace-demo",
    type: "Device",
    fields: {
      asset_tag: "LAP-001",
      serial_number: "SN-001",
      compliance_state: "compliant",
      encryption_state: "enabled",
      last_checkin: nowIso(),
      location: "sf-office"
    },
    provenance: {},
    quality: {
      freshness: 1,
      completeness: 0.8,
      consistency: 1,
      coverage: 0.75
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  app.use(express.json());
  app.use("/v1", createRoutes(store));

  return { app, store };
};
