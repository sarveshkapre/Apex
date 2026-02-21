"use client";

import * as React from "react";
import { Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { enforceCloudTags, getCloudTagCoverage } from "@/lib/apex";
import { CloudTagCoverage, CloudTagEnforcementResult } from "@/lib/types";

type Props = {
  initialCoverage: CloudTagCoverage;
};

export function CloudGovernance({ initialCoverage }: Props) {
  const [coverage, setCoverage] = React.useState(initialCoverage);
  const [tagInput, setTagInput] = React.useState(initialCoverage.requiredTags.join(","));
  const [autoTag, setAutoTag] = React.useState(true);
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

  const runEnforcement = async (dryRun: boolean) => {
    try {
      const result = await enforceCloudTags({
        requiredTags,
        dryRun,
        autoTag
      });
      setLastRun(result);
      setStatus(
        dryRun
          ? `Dry-run complete: ${result.autoTaggedResources} resources can be auto-tagged, ${result.exceptionsCreated} exceptions.`
          : `Live run complete: ${result.autoTaggedResources} resources tagged, ${result.exceptionsCreated} exceptions created.`
      );
      await refreshCoverage();
    } catch {
      setStatus("Cloud tag enforcement failed.");
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

          <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-4">
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Resources: {coverage.totalResources}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Compliant: {coverage.compliantResources}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Noncompliant: {coverage.nonCompliantResources}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Coverage: {coverage.coveragePercent}%</p>
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
              Mode: {lastRun.mode} • evaluated: {lastRun.resourcesEvaluated} • auto-tagged: {lastRun.autoTaggedResources} • exceptions: {lastRun.exceptionsCreated}
            </p>
            {lastRun.remediations.slice(0, 6).map((item) => (
              <p key={item.resourceId} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs">
                {item.resourceId} • tagged [{item.autoTagged.join(",") || "none"}] • unresolved [{item.unresolved.join(",") || "none"}]
              </p>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
