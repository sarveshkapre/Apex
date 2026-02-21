import { ApexStore } from "../store/store";
import { EvidencePackage } from "../domain/types";
import { nowIso } from "../utils/time";

export const buildEvidencePackage = (store: ApexStore, workItemId: string): EvidencePackage => {
  const workItem = store.workItems.get(workItemId);
  if (!workItem) {
    throw new Error("Work item not found");
  }

  const timeline = store.listTimelineForWorkItem(workItemId);
  const approvals = [...store.approvals.values()].filter((approval) => approval.workItemId === workItemId);
  const actionLogs = store.actionLogs.filter((log) => log.workflowRunId === workItemId);

  const affectedObjectSet = new Set(workItem.linkedObjectIds);
  for (const event of timeline) {
    const objectId = event.payload.objectId;
    if (typeof objectId === "string") {
      affectedObjectSet.add(objectId);
    }
  }

  const affectedObjects = [...affectedObjectSet]
    .map((id) => store.objects.get(id))
    .filter((obj): obj is NonNullable<typeof obj> => Boolean(obj));

  return {
    id: store.createId(),
    workItemId,
    generatedAt: nowIso(),
    timeline,
    approvals,
    actionLogs,
    affectedObjects
  };
};
