import { AlertTriangle, PlayCircle } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { RunWorkflowButton } from "@/components/operator/run-workflow-button";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listWorkflowDefinitions } from "@/lib/apex";

export default async function WorkflowsPage() {
  const workflows = await listWorkflowDefinitions();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Workflows & Playbooks"
        description="Versioned workflow catalog with dry-run/live controls, risk visibility, and exception handling."
      />

      <div className="grid gap-3">
        {workflows.map((workflow) => (
          <Card key={workflow.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{workflow.name}</CardTitle>
                <p className="text-xs text-zinc-500">{workflow.playbook} • v{workflow.version}</p>
              </div>
              <StatusBadge value={workflow.active ? "Active" : "Inactive"} />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                <p className="mb-1 inline-flex items-center gap-1 text-zinc-800"><PlayCircle className="h-3.5 w-3.5" />Plan preview</p>
                Risk breakdown: low-medium-high execution with approval gates where required.
              </div>
              <RunWorkflowButton definitionId={workflow.id} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Exception queue policy</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-600">
          <p className="inline-flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Failed automation actions always create exception work items with retry and escalation context.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
