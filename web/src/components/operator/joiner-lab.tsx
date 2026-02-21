"use client";

import * as React from "react";
import { Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { executeJmlJoiner, listJmlJoinerRuns, previewJmlJoiner } from "@/lib/apex";
import { JmlJoinerRun } from "@/lib/types";

const parseCsv = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const toIso = (value: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return date.toISOString();
};

export function JoinerLab({ initialRuns }: { initialRuns: JmlJoinerRun[] }) {
  const [runs, setRuns] = React.useState(initialRuns);
  const [status, setStatus] = React.useState("");
  const [preview, setPreview] = React.useState<JmlJoinerRun | null>(null);

  const [legalName, setLegalName] = React.useState("New Hire");
  const [email, setEmail] = React.useState("new.hire@example.com");
  const [startDate, setStartDate] = React.useState(new Date().toISOString().slice(0, 16));
  const [location, setLocation] = React.useState("San Francisco");
  const [role, setRole] = React.useState("engineer");
  const [managerId, setManagerId] = React.useState("manager-approver");
  const [employmentType, setEmploymentType] = React.useState<"employee" | "contractor" | "intern">("employee");
  const [deviceTypePreference, setDeviceTypePreference] = React.useState<"laptop" | "desktop" | "phone" | "tablet">("laptop");
  const [requiredApps, setRequiredApps] = React.useState("GitHub,Slack,Jira");
  const [remote, setRemote] = React.useState(true);

  const refresh = async (queryEmail?: string) => {
    const latest = await listJmlJoinerRuns(queryEmail ? { email: queryEmail } : undefined);
    setRuns(latest);
  };

  const previewPlan = async () => {
    try {
      const run = await previewJmlJoiner({
        legalName,
        email,
        startDate: toIso(startDate),
        location,
        role,
        managerId,
        employmentType,
        requiredApps: parseCsv(requiredApps),
        deviceTypePreference,
        remote,
        requesterId: "person-1"
      });
      setPreview(run);
      setStatus(`Preview generated with ${run.plan.steps.length} step(s), risk ${run.plan.riskLevel}.`);
      await refresh(email);
    } catch {
      setStatus("Failed to generate joiner preview.");
    }
  };

  const execute = async () => {
    try {
      const result = await executeJmlJoiner({
        legalName,
        email,
        startDate: toIso(startDate),
        location,
        role,
        managerId,
        employmentType,
        requiredApps: parseCsv(requiredApps),
        deviceTypePreference,
        remote,
        requesterId: "person-1",
        reason: "Approved onboarding request"
      });
      setPreview(result.run);
      setStatus(
        `Joiner executed: ${result.taskIds.length} task(s), ${result.approvalIds.length} approval(s), ${result.createdObjectIds.length} object(s).`
      );
      await refresh(email);
    } catch {
      setStatus("Failed to execute joiner workflow.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">JML Joiner Planner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Legal name" />
            <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" />
            <Input type="datetime-local" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" />
            <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role profile" />
            <Input value={managerId} onChange={(event) => setManagerId(event.target.value)} placeholder="Manager id" />
            <Select value={employmentType} onValueChange={(value) => setEmploymentType(value as "employee" | "contractor" | "intern")}>
              <SelectTrigger><SelectValue placeholder="Employment type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Employee</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={deviceTypePreference}
              onValueChange={(value) => setDeviceTypePreference(value as "laptop" | "desktop" | "phone" | "tablet")}
            >
              <SelectTrigger><SelectValue placeholder="Device type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="laptop">Laptop</SelectItem>
                <SelectItem value="desktop">Desktop</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
                <SelectItem value="tablet">Tablet</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            value={requiredApps}
            onChange={(event) => setRequiredApps(event.target.value)}
            placeholder="Requested apps (csv)"
          />
          <label className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 sm:max-w-xs">
            Remote onboarding
            <Switch checked={remote} onCheckedChange={setRemote} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" onClick={previewPlan}>
              <Sparkles className="mr-2 h-4 w-4" />Preview plan
            </Button>
            <Button className="rounded-xl" onClick={execute}>
              <Play className="mr-2 h-4 w-4" />Execute joiner
            </Button>
          </div>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Latest joiner plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-zinc-600">
            <p>
              {preview.plan.legalName} ({preview.plan.role}) • risk {preview.plan.riskLevel}
            </p>
            <p>Baseline groups: {preview.plan.baselineGroups.join(", ") || "none"}</p>
            <p>Apps: {[...preview.plan.baselineApps, ...preview.plan.requestedApps].join(", ") || "none"}</p>
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
          <CardTitle className="text-base">Joiner run history ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-600">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{run.id.slice(0, 8)} • {run.mode} • {run.status}</p>
              <p>{run.plan.legalName} • {run.plan.role} • {run.plan.location}</p>
              <p>Tasks {run.createdTaskIds.length} • Approvals {run.createdApprovalIds.length} • Objects {run.createdObjectIds.length}</p>
            </div>
          ))}
          {runs.length === 0 ? <p>No joiner runs yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
