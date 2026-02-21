"use client";

import * as React from "react";
import { Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  createSaasReclaimPolicy,
  listSaasReclaimPolicies,
  listSaasReclaimRuns,
  retrySaasReclaimRun,
  runSaasReclaim,
  updateSaasReclaimPolicy
} from "@/lib/apex";
import { SaasReclaimPolicy, SaasReclaimRun } from "@/lib/types";

export function SaasGovernance({
  initialPolicies,
  initialRuns
}: {
  initialPolicies: SaasReclaimPolicy[];
  initialRuns: SaasReclaimRun[];
}) {
  const [policies, setPolicies] = React.useState(initialPolicies);
  const [runs, setRuns] = React.useState(initialRuns);
  const [status, setStatus] = React.useState("");

  const [name, setName] = React.useState("Inactive seat reclaim");
  const [appName, setAppName] = React.useState("Figma");
  const [inactivityDays, setInactivityDays] = React.useState("30");
  const [warningDays, setWarningDays] = React.useState("7");
  const [autoReclaim, setAutoReclaim] = React.useState(true);

  const refresh = async () => {
    const [policyData, runData] = await Promise.all([listSaasReclaimPolicies(), listSaasReclaimRuns()]);
    setPolicies(policyData);
    setRuns(runData);
  };

  const createPolicy = async () => {
    const response = await createSaasReclaimPolicy({
      name,
      appName,
      inactivityDays: Math.max(1, Number(inactivityDays) || 30),
      warningDays: Math.max(0, Number(warningDays) || 7),
      autoReclaim,
      schedule: "weekly",
      enabled: true
    });
    setStatus(response.ok ? "Reclaim policy created." : "Failed to create reclaim policy.");
    await refresh();
  };

  const togglePolicy = async (policy: SaasReclaimPolicy, enabled: boolean) => {
    const response = await updateSaasReclaimPolicy(policy.id, { enabled });
    setStatus(response.ok ? `Policy ${enabled ? "enabled" : "disabled"}.` : "Failed to update policy.");
    await refresh();
  };

  const runPolicy = async (policyId: string, mode: "dry-run" | "live") => {
    try {
      const run = await runSaasReclaim(policyId, mode);
      setStatus(`${mode} complete: ${run.candidateCount} candidate(s), ${run.reclaimedCount} reclaimed, ${run.failedCount} failed.`);
      await refresh();
    } catch {
      setStatus("Failed to execute reclaim run.");
    }
  };

  const retryRun = async (runId: string) => {
    try {
      const run = await retrySaasReclaimRun(runId, "live");
      setStatus(`Retry complete: ${run.reclaimedCount} reclaimed, ${run.failedCount} failed.`);
      await refresh();
    } catch {
      setStatus("Failed to retry reclaim run.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Create reclaim policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Policy name" />
            <Input value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="App name (* for all)" />
            <Input value={inactivityDays} onChange={(event) => setInactivityDays(event.target.value)} placeholder="Inactivity days" type="number" />
            <Input value={warningDays} onChange={(event) => setWarningDays(event.target.value)} placeholder="Warning days" type="number" />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
            <Switch checked={autoReclaim} onCheckedChange={setAutoReclaim} />
            Auto reclaim licenses on live runs
          </label>
          <div className="flex gap-2">
            <Button onClick={createPolicy} className="rounded-xl">Create policy</Button>
          </div>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Reclaim policies ({policies.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          {policies.map((policy) => (
            <div key={policy.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{policy.name}</p>
              <p className="text-xs text-zinc-500">
                App {policy.appName} • inactivity {policy.inactivityDays}d • warning {policy.warningDays}d • auto {policy.autoReclaim ? "on" : "off"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs">
                  <Switch checked={policy.enabled} onCheckedChange={(next) => togglePolicy(policy, next)} />
                  {policy.enabled ? "Enabled" : "Disabled"}
                </label>
                <Button size="sm" variant="outline" className="rounded-md" onClick={() => runPolicy(policy.id, "dry-run")}>
                  <Play className="mr-1 h-3 w-3" />Dry-run
                </Button>
                <Button size="sm" variant="outline" className="rounded-md" onClick={() => runPolicy(policy.id, "live")}>
                  <Play className="mr-1 h-3 w-3" />Run live
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Run history ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-600">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{run.id.slice(0, 8)} • policy {run.policyId.slice(0, 8)} • {run.mode} • {run.status}</p>
              <p>Scanned {run.scannedAccounts}, candidates {run.candidateCount}, reclaimed {run.reclaimedCount}, failed {run.failedCount}</p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="rounded-md" onClick={() => retryRun(run.id)}>
                  <RotateCcw className="mr-1 h-3 w-3" />Retry failed
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
