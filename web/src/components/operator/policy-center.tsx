"use client";

import * as React from "react";
import { CheckCheck, Play, Plus, RotateCcw, ShieldAlert, TimerReset } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { actionPolicyException, createPolicy, evaluatePolicy, listPolicyExceptions } from "@/lib/apex";
import { PolicyDefinition, PolicyException } from "@/lib/types";

export function PolicyCenter({ initial, initialExceptions }: { initial: PolicyDefinition[]; initialExceptions: PolicyException[] }) {
  const [policies, setPolicies] = React.useState(initial);
  const [exceptions, setExceptions] = React.useState(initialExceptions);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [waiverExpiryAt, setWaiverExpiryAt] = React.useState("");
  const [filterStatus, setFilterStatus] = React.useState<"all" | "open" | "waived" | "resolved">("all");

  const refreshExceptions = async (nextStatus = filterStatus) => {
    const data = await listPolicyExceptions(undefined, nextStatus === "all" ? undefined : nextStatus);
    setExceptions(data);
  };

  const create = async () => {
    if (!name) {
      return;
    }

    const response = await createPolicy({
      name,
      objectType: "Device",
      field: "encryption_state",
      value: "enabled"
    });

    if (!response.ok) {
      setStatus("Failed to create policy.");
      return;
    }

    const json = await response.json();
    setPolicies((items) => [...items, json.data]);
    setName("");
    setStatus("Policy created.");
  };

  const evaluate = async (id: string) => {
    const result = await evaluatePolicy(id);
    setStatus(`Evaluated ${result.evaluatedCount} objects, ${result.exceptionCount} exceptions.`);
    await refreshExceptions();
  };

  const actOnException = async (
    exceptionId: string,
    action: "waive" | "resolve" | "reopen" | "renew",
    reason: string
  ) => {
    const payload: {
      action: "waive" | "resolve" | "reopen" | "renew";
      reason: string;
      waiverExpiresAt?: string;
    } = { action, reason };

    if (action === "waive" || action === "renew") {
      if (!waiverExpiryAt) {
        setStatus("Set waiver expiry date before waive/renew.");
        return;
      }
      payload.waiverExpiresAt = `${waiverExpiryAt}T23:59:59.000Z`;
    }

    const response = await actionPolicyException(exceptionId, payload);
    setStatus(response.ok ? `Exception ${action} action applied.` : `Failed to ${action} exception.`);
    await refreshExceptions();
  };

  const groupedByPolicy = React.useMemo(() => {
    const byPolicy: Record<string, number> = {};
    for (const item of exceptions) {
      byPolicy[item.policyId] = (byPolicy[item.policyId] ?? 0) + 1;
    }
    return byPolicy;
  }, [exceptions]);

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Create policy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Policy name" className="max-w-sm" />
          <Button onClick={create} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Create</Button>
          {status ? <p className="self-center text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {policies.map((policy) => (
          <Card key={policy.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{policy.name}</CardTitle>
                <p className="text-xs text-zinc-500">{policy.objectType} • v{policy.version} • {groupedByPolicy[policy.id] ?? 0} exception(s)</p>
              </div>
              <StatusBadge value={policy.active ? "Active" : "Inactive"} />
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-zinc-600">{policy.description}</p>
              <Button size="sm" variant="outline" className="rounded-lg" onClick={() => evaluate(policy.id)}>
                <Play className="mr-1.5 h-3.5 w-3.5" />Evaluate now
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Policy exceptions lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              value={waiverExpiryAt}
              onChange={(event) => setWaiverExpiryAt(event.target.value)}
              placeholder="Waiver expiry"
              className="max-w-[120px]"
            />
            <Button variant={filterStatus === "all" ? "default" : "outline"} className="rounded-lg" onClick={() => {
              setFilterStatus("all");
              void refreshExceptions("all");
            }}>All</Button>
            <Button variant={filterStatus === "open" ? "default" : "outline"} className="rounded-lg" onClick={() => {
              setFilterStatus("open");
              void refreshExceptions("open");
            }}>Open</Button>
            <Button variant={filterStatus === "waived" ? "default" : "outline"} className="rounded-lg" onClick={() => {
              setFilterStatus("waived");
              void refreshExceptions("waived");
            }}>Waived</Button>
            <Button variant={filterStatus === "resolved" ? "default" : "outline"} className="rounded-lg" onClick={() => {
              setFilterStatus("resolved");
              void refreshExceptions("resolved");
            }}>Resolved</Button>
          </div>

          <div className="space-y-2 text-xs text-zinc-600">
            {exceptions.length === 0 ? <p>No exceptions in selected filter.</p> : null}
            {exceptions.map((exception) => (
              <div key={exception.id} className="rounded-lg border border-zinc-200 bg-white p-2">
                <p className="font-medium text-zinc-900">{exception.reason}</p>
                <p className="text-zinc-500">{exception.id} • policy {exception.policyId} • object {exception.objectId}</p>
                <p className="text-zinc-500">Status: {exception.status}{exception.waiverExpiresAt ? ` • expires ${exception.waiverExpiresAt}` : ""}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="rounded-md" onClick={() => actOnException(exception.id, "waive", "Temporary waiver approved") }>
                    <ShieldAlert className="mr-1 h-3 w-3" />Waive
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-md" onClick={() => actOnException(exception.id, "renew", "Waiver renewal approved") }>
                    <TimerReset className="mr-1 h-3 w-3" />Renew
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-md" onClick={() => actOnException(exception.id, "resolve", "Control remediated") }>
                    <CheckCheck className="mr-1 h-3 w-3" />Resolve
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-md" onClick={() => actOnException(exception.id, "reopen", "Reopened after drift") }>
                    <RotateCcw className="mr-1 h-3 w-3" />Reopen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
