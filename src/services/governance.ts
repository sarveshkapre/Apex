import {
  ApiActor,
  ApprovalMatrixRule,
  ApprovalType,
  FieldRestriction,
  GraphObject,
  RiskLevel,
  SodRule,
  UserRole,
  WorkItemType
} from "../domain/types";

const hasRole = (role: UserRole, roles: UserRole[]): boolean => roles.includes(role);
type ApprovalRequestContext = {
  estimatedCost?: number;
  region?: string;
  tags?: string[];
  linkedObjectTypes?: string[];
};

export const maskObjectForActor = (
  object: GraphObject,
  actor: ApiActor,
  restrictions: FieldRestriction[]
): GraphObject => {
  const byField = restrictions.filter((rule) => rule.objectType === object.type);
  if (byField.length === 0) {
    return object;
  }

  const maskedFields: Record<string, unknown> = { ...object.fields };

  for (const restriction of byField) {
    if (hasRole(actor.role, restriction.readRoles)) {
      continue;
    }

    if (!(restriction.field in maskedFields)) {
      continue;
    }

    maskedFields[restriction.field] = restriction.maskStyle === "hidden" ? undefined : "[REDACTED]";
  }

  return {
    ...object,
    fields: maskedFields
  };
};

export const canWriteField = (
  objectType: GraphObject["type"],
  field: string,
  actor: ApiActor,
  restrictions: FieldRestriction[]
): boolean => {
  const rule = restrictions.find((item) => item.objectType === objectType && item.field === field);
  if (!rule) {
    return true;
  }
  return hasRole(actor.role, rule.writeRoles);
};

export const validateSod = (
  rules: SodRule[],
  requestType: WorkItemType,
  requesterId: string,
  approverId: string
): { ok: boolean; reason?: string } => {
  const activeRules = rules.filter((rule) => rule.enabled && rule.requestTypes.includes(requestType));
  if (activeRules.length === 0) {
    return { ok: true };
  }

  if (requesterId === approverId) {
    return {
      ok: false,
      reason: "Separation-of-duties violation: requester cannot approve this request"
    };
  }

  return { ok: true };
};

export const matchApprovalMatrixRules = (
  rules: ApprovalMatrixRule[],
  requestType: WorkItemType,
  riskLevel: RiskLevel,
  context?: ApprovalRequestContext
): ApprovalMatrixRule[] => {
  const normalizedRegion = String(context?.region ?? "").trim().toLowerCase();
  const normalizedTags = new Set((context?.tags ?? []).map((tag) => tag.trim().toLowerCase()));
  const normalizedObjectTypes = new Set((context?.linkedObjectTypes ?? []).map((value) => value.trim()));
  const estimatedCost = context?.estimatedCost;

  return rules.filter(
    (rule) =>
      rule.enabled &&
      rule.requestType === requestType &&
      rule.riskLevel === riskLevel &&
      (rule.costThreshold === undefined || (estimatedCost ?? 0) >= rule.costThreshold) &&
      (rule.regions === undefined ||
        rule.regions.length === 0 ||
        (normalizedRegion.length > 0 &&
          rule.regions.some((region) => region.trim().toLowerCase() === normalizedRegion))) &&
      (rule.requiredTags === undefined ||
        rule.requiredTags.length === 0 ||
        rule.requiredTags.every((tag) => normalizedTags.has(tag.trim().toLowerCase()))) &&
      (rule.linkedObjectTypes === undefined ||
        rule.linkedObjectTypes.length === 0 ||
        rule.linkedObjectTypes.some((type) => normalizedObjectTypes.has(type)))
  );
};

export const approvalsForRequest = (
  rules: ApprovalMatrixRule[],
  requestType: WorkItemType,
  riskLevel: RiskLevel,
  context?: ApprovalRequestContext
): ApprovalType[] => {
  const matched = matchApprovalMatrixRules(rules, requestType, riskLevel, context);

  if (matched.length === 0) {
    return ["manager"];
  }

  return [...new Set(matched.flatMap((rule) => rule.approverTypes))];
};
