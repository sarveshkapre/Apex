"use client";

import * as React from "react";
import { Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { applyCloudTagRun, enforceCloudTags, getCloudTagCoverage, listCloudTagRuns } from "@/lib/apex";
import { CloudTagCoverage, CloudTagEnforcementResult, CloudTagGovernanceRun } from "@/lib/types";

type Props = {
  initialCoverage: CloudTagCoverage;
  initialRuns: CloudTagGovernanceRun[];
};

export function CloudGovernance({ initialCoverage, initialRuns }: Props) {
  const [coverage, setCoverage] = React.useState(initialCoverage);
  const [runs, setRuns] = React.useState(initialRuns);
  const [tagInput, setTagInput] = React.useState(initialCoverage.requiredTags.join(","));
  const [autoTag, setAutoTag] = React.useState(true);
  const [autoTagMinConfidence, setAutoTagMinConfidence] = React.useState("0.8");
  const [approvalFloor, setApprovalFloor] = React.useState("0.6");
  const [requireApproval, setRequireApproval] = React.useState(true);
  const [approvalType, setApprovalType] = React.useState<"manager" | "app-owner" | "security" | "finance" | "it" | "custom">("security");
  const [approvalAssigneeId, setApprovalAssigneeId] = React.useState("security-approver");
  const [status, setStatus] = React.useState("");
  const [lastRun, setLastRun] = React.useState<CloudTagEnforcementResult | null>(null);

  const requiredTags = React.useMemo(
    () =>
      tagInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [tagInput]
  );

  const refreshCoverage = async () => {
    const updated = await getCloudTagCoverage(requiredTags);
    setCoverage(updated);
    setStatus(`Coverage refreshed (${updated.coveragePercent}%).`);
  };

  const refreshRuns = async () => {
    const updated = await listCloudTagRuns();
    setRuns(updated);
  };

  const runEnforcement = async (dryRun: boolean) => {
    try {
      const minConfidenceValue = Number(autoTagMinConfidence);
      const approvalFloorValue = Number(approvalFloor);
      const result = await enforceCloudTags({
        requiredTags,
        dryRun,
        autoTag,
        autoTagMinConfidence: Number.isFinite(minConfidenceValue) ? minConfidenceValue : 0.8,
        approvalGatedConfidenceFloor: Number.isFinite(approvalFloorValue) ? approvalFloorValue : 0.6,
        requireApprovalForMediumConfidence: requireApproval,
        approvalType,
        approvalAssigneeId
      });
      setLastRun(result);
      setStatus(
        dryRun
          ? `Dry-run: ${result.autoTaggedResources} auto-tag candidates, ${result.approvalsCreated} approval-gated, ${result.exceptionsCreated} exceptions.`
          : `Live run: ${result.autoTaggedResources} auto-tagged, ${result.approvalsCreated} approval(s) created, ${result.exceptionsCreated} exceptions.`
      );
      await refreshCoverage();
      await refreshRuns();
    } catch {
      setStatus("Cloud tag enforcement failed.");
    }
  };

  const applyRun = async (runId: string) => {
    try {
      const run = await applyCloudTagRun(runId);
      setStatus(`Applied run ${run.id.slice(0, 8)}: status ${run.status}, applied ${run.appliedResources} resource(s).`);
      await refreshCoverage();
      await refreshRuns();
    } catch {
      setStatus("Cloud remediation apply failed.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Tag governance controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-[2fr_1fr_auto_auto] md:items-center">
            <Input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="owner,cost_center,environment,data_classification"
            />
            <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
              <Switch checked={autoTag} onCheckedChange={setAutoTag} />
              Auto-tag when possible
            </label>
            <Button variant="outline" className="rounded-xl" onClick={refreshCoverage}>
              <RefreshCw className="mr-2 h-4 w-4" />Refresh
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => runEnforcement(true)}>
                <Play className="mr-2 h-4 w-4" />Dry-run
              </Button>
              <Button className="rounded-xl" onClick={() => runEnforcement(false)}>
                <Play className="mr-2 h-4 w-4" />Run live
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            <Input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={autoTagMinConfidence}
              onChange={(event) => setAutoTagMinConfidence(event.target.value)}
              placeholder="Auto-tag min confidence"
            />
            <Input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={approvalFloor}
              onChange={(event) => setApprovalFloor(event.target.value)}
              placeholder="Approval floor confidence"
            />
            <label className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 text-sm text-zinc-700">
              <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
              Require approval for medium confidence
            </label>
            <Select value={approvalType} onValueChange={(value) => setApprovalType(value as "manager" | "app-owner" | "security" | "finance" | "it" | "custom")}>
              <SelectTrigger><SelectValue placeholder="Approval type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="security">security</SelectItem>
                <SelectItem value="it">it</SelectItem>
                <SelectItem value="manager">manager</SelectItem>
                <SelectItem value="finance">finance</SelectItem>
                <SelectItem value="app-owner">app-owner</SelectItem>
                <SelectItem value="custom">custom</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={approvalAssigneeId}
              onChange={(event) => setApprovalAssigneeId(event.target.value)}
              placeholder="Approval assignee id"
            />
          </div>

          <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-6">
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Resources: {coverage.totalResources}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Compliant: {coverage.compliantResources}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Noncompliant: {coverage.nonCompliantResources}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Coverage: {coverage.coveragePercent}%</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Auto-tag ready: {coverage.autoTagReadyResources}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Approval needed: {coverage.approvalRequiredResources}</p>
          </div>

          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Noncompliant resources ({coverage.nonCompliant.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {coverage.nonCompliant.map((item) => (
            <div key={item.resourceId} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
              <p className="font-medium text-zinc-900">{item.name}</p>
              <p className="text-xs text-zinc-500">
                {item.provider} • owner {item.owner} • missing {item.missingTags.join(", ")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] text-zinc-600">
                {item.tagSuggestions.map((suggestion) => (
                  <span key={`${item.resourceId}-${suggestion.tag}`} className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
                    {suggestion.tag}:{suggestion.value ?? "n/a"} • {Math.round(suggestion.confidence * 100)}% • {suggestion.decision}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {lastRun ? (
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Last enforcement run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            <p>
              Mode: {lastRun.mode} • evaluated: {lastRun.resourcesEvaluated} • auto-tagged: {lastRun.autoTaggedResources} • approvals: {lastRun.approvalsCreated} • exceptions: {lastRun.exceptionsCreated}
            </p>
            {lastRun.remediations.slice(0, 6).map((item) => (
              <p key={item.resourceId} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs">
                {item.resourceId} • tagged [{item.autoTagged.join(",") || "none"}] • approval [{item.approvalRequired.map((entry) => entry.tag).join(",") || "none"}] • unresolved [{item.unresolved.join(",") || "none"}]
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Governance runs ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          {runs.length === 0 ? <p>No cloud governance runs yet.</p> : null}
          {runs.slice(0, 8).map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{run.mode} • {run.status}</p>
              <p className="text-xs text-zinc-500">
                {run.id.slice(0, 8)} • applied {run.appliedResources} • pending {run.pendingApprovalResources} • rejected {run.rejectedApprovalResources}
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-md"
                  onClick={() => applyRun(run.id)}
                  disabled={!(run.mode === "live" && (run.status === "pending-approvals" || run.status === "partial"))}
                >
                  Apply approved remediations
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
