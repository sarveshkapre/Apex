import { ApexStore } from "../store/store";
import { nowIso } from "../utils/time";
import { can } from "./rbac";
import {
  ActionExecutionLog,
  ApiActor,
  ApprovalRecord,
  ApprovalType,
  WorkflowRun,
  WorkItem
} from "../domain/types";

const toApprovalType = (raw: unknown): ApprovalType => {
  const value = String(raw ?? "it") as ApprovalType;
  if (["manager", "app-owner", "security", "finance", "it", "custom"].includes(value)) {
    return value;
  }
  return "it";
};

export class WorkflowEngine {
  constructor(private readonly store: ApexStore) {}

  startRun(
    definitionId: string,
    tenantId: string,
    workspaceId: string,
    inputs: Record<string, unknown>,
    actor: ApiActor,
    linkedWorkItemId?: string
  ): WorkflowRun {
    const definition = this.store.workflowDefinitions.get(definitionId);
    if (!definition || !definition.active) {
      throw new Error("Workflow definition not found or inactive");
    }

    const run: WorkflowRun = {
      id: this.store.createId(),
      tenantId,
      workspaceId,
      definitionId,
      status: "running",
      currentStepIndex: 0,
      inputs,
      linkedWorkItemId,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    this.store.workflowRuns.set(run.id, run);
    this.store.pushTimeline({
      tenantId,
      workspaceId,
      entityType: "workflow",
      entityId: run.id,
      eventType: "workflow.started",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { definitionId, linkedWorkItemId }
    });

    return this.advanceRun(run.id, actor);
  }

  advanceRun(runId: string, actor: ApiActor): WorkflowRun {
    const run = this.store.workflowRuns.get(runId);
    if (!run) {
      throw new Error("Workflow run not found");
    }

    const definition = this.store.workflowDefinitions.get(run.definitionId);
    if (!definition) {
      throw new Error("Workflow definition missing");
    }

    while (run.currentStepIndex < definition.steps.length) {
      const step = definition.steps[run.currentStepIndex];
      if (!step) {
        break;
      }

      if (step.riskLevel === "high" && !can(actor.role, "automation:high-risk")) {
        const approverId = String(step.config.approverId ?? "security-approver");
        this.requestApproval(run, actor.id, "security", step.name, approverId);
        run.status = "waiting-approval";
        run.updatedAt = nowIso();
        this.store.workflowRuns.set(run.id, run);
        return run;
      }

      if (step.type === "approval") {
        const approverId = String(step.config.approverId ?? `${String(step.config.approvalType ?? "it")}-approver`);
        this.requestApproval(run, actor.id, step.config.approvalType, step.name, approverId);
        run.status = "waiting-approval";
        run.updatedAt = nowIso();
        this.store.workflowRuns.set(run.id, run);
        return run;
      }

      try {
        this.executeStep(run.id, step.id, step.name, step.type, step.config, step.riskLevel, actor.id);
      } catch (error) {
        run.status = "failed";
        run.updatedAt = nowIso();
        this.store.workflowRuns.set(run.id, run);

        const exception: WorkItem = {
          id: this.store.createId(),
          tenantId: run.tenantId,
          workspaceId: run.workspaceId,
          type: "Exception",
          status: "Submitted",
          priority: "P1",
          title: `Automation failure: ${step.name}`,
          description: (error as Error).message,
          requesterId: actor.id,
          assignmentGroup: "exceptions",
          linkedObjectIds: [],
          tags: ["automation-failed"],
          comments: [],
          attachments: [],
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        this.store.workItems.set(exception.id, exception);

        this.store.pushTimeline({
          tenantId: run.tenantId,
          workspaceId: run.workspaceId,
          entityType: "work-item",
          entityId: exception.id,
          eventType: "exception.created",
          actor: actor.id,
          createdAt: nowIso(),
          payload: { workflowRunId: run.id, stepId: step.id }
        });

        return run;
      }

      run.currentStepIndex += 1;
      run.updatedAt = nowIso();
      this.store.workflowRuns.set(run.id, run);

      this.store.pushTimeline({
        tenantId: run.tenantId,
        workspaceId: run.workspaceId,
        entityType: "workflow",
        entityId: run.id,
        eventType: "workflow.step.executed",
        actor: actor.id,
        createdAt: nowIso(),
        payload: { stepId: step.id, stepName: step.name }
      });
    }

    run.status = "completed";
    run.updatedAt = nowIso();
    this.store.workflowRuns.set(run.id, run);

    this.store.pushTimeline({
      tenantId: run.tenantId,
      workspaceId: run.workspaceId,
      entityType: "workflow",
      entityId: run.id,
      eventType: "workflow.completed",
      actor: actor.id,
      createdAt: nowIso(),
      payload: {}
    });

    return run;
  }

  decideApproval(approvalId: string, actor: ApiActor, decision: "approved" | "rejected" | "info-requested", comment?: string): ApprovalRecord {
    if (!can(actor.role, "approval:decide")) {
      throw new Error("Permission denied for approvals");
    }

    const approval = this.store.approvals.get(approvalId);
    if (!approval) {
      throw new Error("Approval not found");
    }

    const canActAsApprover =
      approval.approverId === actor.id ||
      actor.role === "it-admin" ||
      actor.role === "security-analyst" ||
      actor.role === "finance";
    if (!canActAsApprover) {
      throw new Error("Permission denied: actor is not assigned approver");
    }

    if ((decision === "rejected" || decision === "info-requested") && (!comment || comment.trim().length === 0)) {
      throw new Error("Rejected and request-info decisions require a comment");
    }

    approval.decision = decision;
    approval.comment = comment;
    approval.decidedAt = nowIso();
    this.store.approvals.set(approval.id, approval);

    this.store.pushTimeline({
      tenantId: approval.tenantId,
      workspaceId: approval.workspaceId,
      entityType: "approval",
      entityId: approval.id,
      eventType: "approval.decided",
      actor: actor.id,
      createdAt: nowIso(),
      payload: { decision, comment }
    });

    const workItem = this.store.workItems.get(approval.workItemId);
    if (workItem) {
      if (decision === "rejected") {
        workItem.status = "Blocked";
      }
      if (decision === "info-requested") {
        workItem.status = "Waiting";
        if (comment) {
          workItem.comments.push({
            id: this.store.createId(),
            authorId: actor.id,
            body: `Approval requested more info: ${comment}`,
            mentions: [workItem.requesterId],
            createdAt: nowIso()
          });
        }
      }
      workItem.updatedAt = nowIso();
      this.store.workItems.set(workItem.id, workItem);
    }

    if (decision === "approved") {
      const chainStatus = this.evaluateApprovalChain(approval);
      if (!chainStatus.satisfied) {
        return approval;
      }

      if (workItem) {
        workItem.status = "In Progress";
        workItem.updatedAt = nowIso();
        this.store.workItems.set(workItem.id, workItem);
      }

      const run = this.store.workflowRuns.get(approval.workItemId);
      if (run) {
        run.status = "running";
        run.currentStepIndex += 1;
        run.updatedAt = nowIso();
        this.store.workflowRuns.set(run.id, run);
        this.advanceRun(run.id, actor);
      }
    }

    return approval;
  }

  private evaluateApprovalChain(
    approval: ApprovalRecord
  ): { satisfied: boolean; mode?: "all" | "any"; approvals: ApprovalRecord[] } {
    if (!approval.chainId) {
      return { satisfied: true, approvals: [approval] };
    }

    const chainApprovals = [...this.store.approvals.values()]
      .filter((item) => item.chainId === approval.chainId)
      .sort((left, right) => (left.chainOrder ?? 0) - (right.chainOrder ?? 0));
    const mode = approval.chainMode ?? "all";

    const satisfied =
      mode === "all"
        ? chainApprovals.every((item) => item.decision === "approved")
        : chainApprovals.some((item) => item.decision === "approved");

    if (mode === "any" && satisfied) {
      for (const item of chainApprovals) {
        if (item.id === approval.id || item.decision !== "pending") {
          continue;
        }
        item.decision = "expired";
        item.decidedAt = nowIso();
        item.comment = "Superseded by any-of approval chain decision";
        this.store.approvals.set(item.id, item);
      }
    }

    return { satisfied, mode, approvals: chainApprovals };
  }

  private executeStep(
    workflowRunId: string,
    stepId: string,
    stepName: string,
    stepType: string,
    config: Record<string, unknown>,
    riskLevel: "low" | "medium" | "high",
    actorId: string
  ): void {
    if (stepType === "automation") {
      const fail = Boolean(config.forceFailure);
      const execution: ActionExecutionLog = {
        id: this.store.createId(),
        tenantId: String(config.tenantId ?? "tenant-demo"),
        workspaceId: String(config.workspaceId ?? "workspace-demo"),
        workflowRunId,
        stepId,
        actionName: String(config.actionName ?? stepName),
        riskLevel,
        idempotencyKey: String(config.idempotencyKey ?? `${workflowRunId}:${stepId}`),
        targetSystem: String(config.targetSystem ?? "internal"),
        status: fail ? "failed" : "success",
        input: { ...config },
        output: fail ? { error: "forced failure" } : { ok: true },
        correlationId: this.store.createId(),
        createdAt: nowIso()
      };
      this.store.actionLogs.push(execution);

      if (fail) {
        throw new Error(`Automation action failed: ${stepName}`);
      }
    }

    if (stepType === "create-work-item") {
      const workItem: WorkItem = {
        id: this.store.createId(),
        tenantId: String(config.tenantId ?? "tenant-demo"),
        workspaceId: String(config.workspaceId ?? "workspace-demo"),
        type: "Task",
        status: "Submitted",
        priority: "P2",
        title: String(config.title ?? `Task from ${stepName}`),
        requesterId: actorId,
        assignmentGroup: String(config.assignmentGroup ?? "it-ops"),
        linkedObjectIds: [],
        tags: ["workflow-generated"],
        comments: [],
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      this.store.workItems.set(workItem.id, workItem);
    }
  }

  private requestApproval(
    run: WorkflowRun,
    actorId: string,
    approvalTypeRaw: unknown,
    reason: string,
    approverId: string
  ): ApprovalRecord {
    const approval: ApprovalRecord = {
      id: this.store.createId(),
      tenantId: run.tenantId,
      workspaceId: run.workspaceId,
      workItemId: run.id,
      type: toApprovalType(approvalTypeRaw),
      approverId,
      decision: "pending",
      createdAt: nowIso()
    };

    this.store.approvals.set(approval.id, approval);
    this.store.pushTimeline({
      tenantId: run.tenantId,
      workspaceId: run.workspaceId,
      entityType: "approval",
      entityId: approval.id,
      eventType: "approval.requested",
      actor: actorId,
      reason,
      createdAt: nowIso(),
      payload: { runId: run.id, type: approval.type }
    });

    return approval;
  }
}
