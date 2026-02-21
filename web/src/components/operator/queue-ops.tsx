"use client";

import * as React from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { linkExternalTicket } from "@/lib/apex";
import { SlaBreach, WorkItem } from "@/lib/types";

export function QueueOps({ items, breaches }: { items: WorkItem[]; breaches: SlaBreach[] }) {
  const [ticketId, setTicketId] = React.useState("");
  const [workItemId, setWorkItemId] = React.useState(items[0]?.id ?? "");
  const [status, setStatus] = React.useState("");

  const link = async () => {
    if (!ticketId || !workItemId) {
      return;
    }
    const response = await linkExternalTicket({
      workItemId,
      provider: "Jira",
      externalTicketId: ticketId
    });
    setStatus(response.ok ? "External ticket linked." : "Failed to link ticket.");
    setTicketId("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="mb-2 text-sm font-medium text-zinc-900">SLA breaches ({breaches.length})</p>
        <div className="space-y-1.5 text-xs text-zinc-600">
          {breaches.map((breach) => (
            <p key={breach.workItemId}>
              {breach.title} • {breach.assignmentGroup} • {breach.elapsedMinutes} minutes elapsed
            </p>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="mb-2 text-sm font-medium text-zinc-900">Overlay external ticket</p>
        <div className="flex flex-wrap gap-2">
          <Input value={workItemId} onChange={(event) => setWorkItemId(event.target.value)} placeholder="Work item id" className="max-w-[220px]" />
          <Input value={ticketId} onChange={(event) => setTicketId(event.target.value)} placeholder="External ticket id" className="max-w-[220px]" />
          <Button size="sm" variant="outline" className="rounded-lg" onClick={link}><Link2 className="mr-1.5 h-3.5 w-3.5" />Link</Button>
        </div>
        {status ? <p className="mt-2 text-xs text-zinc-500">{status}</p> : null}
      </div>
    </div>
  );
}
