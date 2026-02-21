"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getContractRenewalOverview, listContractRenewalRuns, runContractRenewals } from "@/lib/apex";
import { ContractRenewalOverview, ContractRenewalRun } from "@/lib/types";

export function RenewalsGovernance({
  initialOverview,
  initialRuns
}: {
  initialOverview: ContractRenewalOverview;
  initialRuns: ContractRenewalRun[];
}) {
  const [overview, setOverview] = React.useState(initialOverview);
  const [runs, setRuns] = React.useState(initialRuns);
  const [daysAhead, setDaysAhead] = React.useState(String(initialOverview.daysAhead));
  const [status, setStatus] = React.useState("");

  const refresh = async (days: number) => {
    const [nextOverview, nextRuns] = await Promise.all([
      getContractRenewalOverview(days),
      listContractRenewalRuns()
    ]);
    setOverview(nextOverview);
    setRuns(nextRuns);
  };

  const refreshWithInput = async () => {
    const parsedDays = Math.max(1, Number(daysAhead) || 90);
    await refresh(parsedDays);
    setStatus(`Renewal overview refreshed for ${parsedDays}-day window.`);
  };

  const run = async (mode: "dry-run" | "live") => {
    const parsedDays = Math.max(1, Number(daysAhead) || 90);
    try {
      const result = await runContractRenewals({ daysAhead: parsedDays, mode });
      setStatus(`${mode} run: due ${result.dueContracts}, tasks ${result.tasksCreated}, exceptions ${result.exceptionsCreated}.`);
      await refresh(parsedDays);
    } catch {
      setStatus("Failed to execute renewal reminder run.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Renewal reminder controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input value={daysAhead} onChange={(event) => setDaysAhead(event.target.value)} placeholder="Days ahead" type="number" className="max-w-[140px]" />
            <Button variant="outline" className="rounded-xl" onClick={refreshWithInput}>Refresh overview</Button>
            <Button variant="outline" className="rounded-xl" onClick={() => run("dry-run")}>
              <Play className="mr-2 h-4 w-4" />Dry-run reminders
            </Button>
            <Button className="rounded-xl" onClick={() => run("live")}>
              <Play className="mr-2 h-4 w-4" />Run live reminders
            </Button>
          </div>
          <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-4">
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Scanned: {overview.scannedContracts}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Due: {overview.dueContracts}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Due soon: {overview.dueSoonContracts}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Overdue: {overview.overdueContracts}</p>
          </div>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Upcoming renewals ({overview.candidates.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          {overview.candidates.map((candidate) => (
            <div key={candidate.contractObjectId} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{candidate.vendorName}</p>
              <p className="text-xs text-zinc-500">
                Renewal {candidate.renewalDate} • {candidate.daysUntilRenewal} day(s) • {candidate.status}
              </p>
              <p className="text-xs text-zinc-500">
                Spend ${candidate.estimatedSpend.toLocaleString()} • linked licenses {candidate.linkedLicenseIds.length}
              </p>
            </div>
          ))}
          {overview.candidates.length === 0 ? <p>No contracts in scope.</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Run history ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-600">
          {runs.map((runItem) => (
            <div key={runItem.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{runItem.id.slice(0, 8)} • {runItem.mode} • {runItem.status}</p>
              <p>
                Scanned {runItem.scannedContracts}, due {runItem.dueContracts}, tasks {runItem.tasksCreated}, exceptions {runItem.exceptionsCreated}
              </p>
            </div>
          ))}
          {runs.length === 0 ? <p>No renewal runs recorded.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
