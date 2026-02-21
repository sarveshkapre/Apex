"use client";

import * as React from "react";
import { Download, Play, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  createReportDefinition,
  exportReportRun,
  listReportDefinitions,
  listReportRuns,
  runReportDefinition,
  updateReportDefinition
} from "@/lib/apex";
import { ReportDefinition, ReportRun } from "@/lib/types";

export function ReportStudio({
  initialDefinitions,
  initialRuns
}: {
  initialDefinitions: ReportDefinition[];
  initialRuns: ReportRun[];
}) {
  const [definitions, setDefinitions] = React.useState(initialDefinitions);
  const [runs, setRuns] = React.useState(initialRuns);
  const [status, setStatus] = React.useState("");

  const [name, setName] = React.useState("Security posture report");
  const [description, setDescription] = React.useState("Track stale and noncompliant devices.");
  const [objectType, setObjectType] = React.useState("Device");
  const [containsText, setContainsText] = React.useState("compliance");
  const [columns, setColumns] = React.useState("id,type,asset_tag,serial_number,compliance_state");
  const [scheduleFrequency, setScheduleFrequency] = React.useState<"manual" | "daily" | "weekly">("weekly");
  const [scheduleHourUtc, setScheduleHourUtc] = React.useState("14");

  const refresh = async () => {
    const [definitionData, runData] = await Promise.all([listReportDefinitions(), listReportRuns()]);
    setDefinitions(definitionData);
    setRuns(runData);
  };

  const create = async () => {
    const response = await createReportDefinition({
      name,
      description,
      objectType,
      containsText,
      columns: columns
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      scheduleFrequency,
      scheduleHourUtc: Math.max(0, Math.min(23, Number(scheduleHourUtc) || 14))
    });
    setStatus(response.ok ? "Report definition created." : "Failed to create report definition.");
    await refresh();
  };

  const runNow = async (definitionId: string) => {
    try {
      const run = await runReportDefinition(definitionId, "manual");
      setStatus(`Report run complete: ${run.rowCount} row(s) from ${run.scannedCount} scanned objects.`);
      await refresh();
    } catch {
      setStatus("Failed to run report definition.");
    }
  };

  const toggleEnabled = async (definition: ReportDefinition, enabled: boolean) => {
    const response = await updateReportDefinition(definition.id, { enabled });
    setStatus(response.ok ? `Report ${enabled ? "enabled" : "disabled"}.` : "Failed to update report definition.");
    await refresh();
  };

  const downloadRun = async (runId: string) => {
    try {
      const exported = await exportReportRun(runId);
      const mimeType = exported.format === "csv" ? "text/csv" : "application/json";
      const blob = new Blob([exported.content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setStatus(`Downloaded ${exported.fileName}.`);
    } catch {
      setStatus("Failed to export run artifact.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Create report definition</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Report name" />
            <Select value={objectType} onValueChange={setObjectType}>
              <SelectTrigger><SelectValue placeholder="Object type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Device">Device</SelectItem>
                <SelectItem value="Person">Person</SelectItem>
                <SelectItem value="SaaSAccount">SaaS Account</SelectItem>
                <SelectItem value="CloudResource">Cloud Resource</SelectItem>
                <SelectItem value="Contract">Contract</SelectItem>
              </SelectContent>
            </Select>
            <Input value={containsText} onChange={(event) => setContainsText(event.target.value)} placeholder="Contains text filter" />
            <Input value={columns} onChange={(event) => setColumns(event.target.value)} placeholder="Columns (csv)" />
          </div>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-20" />
          <div className="grid gap-2 md:grid-cols-2">
            <Select value={scheduleFrequency} onValueChange={(value) => setScheduleFrequency(value as "manual" | "daily" | "weekly")}>
              <SelectTrigger><SelectValue placeholder="Schedule" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
            <Input value={scheduleHourUtc} onChange={(event) => setScheduleHourUtc(event.target.value)} type="number" min={0} max={23} placeholder="Hour UTC" />
          </div>
          <Button className="rounded-xl" onClick={create}><Plus className="mr-2 h-4 w-4" />Create report</Button>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Saved reports ({definitions.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          {definitions.map((definition) => (
            <div key={definition.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{definition.name}</p>
              <p className="text-xs text-zinc-500">{definition.objectType ?? "Any"} • {definition.columns.join(", ")}</p>
              <p className="text-xs text-zinc-500">
                Schedule {definition.schedule?.frequency ?? "manual"}
                {definition.schedule?.hourUtc !== undefined ? ` @ ${definition.schedule.hourUtc}:00 UTC` : ""}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs">
                  <Switch checked={definition.enabled} onCheckedChange={(next) => toggleEnabled(definition, next)} />
                  {definition.enabled ? "Enabled" : "Disabled"}
                </label>
                <Button size="sm" variant="outline" className="rounded-md" onClick={() => runNow(definition.id)}>
                  <Play className="mr-1 h-3 w-3" />Run now
                </Button>
              </div>
            </div>
          ))}
          {definitions.length === 0 ? <p>No saved reports yet.</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Run history ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-600">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{run.id.slice(0, 8)} • {run.trigger} • {run.status}</p>
              <p>
                Rows {run.rowCount} from {run.scannedCount} scanned • {run.fileName}
              </p>
              <Button size="sm" variant="outline" className="mt-1 rounded-md" onClick={() => downloadRun(run.id)}>
                <Download className="mr-1 h-3 w-3" />Export artifact
              </Button>
            </div>
          ))}
          {runs.length === 0 ? <p>No report runs yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
