"use client";

import * as React from "react";
import { GitMerge, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  executeObjectMerge,
  listObjectMergeRuns,
  previewObjectMerge,
  revertObjectMerge
} from "@/lib/apex";
import { GraphObject, ObjectMergePreviewResult, ObjectMergeRun } from "@/lib/types";

export function ObjectMergeLab({
  objects,
  initialRuns
}: {
  objects: GraphObject[];
  initialRuns: ObjectMergeRun[];
}) {
  const [targetObjectId, setTargetObjectId] = React.useState(objects[0]?.id ?? "");
  const [sourceObjectId, setSourceObjectId] = React.useState("");
  const [reason, setReason] = React.useState("Duplicate inventory records identified by IT ops.");
  const [preview, setPreview] = React.useState<ObjectMergePreviewResult | null>(null);
  const [runs, setRuns] = React.useState<ObjectMergeRun[]>(initialRuns);
  const [status, setStatus] = React.useState("");

  const targetObject = React.useMemo(
    () => objects.find((object) => object.id === targetObjectId),
    [objects, targetObjectId]
  );

  const sourceCandidates = React.useMemo(() => {
    if (!targetObject) {
      return objects;
    }
    return objects.filter((object) => object.id !== targetObject.id && object.type === targetObject.type);
  }, [objects, targetObject]);

  React.useEffect(() => {
    if (!sourceCandidates.some((candidate) => candidate.id === sourceObjectId)) {
      setSourceObjectId(sourceCandidates[0]?.id ?? "");
    }
  }, [sourceCandidates, sourceObjectId]);

  const refreshRuns = async () => {
    try {
      const latest = await listObjectMergeRuns();
      setRuns(latest);
    } catch {
      setStatus("Unable to refresh merge run history.");
    }
  };

  const runPreview = async () => {
    if (!targetObjectId || !sourceObjectId) {
      setStatus("Select target and source objects first.");
      return;
    }
    try {
      const data = await previewObjectMerge({ targetObjectId, sourceObjectId });
      setPreview(data);
      await refreshRuns();
      setStatus("Merge preview generated.");
    } catch {
      setStatus("Merge preview failed.");
    }
  };

  const runExecute = async () => {
    if (!targetObjectId || !sourceObjectId || !reason.trim()) {
      setStatus("Target, source, and reason are required.");
      return;
    }
    try {
      const data = await executeObjectMerge({ targetObjectId, sourceObjectId, reason });
      setPreview((current) =>
        current
          ? {
              ...current,
              run: data.run
            }
          : current
      );
      await refreshRuns();
      setStatus("Merge executed. Revert is available within the configured window.");
    } catch {
      setStatus("Merge execution failed.");
    }
  };

  const runRevert = async (mergeRunId: string) => {
    const response = await revertObjectMerge(mergeRunId);
    if (!response.ok) {
      setStatus("Merge revert failed.");
      return;
    }
    await refreshRuns();
    setStatus("Merge reverted.");
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
      <p className="text-sm font-medium text-zinc-900">Duplicate merge workspace</p>

      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-zinc-500">Target object (canonical)</p>
          <Select value={targetObjectId} onValueChange={setTargetObjectId}>
            <SelectTrigger><SelectValue placeholder="Select target object" /></SelectTrigger>
            <SelectContent>
              {objects.map((object) => (
                <SelectItem key={object.id} value={object.id}>
                  {object.type} • {object.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <p className="mb-1 text-xs text-zinc-500">Source object (to merge into target)</p>
          <Select value={sourceObjectId} onValueChange={setSourceObjectId}>
            <SelectTrigger><SelectValue placeholder="Select source object" /></SelectTrigger>
            <SelectContent>
              {sourceCandidates.map((object) => (
                <SelectItem key={object.id} value={object.id}>
                  {object.type} • {object.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Merge reason" />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="rounded-lg" onClick={runPreview}>
          <GitMerge className="mr-1.5 h-3.5 w-3.5" />Preview merge
        </Button>
        <Button className="rounded-lg" onClick={runExecute}>Execute merge</Button>
      </div>

      {preview ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-600">
          <p className="mb-1 text-zinc-900">
            Impact: {preview.impact.relationshipsToMove} relationship(s), {preview.impact.workItemsToRelink} work item(s)
          </p>
          <div className="space-y-1">
            {preview.run.fieldDecisions.slice(0, 10).map((decision) => (
              <p key={decision.field}>
                {decision.field}: choose <span className="font-medium text-zinc-900">{decision.selected}</span> ({decision.reason})
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-600">
        <p className="mb-2 text-zinc-900">Merge run history ({runs.length})</p>
        <div className="space-y-2">
          {runs.slice(0, 6).map((run) => (
            <div key={run.id} className="rounded border border-zinc-200 bg-white px-2 py-1.5">
              <p>
                {run.objectType} • {run.status} • {run.targetObjectId.slice(0, 8)} ← {run.sourceObjectId.slice(0, 8)}
              </p>
              <p className="text-[11px] text-zinc-500">{run.reason ?? "No reason"}</p>
              {run.status === "executed" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1 h-7 rounded-md"
                  onClick={() => runRevert(run.id)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />Revert
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
