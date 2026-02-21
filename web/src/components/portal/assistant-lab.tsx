"use client";

import * as React from "react";
import { Bot, FileCode2, Lightbulb, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getAiInsights } from "@/lib/apex";
import { AiInsight } from "@/lib/types";

type DraftPayload = Record<string, unknown>;

export function AssistantLab() {
  const [prompt, setPrompt] = React.useState("Create a policy: laptops must have encryption and EDR");
  const [policyDraft, setPolicyDraft] = React.useState<DraftPayload | null>(null);
  const [workflowDraft, setWorkflowDraft] = React.useState<DraftPayload | null>(null);
  const [insights, setInsights] = React.useState<AiInsight[]>([]);
  const [status, setStatus] = React.useState("");

  const generatePolicy = async () => {
    const response = await fetch("/api/apex/ai/policy-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    if (!response.ok) {
      setStatus("Policy draft generation failed.");
      return;
    }
    const json = await response.json();
    setPolicyDraft(json.data.draftPolicy);
    setStatus("Policy draft ready for admin review.");
  };

  const generateWorkflow = async () => {
    const response = await fetch("/api/apex/ai/workflow-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt })
    });
    if (!response.ok) {
      setStatus("Workflow draft generation failed.");
      return;
    }
    const json = await response.json();
    setWorkflowDraft(json.data.workflow);
    setStatus("Workflow draft ready for admin review.");
  };

  const loadInsights = async () => {
    setInsights(await getAiInsights());
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Assistant authoring prompt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={prompt} onChange={(event) => setPrompt(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={generatePolicy} className="rounded-xl"><FileCode2 className="mr-2 h-4 w-4" />Policy draft</Button>
            <Button variant="outline" onClick={generateWorkflow} className="rounded-xl"><Workflow className="mr-2 h-4 w-4" />Workflow draft</Button>
            <Button variant="outline" onClick={loadInsights} className="rounded-xl"><Lightbulb className="mr-2 h-4 w-4" />Anomaly insights</Button>
          </div>
          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85 xl:col-span-1">
          <CardHeader><CardTitle className="text-base">Policy draft</CardTitle></CardHeader>
          <CardContent className="text-xs text-zinc-600">
            <pre className="overflow-auto rounded-lg bg-zinc-900/95 p-3 text-zinc-100">{JSON.stringify(policyDraft, null, 2)}</pre>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85 xl:col-span-1">
          <CardHeader><CardTitle className="text-base">Workflow draft</CardTitle></CardHeader>
          <CardContent className="text-xs text-zinc-600">
            <pre className="overflow-auto rounded-lg bg-zinc-900/95 p-3 text-zinc-100">{JSON.stringify(workflowDraft, null, 2)}</pre>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85 xl:col-span-1">
          <CardHeader><CardTitle className="text-base">Insights</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            {insights.length === 0 ? (
              <p className="text-xs text-zinc-500">Run anomaly insights to populate this panel.</p>
            ) : (
              insights.map((insight) => (
                <p key={insight.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <span className="block font-medium text-zinc-800">{insight.title}</span>
                  <span className="text-xs">{insight.severity} • {insight.summary}</span>
                </p>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="inline-flex items-center gap-2 text-xs text-zinc-500"><Bot className="h-3.5 w-3.5" />AI drafts are suggestion-only until reviewed and published.</p>
    </div>
  );
}
