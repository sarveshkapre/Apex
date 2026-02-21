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

  const sampleRequestId = store.createId();
  store.workItems.set(sampleRequestId, {
    id: sampleRequestId,
    tenantId: "tenant-demo",
    workspaceId: "workspace-demo",
    type: "Request",
    status: "Submitted",
    priority: "P2",
    title: "Request Figma access",
    description: "Need editor role for design sprint",
    requesterId: "person-1",
    assigneeId: "agent-1",
    assignmentGroup: "Access Ops",
    linkedObjectIds: [sampleDeviceId],
    tags: ["access", "saas"],
    comments: [],
    attachments: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  const cloudResourceCompliantId = store.createId();
  store.objects.set(cloudResourceCompliantId, {
    id: cloudResourceCompliantId,
    tenantId: "tenant-demo",
    workspaceId: "workspace-demo",
    type: "CloudResource",
    fields: {
      provider: "AWS",
      resource_type: "ec2.instance",
      name: "prod-api-ec2-01",
      region: "us-west-2",
      owner: "platform-team",
      environment: "prod",
      cost_center: "ENG-001",
      tags: {
        owner: "platform-team",
        cost_center: "ENG-001",
        environment: "prod",
        data_classification: "internal"
      }
    },
    provenance: {},
    quality: {
      freshness: 0.95,
      completeness: 0.9,
      consistency: 0.95,
      coverage: 0.9
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  const cloudResourceMissingTagsId = store.createId();
  store.objects.set(cloudResourceMissingTagsId, {
    id: cloudResourceMissingTagsId,
    tenantId: "tenant-demo",
    workspaceId: "workspace-demo",
    type: "CloudResource",
    fields: {
      provider: "Azure",
      resource_type: "storage.account",
      name: "stage-artifacts-01",
      region: "eastus",
      owner: "data-platform",
      environment: "stage",
      tags: {
        owner: "data-platform"
      }
    },
    provenance: {},
    quality: {
      freshness: 0.83,
      completeness: 0.64,
      consistency: 0.88,
      coverage: 0.72
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  const cloudResourceOrphanId = store.createId();
  store.objects.set(cloudResourceOrphanId, {
    id: cloudResourceOrphanId,
    tenantId: "tenant-demo",
    workspaceId: "workspace-demo",
    type: "CloudResource",
    fields: {
      provider: "GCP",
      resource_type: "compute.instance",
      name: "unknown-owner-vm",
      region: "us-central1",
      tags: {}
    },
    provenance: {},
    quality: {
      freshness: 0.62,
      completeness: 0.42,
      consistency: 0.8,
      coverage: 0.5
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  const sampleApprovalId = store.createId();
  store.approvals.set(sampleApprovalId, {
    id: sampleApprovalId,
    tenantId: "tenant-demo",
    workspaceId: "workspace-demo",
    workItemId: sampleRequestId,
    type: "manager",
    approverId: "manager-approver",
    decision: "pending",
    createdAt: nowIso()
  });

  const sampleExceptionId = store.createId();
  store.workItems.set(sampleExceptionId, {
    id: sampleExceptionId,
    tenantId: "tenant-demo",
    workspaceId: "workspace-demo",
    type: "Exception",
    status: "Submitted",
    priority: "P1",
    title: "Connector sync failed: IdP",
    description: "Token refresh required before retry",
    requesterId: "system",
    assignmentGroup: "exceptions",
    linkedObjectIds: [sampleDeviceId],
    tags: ["automation-failed"],
    comments: [],
    attachments: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  app.use(express.json());
  app.use("/v1", createRoutes(store));

  return { app, store };
};
