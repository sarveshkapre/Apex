import { ApexStore } from "../store/store";
import { nowIso } from "../utils/time";
import { PolicyDefinition, PolicyException, WorkItem } from "../domain/types";

const compare = (
  source: unknown,
  operator: PolicyDefinition["expression"]["operator"],
  value: PolicyDefinition["expression"]["value"]
): boolean => {
  switch (operator) {
    case "equals":
      return String(source) === String(value);
    case "not_equals":
      return String(source) !== String(value);
    case "includes":
      return String(source ?? "").toLowerCase().includes(String(value ?? "").toLowerCase());
    case "exists":
      return source !== undefined && source !== null && String(source).length > 0;
    case "lt":
      return Number(source ?? 0) < Number(value ?? 0);
    case "gt":
      return Number(source ?? 0) > Number(value ?? 0);
    default:
      return false;
  }
};

export const evaluatePolicy = (store: ApexStore, policy: PolicyDefinition, actorId: string) => {
  const inScope = [...store.objects.values()].filter((object) => object.type === policy.objectType);
  const exceptions: PolicyException[] = [];

  for (const object of inScope) {
    const fieldValue = object.fields[policy.expression.field];
    const pass = compare(fieldValue, policy.expression.operator, policy.expression.value);
    if (pass) {
      continue;
    }

    const exception: PolicyException = {
      id: store.createId(),
      policyId: policy.id,
      objectId: object.id,
      reason: `Policy '${policy.name}' failed on field '${policy.expression.field}'`,
      status: "open",
      createdAt: nowIso()
    };

    store.policyExceptions.set(exception.id, exception);
    exceptions.push(exception);

    if (policy.remediation.createTask) {
      const task: WorkItem = {
        id: store.createId(),
        tenantId: policy.tenantId,
        workspaceId: policy.workspaceId,
        type: "Task",
        status: "Submitted",
        priority: policy.severity === "high" ? "P1" : "P2",
        title: `Remediate policy violation: ${policy.name}`,
        description: exception.reason,
        requesterId: actorId,
        assignmentGroup: "Policy Remediation",
        linkedObjectIds: [object.id],
        tags: ["policy", "remediation"],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      store.workItems.set(task.id, task);
    }

    store.pushTimeline({
      tenantId: policy.tenantId,
      workspaceId: policy.workspaceId,
      entityType: "policy",
      entityId: policy.id,
      eventType: "policy.evaluated",
      actor: actorId,
      createdAt: nowIso(),
      payload: {
        objectId: object.id,
        result: "failed",
        expression: policy.expression
      }
    });
  }

  return {
    policyId: policy.id,
    evaluatedCount: inScope.length,
    exceptionCount: exceptions.length,
    exceptions
  };
};

export const previewPolicyEvaluation = (store: ApexStore, policy: PolicyDefinition) => {
  const inScope = [...store.objects.values()].filter((object) => object.type === policy.objectType);
  const failedObjectIds: string[] = [];

  for (const object of inScope) {
    const fieldValue = object.fields[policy.expression.field];
    const pass = compare(fieldValue, policy.expression.operator, policy.expression.value);
    if (!pass) {
      failedObjectIds.push(object.id);
    }
  }

  return {
    policyId: policy.id,
    evaluatedCount: inScope.length,
    wouldCreateExceptions: failedObjectIds.length,
    wouldCreateTasks: policy.remediation.createTask ? failedObjectIds.length : 0,
    sampledFailedObjectIds: failedObjectIds.slice(0, 25)
  };
};
