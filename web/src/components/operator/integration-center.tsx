"use client";

import * as React from "react";
import { Play, Plus } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createConnector, runConnector } from "@/lib/apex";
import { ConnectorConfig } from "@/lib/types";

export function IntegrationCenter({ initial }: { initial: ConnectorConfig[] }) {
  const [connectors, setConnectors] = React.useState(initial);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState("");

  const create = async () => {
    if (!name) {
      return;
    }
    const response = await createConnector({ name, type: "IdP" });
    if (response.ok) {
      const json = await response.json();
      setConnectors((items) => [...items, json.data]);
      setName("");
      setStatus("Connector created.");
    } else {
      setStatus("Failed to create connector.");
    }
  };

  const run = async (id: string) => {
    const response = await runConnector(id, "sync");
    setStatus(response.ok ? "Connector run started." : "Connector run failed.");
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Add connector</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Connector display name" className="max-w-sm" />
          <Button onClick={create} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Create</Button>
          {status ? <p className="self-center text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {connectors.map((connector) => (
          <Card key={connector.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{connector.name}</CardTitle>
                <p className="text-xs text-zinc-500">{connector.type} • {connector.mode}</p>
              </div>
              <StatusBadge value={connector.status} />
            </CardHeader>
            <CardContent>
              <div className="mb-3 grid gap-2 text-xs text-zinc-600 sm:grid-cols-3">
                <p>Ingested: {connector.recordsIngested}</p>
                <p>Updated: {connector.recordsUpdated}</p>
                <p>Failed: {connector.recordsFailed}</p>
              </div>
              <Button size="sm" variant="outline" className="rounded-lg" onClick={() => run(connector.id)}>
                <Play className="mr-1.5 h-3.5 w-3.5" />Run sync
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
