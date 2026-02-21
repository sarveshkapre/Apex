"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { reportDeviceLostStolen } from "@/lib/apex";

const toLocalDateTimeValue = (date: Date): string => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

type Props = {
  deviceId: string;
  assetLabel: string;
};

export function LostStolenReportDialog({ deviceId, assetLabel }: Props) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState("");
  const [lastKnownLocation, setLastKnownLocation] = React.useState("");
  const [occurredAt, setOccurredAt] = React.useState(toLocalDateTimeValue(new Date()));
  const [circumstances, setCircumstances] = React.useState("");
  const [suspectedTheft, setSuspectedTheft] = React.useState(false);
  const [requestImmediateLock, setRequestImmediateLock] = React.useState(true);
  const [requestWipe, setRequestWipe] = React.useState(false);
  const [createCredentialRotationTask, setCreateCredentialRotationTask] = React.useState(true);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");

    try {
      const data = await reportDeviceLostStolen({
        deviceId,
        reporterId: "person-1",
        lastKnownLocation,
        occurredAt: new Date(occurredAt).toISOString(),
        circumstances,
        suspectedTheft,
        requestImmediateLock,
        requestWipe,
        createCredentialRotationTask
      });

      setStatus(
        `Report submitted (${data.incident.id.slice(0, 8)}). Approvals: ${data.approvals.length}. Follow-up tasks: ${data.followUpTasks.length}.`
      );
      setTimeout(() => setOpen(false), 900);
    } catch {
      setStatus("Failed to submit lost/stolen report.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="rounded-lg text-rose-700">
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Report lost/stolen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Report Lost/Stolen Device</DialogTitle>
          <DialogDescription>
            Submit a guided security report for {assetLabel}. High-risk actions are approval-gated before execution.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-3" onSubmit={submit}>
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              value={lastKnownLocation}
              onChange={(event) => setLastKnownLocation(event.target.value)}
              placeholder="Last known location"
              required
            />
            <Input
              value={occurredAt}
              onChange={(event) => setOccurredAt(event.target.value)}
              type="datetime-local"
              required
            />
          </div>

          <Textarea
            value={circumstances}
            onChange={(event) => setCircumstances(event.target.value)}
            placeholder="Describe what happened and any relevant context"
            className="min-h-24"
            required
          />

          <div className="grid gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-sm text-zinc-700">
            <label className="flex items-center justify-between gap-3">
              <span>Suspected theft</span>
              <Switch checked={suspectedTheft} onCheckedChange={setSuspectedTheft} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Request immediate remote lock (high risk)</span>
              <Switch checked={requestImmediateLock} onCheckedChange={setRequestImmediateLock} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Request remote wipe (high risk)</span>
              <Switch checked={requestWipe} onCheckedChange={setRequestWipe} />
            </label>
            <label className="flex items-center justify-between gap-3">
              <span>Create credential rotation task</span>
              <Switch checked={createCredentialRotationTask} onCheckedChange={setCreateCredentialRotationTask} />
            </label>
          </div>

          {status ? <p className="text-xs text-zinc-600">{status}</p> : null}

          <DialogFooter>
            <Button type="submit" disabled={submitting} className="rounded-xl">
              {submitting ? "Submitting..." : "Submit security report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
