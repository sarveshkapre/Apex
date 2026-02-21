"use client";

import * as React from "react";
import { FlaskConical, Play, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createWorkflowDefinition,
  simulateWorkflowDefinition,
  transitionWorkflowDefinition
} from "@/lib/apex";
import { WorkflowDefinition, WorkflowSimulationResult } from "@/lib/types";

export function WorkflowStudio({ initial }: { initial: WorkflowDefinition[] }) {
  const [definitions, setDefinitions] = React.useState(initial);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [simulation, setSimulation] = React.useState<WorkflowSimulationResult | null>(null);

  const createDraft = async () => {
    if (!name) {
      return;
    }

    const response = await createWorkflowDefinition({
      name,
      playbook: "Custom",
      triggerKind: "manual",
      triggerValue: "manual.custom",
      steps: [
        { name: "Collect request", type: "human-task", riskLevel: "low" },
        { name: "Run automation", type: "automation", riskLevel: "medium" },
        { name: "Manager approval", type: "approval", riskLevel: "medium" }
      ]
    });

    if (!response.ok) {
      setStatus("Failed to create workflow draft.");
      return;
    }

    const json = await response.json();
    setDefinitions((items) => [...items, json.data]);
    setName("");
    setStatus("Workflow draft created.");
  };

  const publish = async (id: string) => {
    const response = await transitionWorkflowDefinition(id, "publish", "Ready for production use");
    setStatus(response.ok ? "Workflow published." : "Workflow publish failed.");
  };

  const rollback = async (id: string) => {
    const response = await transitionWorkflowDefinition(id, "rollback", "Rollback requested by admin");
    setStatus(response.ok ? "Workflow rolled back." : "Workflow rollback failed.");
  };

  const simulate = async (id: string) => {
    setSimulation(await simulateWorkflowDefinition(id, { requesterId: "person-1" }));
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Workflow builder</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="New workflow draft name" className="max-w-sm" />
          <Button onClick={createDraft} className="rounded-xl"><Upload className="mr-2 h-4 w-4" />Create draft</Button>
          {status ? <p className="self-center text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-3">
        {definitions.map((workflow) => (
          <Card key={workflow.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-medium text-zinc-900">{workflow.name}</p>
                  <p className="text-xs text-zinc-500">{workflow.playbook} • v{workflow.version}</p>
                </div>
                <p className="text-xs text-zinc-500">{workflow.active ? "Published" : "Draft"}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="rounded-md" onClick={() => simulate(workflow.id)}>
                  <FlaskConical className="mr-1 h-3 w-3" />Simulate
                </Button>
                <Button size="sm" variant="outline" className="rounded-md" onClick={() => publish(workflow.id)}>
                  <Play className="mr-1 h-3 w-3" />Publish
                </Button>
                <Button size="sm" variant="outline" className="rounded-md" onClick={() => rollback(workflow.id)}>
                  <RotateCcw className="mr-1 h-3 w-3" />Rollback
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {simulation ? (
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader><CardTitle className="text-base">Simulation output</CardTitle></CardHeader>
          <CardContent>
            <pre className="overflow-auto rounded-lg bg-zinc-900/95 p-3 text-xs text-zinc-100">{JSON.stringify(simulation, null, 2)}</pre>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
