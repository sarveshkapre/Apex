import { ApexStore } from "../store/store";
import { SlaRule, WorkItem, WorkItemStatus } from "../domain/types";

const paused = (status: WorkItemStatus, rule: SlaRule): boolean => rule.pauseStatuses.includes(status);

const elapsedMinutes = (fromIso: string): number => {
  const from = new Date(fromIso).getTime();
  return Math.max(0, Math.floor((Date.now() - from) / 60000));
};

const matchRule = (rules: SlaRule[], workItem: WorkItem): SlaRule | undefined => {
  return rules.find(
    (rule) =>
      rule.active &&
      rule.workItemType === workItem.type &&
      rule.priority === workItem.priority &&
      (rule.assignmentGroup === "*" || rule.assignmentGroup === (workItem.assignmentGroup ?? ""))
  );
};

export const computeSlaBreaches = (store: ApexStore) => {
  const rules = [...store.slaRules.values()];
  const breaches = [...store.workItems.values()].flatMap((workItem) => {
    const rule = matchRule(rules, workItem);
    if (!rule || paused(workItem.status, rule)) {
      return [];
    }

    const elapsed = elapsedMinutes(workItem.createdAt);
    const responseBreached = elapsed > rule.responseMinutes;
    const resolutionBreached = elapsed > rule.resolutionMinutes;

    if (!responseBreached && !resolutionBreached) {
      return [];
    }

    return [
      {
        workItemId: workItem.id,
        title: workItem.title,
        priority: workItem.priority,
        assignmentGroup: workItem.assignmentGroup ?? "unassigned",
        responseBreached,
        resolutionBreached,
        elapsedMinutes: elapsed,
        ruleId: rule.id
      }
    ];
  });

  return {
    totalBreaches: breaches.length,
    breaches
  };
};
