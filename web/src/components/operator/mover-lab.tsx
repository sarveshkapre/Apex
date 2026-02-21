"use client";

import * as React from "react";
import { Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { executeJmlMover, listJmlMoverRuns, previewJmlMover } from "@/lib/apex";
import { GraphObject, JmlMoverRun } from "@/lib/types";

export function MoverLab({
  people,
  initialRuns
}: {
  people: GraphObject[];
  initialRuns: JmlMoverRun[];
}) {
  const [runs, setRuns] = React.useState(initialRuns);
  const [status, setStatus] = React.useState("");
  const [preview, setPreview] = React.useState<JmlMoverRun | null>(null);

  const [personId, setPersonId] = React.useState(people[0]?.id ?? "");
  const [targetRole, setTargetRole] = React.useState("manager");
  const [targetDepartment, setTargetDepartment] = React.useState("Product");
  const [targetLocation, setTargetLocation] = React.useState("New York");

  const refresh = async (selectedPersonId?: string) => {
    const latest = await listJmlMoverRuns(selectedPersonId);
    setRuns(latest);
  };

  const previewPlan = async () => {
    if (!personId) {
      return;
    }
    try {
      const plan = await previewJmlMover({
        personId,
        targetRole,
        targetDepartment,
        targetLocation,
        requesterId: "person-1"
      });
      setPreview(plan);
      setStatus(`Preview generated with ${plan.plan.approvalsRequired.length} approval step(s).`);
      await refresh(personId);
    } catch {
      setStatus("Failed to generate mover preview.");
    }
  };

  const execute = async () => {
    if (!personId) {
      return;
    }
    try {
      const result = await executeJmlMover({
        personId,
        targetRole,
        targetDepartment,
        targetLocation,
        requesterId: "person-1",
        reason: "Role/location change approved"
      });
      setStatus(`Mover executed: ${result.taskIds.length} tasks and ${result.approvalIds.length} approvals created.`);
      setPreview(result.run);
      await refresh(personId);
    } catch {
      setStatus("Failed to execute mover workflow.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">JML Mover Planner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Select value={personId} onValueChange={setPersonId}>
              <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
              <SelectContent>
                {people.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {String(person.fields.legal_name ?? person.id)} ({String(person.fields.role_profile ?? person.fields.job_title ?? "role")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={targetRole} onChange={(event) => setTargetRole(event.target.value)} placeholder="Target role" />
            <Input value={targetDepartment} onChange={(event) => setTargetDepartment(event.target.value)} placeholder="Target department" />
            <Input value={targetLocation} onChange={(event) => setTargetLocation(event.target.value)} placeholder="Target location" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" onClick={previewPlan}>
              <Sparkles className="mr-2 h-4 w-4" />Preview diff
            </Button>
            <Button className="rounded-xl" onClick={execute}>
              <Play className="mr-2 h-4 w-4" />Execute mover
            </Button>
          </div>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Latest mover plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-zinc-600">
            <p>
              {preview.plan.currentRole} → {preview.plan.targetRole} • risk {preview.plan.riskLevel}
            </p>
            <p>Add groups: {preview.plan.addGroups.join(", ") || "none"}</p>
            <p>Remove groups: {preview.plan.removeGroups.join(", ") || "none"}</p>
            <p>Add apps: {preview.plan.addApps.join(", ") || "none"}</p>
            <p>Remove apps: {preview.plan.removeApps.join(", ") || "none"}</p>
            <p>Approvals: {preview.plan.approvalsRequired.join(", ") || "none"}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Mover run history ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-600">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{run.id.slice(0, 8)} • {run.mode} • {run.status}</p>
              <p>{run.plan.currentRole} → {run.plan.targetRole} • risk {run.plan.riskLevel}</p>
              <p>Tasks {run.createdTaskIds.length} • Approvals {run.createdApprovalIds.length}</p>
            </div>
          ))}
          {runs.length === 0 ? <p>No mover runs yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
