import { v4 as uuidv4 } from "uuid";
import {
  ActionExecutionLog,
  ApprovalRecord,
  GraphObject,
  GraphRelationship,
  SourceSignal,
  TimelineEvent,
  WorkflowDefinition,
  WorkflowRun,
  WorkItem
} from "../domain/types";

export class ApexStore {
  objects = new Map<string, GraphObject>();
  relationships = new Map<string, GraphRelationship>();
  signals = new Map<string, SourceSignal>();
  timeline: TimelineEvent[] = [];
  workItems = new Map<string, WorkItem>();
  approvals = new Map<string, ApprovalRecord>();
  workflowDefinitions = new Map<string, WorkflowDefinition>();
  workflowRuns = new Map<string, WorkflowRun>();
  actionLogs: ActionExecutionLog[] = [];

  createId(): string {
    return uuidv4();
  }

  pushTimeline(event: Omit<TimelineEvent, "id">): TimelineEvent {
    const fullEvent: TimelineEvent = {
      ...event,
      id: this.createId()
    };
    this.timeline.push(fullEvent);
    return fullEvent;
  }

  listTimelineForEntity(entityId: string): TimelineEvent[] {
    return this.timeline.filter((event) => event.entityId === entityId);
  }

  listTimelineForWorkItem(workItemId: string): TimelineEvent[] {
    return this.timeline.filter((event) => event.workItemId === workItemId || event.entityId === workItemId);
  }
}
