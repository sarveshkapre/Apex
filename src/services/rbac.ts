import { UserRole } from "../domain/types";

export type Action =
  | "object:view"
  | "object:create"
  | "object:update"
  | "object:delete"
  | "workflow:run"
  | "workflow:edit"
  | "approval:decide"
  | "automation:high-risk"
  | "audit:export";

const matrix: Record<UserRole, Set<Action>> = {
  "end-user": new Set(["object:view", "workflow:run"]),
  "it-agent": new Set([
    "object:view",
    "object:create",
    "object:update",
    "workflow:run",
    "approval:decide"
  ]),
  "asset-manager": new Set([
    "object:view",
    "object:create",
    "object:update",
    "workflow:run",
    "approval:decide"
  ]),
  "it-admin": new Set([
    "object:view",
    "object:create",
    "object:update",
    "object:delete",
    "workflow:run",
    "workflow:edit",
    "approval:decide",
    "automation:high-risk",
    "audit:export"
  ]),
  "security-analyst": new Set([
    "object:view",
    "object:update",
    "workflow:run",
    "approval:decide",
    "automation:high-risk",
    "audit:export"
  ]),
  finance: new Set(["object:view", "approval:decide", "audit:export"]),
  "app-owner": new Set(["object:view", "approval:decide"]),
  auditor: new Set(["object:view", "audit:export"])
};

export const can = (role: UserRole, action: Action): boolean => matrix[role].has(action);
