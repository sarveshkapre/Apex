import { WorkflowDefinition } from "../domain/types";
import { nowIso } from "../utils/time";

export const p0WorkflowDefinitions: WorkflowDefinition[] = [
  {
    id: "wf-jml-joiner-v1",
    name: "JML Joiner - Baseline",
    version: 1,
    playbook: "JML",
    trigger: {
      kind: "event",
      value: "hris.hire"
    },
    steps: [
      {
        id: "create-identity",
        name: "Create identity",
        type: "automation",
        riskLevel: "medium",
        config: { actionName: "create_identity", targetSystem: "idp" }
      },
      {
        id: "assign-groups",
        name: "Assign baseline groups",
        type: "automation",
        riskLevel: "medium",
        config: { actionName: "assign_groups", targetSystem: "idp" }
      },
      {
        id: "device-assign",
        name: "Assign or procure device",
        type: "create-work-item",
        riskLevel: "low",
        config: { title: "Assign or procure device" }
      },
      {
        id: "welcome-notify",
        name: "Send welcome checklist",
        type: "notification",
        riskLevel: "low",
        config: { channel: "portal" }
      }
    ],
    active: true,
    createdAt: nowIso(),
    publishedAt: nowIso()
  },
  {
    id: "wf-jml-leaver-v1",
    name: "JML Leaver - Secure Offboarding",
    version: 1,
    playbook: "JML",
    trigger: {
      kind: "event",
      value: "hris.termination"
    },
    steps: [
      {
        id: "disable-identity",
        name: "Disable identity and sessions",
        type: "automation",
        riskLevel: "high",
        config: { actionName: "disable_identity", targetSystem: "idp" }
      },
      {
        id: "reclaim-saas",
        name: "Reclaim SaaS access",
        type: "automation",
        riskLevel: "medium",
        config: { actionName: "deprovision_saas", targetSystem: "saas" }
      },
      {
        id: "recover-device",
        name: "Start device recovery",
        type: "create-work-item",
        riskLevel: "low",
        config: { title: "Recover offboarding device" }
      },
      {
        id: "manager-approval",
        name: "Finalize offboarding",
        type: "approval",
        riskLevel: "medium",
        config: { approvalType: "manager" }
      }
    ],
    active: true,
    createdAt: nowIso(),
    publishedAt: nowIso()
  },
  {
    id: "wf-device-return-v1",
    name: "Device Lifecycle - Return",
    version: 1,
    playbook: "Device Lifecycle",
    trigger: {
      kind: "manual",
      value: "device.return"
    },
    steps: [
      {
        id: "create-return-kit",
        name: "Create return kit",
        type: "automation",
        riskLevel: "low",
        config: { actionName: "create_shipping_label", targetSystem: "shipping" }
      },
      {
        id: "notify-user",
        name: "Notify user",
        type: "notification",
        riskLevel: "low",
        config: { channel: "email" }
      },
      {
        id: "wipe-device",
        name: "Wipe and lock device",
        type: "automation",
        riskLevel: "high",
        config: { actionName: "wipe_lock_device", targetSystem: "mdm" }
      }
    ],
    active: true,
    createdAt: nowIso(),
    publishedAt: nowIso()
  },
  {
    id: "wf-saas-access-v1",
    name: "SaaS Access - Request",
    version: 1,
    playbook: "SaaS Governance",
    trigger: {
      kind: "manual",
      value: "catalog.saas_access"
    },
    steps: [
      {
        id: "approve-request",
        name: "Manager approval",
        type: "approval",
        riskLevel: "medium",
        config: { approvalType: "manager" }
      },
      {
        id: "provision-account",
        name: "Provision SaaS account",
        type: "automation",
        riskLevel: "medium",
        config: { actionName: "provision_saas_account", targetSystem: "saas" }
      }
    ],
    active: true,
    createdAt: nowIso(),
    publishedAt: nowIso()
  }
];
