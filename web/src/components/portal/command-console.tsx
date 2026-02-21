"use client";

import * as React from "react";
import { AlertCircle, Bot, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function CommandConsole() {
  const [query, setQuery] = React.useState("Show all laptops not checked in for 14 days in SF office");
  const [objective, setObjective] = React.useState("Offboard Sam today and recover all assets");
  const [answer, setAnswer] = React.useState<string>("");
  const [plan, setPlan] = React.useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = React.useState<string>("");

  const runQuery = async () => {
    setError("");
    try {
      const response = await fetch("/api/apex/ai/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: query })
      });
      const json = await response.json();
      setAnswer(`${json.data.answer} (confidence ${(json.data.confidence * 100).toFixed(0)}%)`);
    } catch {
      setError("Query unavailable. Backend API may be offline.");
    }
  };

  const previewPlan = async () => {
    setError("");
    try {
      const response = await fetch("/api/apex/ai/plan-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ objective })
      });
      const json = await response.json();
      setPlan(json.data.plan ?? []);
    } catch {
      setError("Plan preview unavailable. Backend API may be offline.");
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Natural language query</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} />
          <Button onClick={runQuery} className="rounded-xl">
            <Bot className="mr-2 h-4 w-4" />
            Run query
          </Button>
          {answer ? <p className="text-sm text-zinc-700">{answer}</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Plan then execute</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={objective} onChange={(event) => setObjective(event.target.value)} className="min-h-20" />
          <Button onClick={previewPlan} variant="outline" className="rounded-xl">
            <Play className="mr-2 h-4 w-4" />
            Preview plan
          </Button>
          {plan.length > 0 ? (
            <div className="space-y-2">
              {plan.map((step, index) => (
                <div key={String(step.stepId ?? index)} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                  <p className="text-sm font-medium text-zinc-900">
                    {index + 1}. {String(step.name)}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {String(step.type)} • risk {String(step.riskLevel)} •
                    {step.requiresApproval ? " approval required" : " auto-executable"}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {error ? (
            <p className="inline-flex items-center gap-1 text-xs text-rose-600">
              <AlertCircle className="h-3.5 w-3.5" />
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
