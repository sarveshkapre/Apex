"use client";

import * as React from "react";
import { Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { executeDeviceLifecycle, listDeviceLifecycleRuns, previewDeviceLifecycle } from "@/lib/apex";
import { DeviceLifecycleRun, DeviceLifecycleStage, GraphObject } from "@/lib/types";

const stageLabels: Record<DeviceLifecycleStage, string> = {
  request: "Request",
  fulfill: "Fulfill",
  deploy: "Deploy",
  monitor: "Monitor",
  service: "Service",
  return: "Return",
  retire: "Retire"
};

export function DeviceLifecycleLab({
  devices,
  initialRuns
}: {
  devices: GraphObject[];
  initialRuns: DeviceLifecycleRun[];
}) {
  const [runs, setRuns] = React.useState(initialRuns);
  const [status, setStatus] = React.useState("");
  const [preview, setPreview] = React.useState<DeviceLifecycleRun | null>(null);

  const [selectedDevice, setSelectedDevice] = React.useState(devices[0]?.id ?? "new-device");
  const [targetStage, setTargetStage] = React.useState<DeviceLifecycleStage>("request");
  const [location, setLocation] = React.useState("San Francisco");
  const [stockroom, setStockroom] = React.useState("SF-HQ");
  const [assigneePersonId, setAssigneePersonId] = React.useState("");
  const [model, setModel] = React.useState("MacBook Pro 14");
  const [vendor, setVendor] = React.useState("Apple");
  const [issueSummary, setIssueSummary] = React.useState("Battery health degradation");
  const [retirementReason, setRetirementReason] = React.useState("Refresh cycle complete");
  const [remoteReturn, setRemoteReturn] = React.useState(true);

  const deviceId = selectedDevice === "new-device" ? undefined : selectedDevice;

  const refresh = async (id?: string) => {
    const latest = await listDeviceLifecycleRuns(id);
    setRuns(latest);
  };

  const previewPlan = async () => {
    try {
      const run = await previewDeviceLifecycle({
        deviceId,
        targetStage,
        location,
        stockroom,
        assigneePersonId: assigneePersonId || undefined,
        remoteReturn,
        requesterId: "person-1",
        model,
        vendor,
        issueSummary: targetStage === "service" ? issueSummary : undefined,
        retirementReason: targetStage === "retire" ? retirementReason : undefined
      });
      setPreview(run);
      setStatus(`Preview ready: ${run.plan.steps.length} step(s), risk ${run.plan.riskLevel}.`);
      await refresh(deviceId);
    } catch {
      setStatus("Failed to generate device lifecycle preview.");
    }
  };

  const execute = async () => {
    try {
      const result = await executeDeviceLifecycle({
        deviceId,
        targetStage,
        location,
        stockroom,
        assigneePersonId: assigneePersonId || undefined,
        remoteReturn,
        requesterId: "person-1",
        model,
        vendor,
        issueSummary: targetStage === "service" ? issueSummary : undefined,
        retirementReason: targetStage === "retire" ? retirementReason : undefined,
        reason: `Lifecycle transition to ${targetStage}`
      });
      setPreview(result.run);
      setStatus(
        `Lifecycle executed: ${result.taskIds.length} task(s), ${result.approvalIds.length} approval(s), stage ${result.run.plan.targetStage}.`
      );
      await refresh(result.run.deviceId);
    } catch {
      setStatus("Failed to execute device lifecycle workflow.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Device Lifecycle Planner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Select value={selectedDevice} onValueChange={setSelectedDevice}>
              <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new-device">Create new lifecycle item</SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {String(device.fields.asset_tag ?? device.id)} ({String(device.fields.lifecycle_stage ?? "request")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={targetStage} onValueChange={(value) => setTargetStage(value as DeviceLifecycleStage)}>
              <SelectTrigger><SelectValue placeholder="Target stage" /></SelectTrigger>
              <SelectContent>
                {(Object.keys(stageLabels) as DeviceLifecycleStage[]).map((stage) => (
                  <SelectItem key={stage} value={stage}>{stageLabels[stage]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" />
            <Input value={stockroom} onChange={(event) => setStockroom(event.target.value)} placeholder="Stockroom" />
            <Input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Model" />
            <Input value={vendor} onChange={(event) => setVendor(event.target.value)} placeholder="Vendor" />
            <Input
              value={assigneePersonId}
              onChange={(event) => setAssigneePersonId(event.target.value)}
              placeholder="Assignee person id (deploy)"
            />
            {targetStage === "service" ? (
              <Input value={issueSummary} onChange={(event) => setIssueSummary(event.target.value)} placeholder="Service issue summary" />
            ) : targetStage === "retire" ? (
              <Input
                value={retirementReason}
                onChange={(event) => setRetirementReason(event.target.value)}
                placeholder="Retirement reason"
              />
            ) : (
              <Input value={retirementReason} onChange={(event) => setRetirementReason(event.target.value)} placeholder="Optional notes" />
            )}
          </div>
          <label className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 sm:max-w-xs">
            Remote shipping/return flow
            <Switch checked={remoteReturn} onCheckedChange={setRemoteReturn} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" onClick={previewPlan}>
              <Sparkles className="mr-2 h-4 w-4" />Preview plan
            </Button>
            <Button className="rounded-xl" onClick={execute}>
              <Play className="mr-2 h-4 w-4" />Execute lifecycle
            </Button>
          </div>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      {preview ? (
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Latest lifecycle plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-zinc-600">
            <p>
              {stageLabels[preview.plan.currentStage]} → {stageLabels[preview.plan.targetStage]} • risk {preview.plan.riskLevel}
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
          <CardTitle className="text-base">Lifecycle run history ({runs.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-zinc-600">
          {runs.map((run) => (
            <div key={run.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{run.id.slice(0, 8)} • {run.mode} • {run.status}</p>
              <p>{stageLabels[run.plan.currentStage]} → {stageLabels[run.plan.targetStage]} • risk {run.plan.riskLevel}</p>
              <p>Tasks {run.createdTaskIds.length} • Approvals {run.createdApprovalIds.length}</p>
            </div>
          ))}
          {runs.length === 0 ? <p>No lifecycle runs yet.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
