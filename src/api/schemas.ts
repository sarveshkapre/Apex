import { z } from "zod";
import {
  coreObjectTypes,
  relationshipTypes,
  workItemStatuses,
  workItemTypes
} from "../domain/types";

export const objectCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  type: z.enum(coreObjectTypes),
  fields: z.record(z.string(), z.unknown())
});

export const objectUpdateSchema = z.object({
  fields: z.record(z.string(), z.unknown())
});

export const relationshipCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  type: z.enum(relationshipTypes),
  fromObjectId: z.string().min(1),
  toObjectId: z.string().min(1)
});

export const signalIngestSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  sourceId: z.string().min(1),
  objectType: z.enum(coreObjectTypes),
  externalId: z.string().min(1),
  snapshot: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1)
});

export const workItemCreateSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  type: z.enum(workItemTypes),
  priority: z.enum(["P0", "P1", "P2", "P3", "P4"]),
  title: z.string().min(1),
  description: z.string().optional(),
  requesterId: z.string().min(1),
  assigneeId: z.string().optional(),
  assignmentGroup: z.string().optional(),
  linkedObjectIds: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  responseSlaAt: z.string().datetime().optional(),
  resolutionSlaAt: z.string().datetime().optional()
});

export const workItemUpdateSchema = z.object({
  status: z.enum(workItemStatuses).optional(),
  assigneeId: z.string().optional(),
  assignmentGroup: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3", "P4"]).optional(),
  tags: z.array(z.string()).optional()
});

export const runWorkflowSchema = z.object({
  definitionId: z.string().min(1),
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  inputs: z.record(z.string(), z.unknown()).default({}),
  linkedWorkItemId: z.string().optional()
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().optional()
});
