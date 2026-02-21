"use client";

import * as React from "react";
import { Play, Plus } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createPolicy, evaluatePolicy } from "@/lib/apex";
import { PolicyDefinition } from "@/lib/types";

export function PolicyCenter({ initial }: { initial: PolicyDefinition[] }) {
  const [policies, setPolicies] = React.useState(initial);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState("");

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
  };

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
                <p className="text-xs text-zinc-500">{policy.objectType} • v{policy.version}</p>
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
    </div>
  );
}
