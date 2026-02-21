"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getEvidencePackage } from "@/lib/apex";
import { EvidencePackage, WorkItem } from "@/lib/types";

export function EvidenceExport({ workItems }: { workItems: WorkItem[] }) {
  const [selectedWorkItemId, setSelectedWorkItemId] = React.useState(workItems[0]?.id ?? "");
  const [status, setStatus] = React.useState("");
  const [evidence, setEvidence] = React.useState<EvidencePackage | null>(null);

  const generate = async () => {
    if (!selectedWorkItemId) {
      return;
    }
    try {
      const data = await getEvidencePackage(selectedWorkItemId);
      setEvidence(data);
      setStatus(`Evidence package generated at ${new Date(data.generatedAt).toLocaleString()}.`);
    } catch {
      setStatus("Failed to generate evidence package.");
    }
  };

  const download = () => {
    if (!evidence) {
      return;
    }
    const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `evidence-${evidence.workItemId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
      <CardHeader>
        <CardTitle className="text-base">Evidence package export</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            value={selectedWorkItemId}
            onChange={(event) => setSelectedWorkItemId(event.target.value)}
            placeholder="Work item id"
            className="max-w-[320px]"
          />
          <Button variant="outline" className="rounded-xl" onClick={generate}>Generate package</Button>
          <Button variant="outline" className="rounded-xl" onClick={download} disabled={!evidence}>
            <Download className="mr-2 h-4 w-4" />Download JSON
          </Button>
        </div>
        <p className="text-xs text-zinc-500">
          Available work items: {workItems.slice(0, 8).map((item) => `${item.id} (${item.type})`).join(", ")}
        </p>
        {status ? <p className="text-xs text-zinc-600">{status}</p> : null}
        {evidence ? (
          <div className="grid gap-2 text-xs text-zinc-600 sm:grid-cols-4">
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Timeline events: {evidence.timeline.length}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Approvals: {evidence.approvals.length}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Action logs: {evidence.actionLogs.length}</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Affected objects: {evidence.affectedObjects.length}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
