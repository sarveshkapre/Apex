"use client";

import * as React from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunWorkflowButton({ definitionId }: { definitionId: string }) {
  const [status, setStatus] = React.useState<string>("");
  const [pending, setPending] = React.useState(false);

  const run = async () => {
    setPending(true);
    setStatus("");
    try {
      const response = await fetch("/api/apex/workflows/runs", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-actor-id": "operator-1",
          "x-actor-role": "it-agent"
        },
        body: JSON.stringify({
          definitionId,
          tenantId: "tenant-demo",
          workspaceId: "workspace-demo",
          inputs: {}
        })
      });

      if (!response.ok) {
        throw new Error("workflow failed");
      }

      const json = await response.json();
      setStatus(`Run started (${json.data.status})`);
    } catch {
      setStatus("Unable to start run right now.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="outline" onClick={run} disabled={pending} className="rounded-lg">
        <Play className="mr-1.5 h-3.5 w-3.5" />
        {pending ? "Running..." : "Run"}
      </Button>
      {status ? <span className="text-xs text-zinc-500">{status}</span> : null}
    </div>
  );
}
