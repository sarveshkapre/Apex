import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { LeaverLab } from "@/components/operator/leaver-lab";
import { MoverLab } from "@/components/operator/mover-lab";
import { WorkflowStudio } from "@/components/operator/workflow-studio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listJmlLeaverRuns, listJmlMoverRuns, listObjectsByType, listWorkflowDefinitions } from "@/lib/apex";

export default async function WorkflowsPage() {
  const [workflows, people, moverRuns, leaverRuns] = await Promise.all([
    listWorkflowDefinitions(),
    listObjectsByType("Person"),
    listJmlMoverRuns(),
    listJmlLeaverRuns()
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Workflows & Playbooks"
        description="Workflow builder with draft/publish lifecycle, simulation, and rollback controls."
      />

      <WorkflowStudio initial={workflows} />

      <MoverLab people={people} initialRuns={moverRuns} />
      <LeaverLab people={people} initialRuns={leaverRuns} />

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Exception queue policy</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600">
          <p className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Failed automation actions are routed into exception work items with retry, resolve, and escalation actions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
