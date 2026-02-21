"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

type RequestAction = {
  label: string;
  type: "Request" | "Incident" | "Change";
  priority: "P0" | "P1" | "P2" | "P3" | "P4";
  title: string;
  description: string;
  tags: string[];
  className?: string;
};

export function LinkedRequestActions({
  objectId,
  assignmentGroup,
  actions
}: {
  objectId: string;
  assignmentGroup: string;
  actions: RequestAction[];
}) {
  const [status, setStatus] = React.useState("");
  const [submittingLabel, setSubmittingLabel] = React.useState<string | null>(null);

  const createActionRequest = async (action: RequestAction) => {
    setSubmittingLabel(action.label);
    setStatus("");

    try {
      const response = await fetch("/api/apex/work-items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-actor-id": "portal-user-1",
          "x-actor-role": "end-user"
        },
        body: JSON.stringify({
          tenantId: "tenant-demo",
          workspaceId: "workspace-demo",
          type: action.type,
          priority: action.priority,
          title: action.title,
          description: action.description,
          requesterId: "person-1",
          assignmentGroup,
          linkedObjectIds: [objectId],
          tags: ["portal", ...action.tags]
        })
      });

      if (!response.ok) {
        throw new Error("Failed to submit request");
      }

      setStatus(`${action.label} submitted.`);
    } catch {
      setStatus(`Failed to submit ${action.label.toLowerCase()}.`);
    } finally {
      setSubmittingLabel(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            size="sm"
            variant="outline"
            className={`rounded-lg ${action.className ?? ""}`.trim()}
            onClick={() => createActionRequest(action)}
            disabled={submittingLabel !== null}
          >
            {submittingLabel === action.label ? "Submitting..." : action.label}
          </Button>
        ))}
      </div>
      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
