"use client";

import * as React from "react";
import { Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { executeJmlLeaver, listJmlLeaverRuns, previewJmlLeaver } from "@/lib/apex";
import { GraphObject, JmlLeaverRun } from "@/lib/types";

const toIso = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
};

export function LeaverLab({
  people,
  initialRuns
}: {
  people: GraphObject[];
  initialRuns: JmlLeaverRun[];
}) {
  const [runs, setRuns] = React.useState(initialRuns);
  const [status, setStatus] = React.useState("");
  const [preview, setPreview] = React.useState<JmlLeaverRun | null>(null);

  const [personId, setPersonId] = React.useState(people[0]?.id ?? "");
  const [effectiveAt, setEffectiveAt] = React.useState(new Date().toISOString().slice(0, 16));
  const [region, setRegion] = React.useState("US");
  const [deviceRecoveryState, setDeviceRecoveryState] = React.useState<"pending" | "recovered" | "not-recovered">(
    "pending"
  );
  const [legalHold, setLegalHold] = React.useState(false);
  const [vip, setVip] = React.useState(false);
  const [contractorConversion, setContractorConversion] = React.useState(false);

  const refresh = async (selectedPersonId?: string) => {
    const latest = await listJmlLeaverRuns(selectedPersonId);
    setRuns(latest);
  };

  const previewPlan = async () => {
    if (!personId) {
      return;
    }
    try {
      const run = await previewJmlLeaver({
        personId,
        requesterId: "person-1",
        effectiveDate: toIso(effectiveAt),
        region,
        legalHold,
        vip,
        contractorConversion,
        deviceRecoveryState
      });
      setPreview(run);
      setStatus(`Preview ready: ${run.plan.steps.length} step(s), risk ${run.plan.riskLevel}.`);
      await refresh(personId);
    } catch {
      setStatus("Failed to generate leaver preview.");
    }
  };

  const execute = async () => {
    if (!personId) {
      return;
    }
    try {
      const result = await executeJmlLeaver({
        personId,
        requesterId: "person-1",
        reason: "HR termination event validated",
        effectiveDate: toIso(effectiveAt),
        region,
        legalHold,
        vip,
        contractorConversion,
        deviceRecoveryState
      });
      setPreview(result.run);
      setStatus(
        `Leaver executed: ${result.taskIds.length} task(s), ${result.approvalIds.length} approval(s), ${result.updatedObjects.devices} device update(s).`
      );
      await refresh(personId);
    } catch {
      setStatus("Failed to execute leaver workflow.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">JML Leaver Planner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {String(person.fields.legal_name ?? person.id)} ({String(person.fields.role_profile ?? "role")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="datetime-local"
              value={effectiveAt}
              onChange={(event) => setEffectiveAt(event.target.value)}
              placeholder="Effective date/time"
            />
            <Input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Region" />
            <Select value={deviceRecoveryState} onValueChange={(value) => setDeviceRecoveryState(value as "pending" | "recovered" | "not-recovered")}>
              <SelectTrigger><SelectValue placeholder="Device recovery state" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending recovery</SelectItem>
                <SelectItem value="recovered">Recovered</SelectItem>
                <SelectItem value="not-recovered">Not recovered</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2 text-xs text-zinc-600 sm:grid-cols-3">
            <label className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
              Legal hold
              <Switch checked={legalHold} onCheckedChange={setLegalHold} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
              VIP handling
              <Switch checked={vip} onCheckedChange={setVip} />
            </label>
            <label className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2">
              Contractor conversion
              <Switch checked={contractorConversion} onCheckedChange={setContractorConversion} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" onClick={previewPlan}>
              <Sparkles className="mr-2 h-4 w-4" />Preview plan
            </Button>
            <Button className="rounded-xl" onClick={execute}>
              <Play className="mr-2 h-4 w-4" />Execute leaver
            </Button>
          </div>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Latest leaver plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-zinc-600">
            <p>
              {preview.plan.personName} • {preview.plan.region} • risk {preview.plan.riskLevel}
            </p>
            <p>Approvals: {preview.plan.approvalsRequired.join(", ") || "none"}</p>
            <div className="space-y-1">
              {preview.plan.steps.map((step) => (
                <div key={step.id} className="rounded-md border border-zinc-200 bg-white px-2 py-1">
                  <span className="font-medium text-zinc-900">{step.name}</span>
                  <span className="ml-2">({step.riskLevel}{step.requiresApproval ? ", approval" : ""})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Leaver run history ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-600">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{run.id.slice(0, 8)} • {run.mode} • {run.status}</p>
              <p>{run.plan.personName} • {run.plan.region} • risk {run.plan.riskLevel}</p>
              <p>Steps {run.plan.steps.length} • Tasks {run.createdTaskIds.length} • Approvals {run.createdApprovalIds.length}</p>
            </div>
          ))}
          {runs.length === 0 ? <p>No leaver runs yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
