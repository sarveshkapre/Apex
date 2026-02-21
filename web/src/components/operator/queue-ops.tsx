"use client";

import * as React from "react";
import { Check, Link2, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  decideApproval,
  delegateApproval,
  linkExternalTicket,
  runExceptionAction
} from "@/lib/apex";
import { Approval, SlaBreach, WorkItem } from "@/lib/types";

export function QueueOps({
  items,
  breaches,
  approvals,
  exceptions
}: {
  items: WorkItem[];
  breaches: SlaBreach[];
  approvals: Approval[];
  exceptions: WorkItem[];
}) {
  const [ticketId, setTicketId] = React.useState("");
  const [workItemId, setWorkItemId] = React.useState(items[0]?.id ?? "");
  const [delegateTo, setDelegateTo] = React.useState("backup-approver");
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
        <p className="mb-2 text-sm font-medium text-zinc-900">Approvals inbox ({approvals.length})</p>
        <div className="space-y-2 text-xs text-zinc-600">
          {approvals.map((approval) => (
            <div key={approval.id} className="rounded-lg border border-zinc-200 p-2">
              <p className="mb-1">Approval {approval.id.slice(0, 8)} • {approval.type} • {approval.decision}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="rounded-md" onClick={async () => {
                  const response = await decideApproval(approval.id, "approved", "Approved in queue center");
                  setStatus(response.ok ? "Approval approved." : "Approval update failed.");
                }}>
                  <Check className="mr-1 h-3 w-3" />Approve
                </Button>
                <Button size="sm" variant="outline" className="rounded-md" onClick={async () => {
                  const response = await decideApproval(approval.id, "rejected", "Insufficient context");
                  setStatus(response.ok ? "Approval rejected." : "Approval update failed.");
                }}>
                  <X className="mr-1 h-3 w-3" />Reject
                </Button>
                <div className="inline-flex items-center gap-1">
                  <Input value={delegateTo} onChange={(event) => setDelegateTo(event.target.value)} className="h-8 max-w-[150px]" />
                  <Button size="sm" variant="outline" className="rounded-md" onClick={async () => {
                    const response = await delegateApproval(approval.id, delegateTo, "OOO delegation");
                    setStatus(response.ok ? "Approval delegated." : "Approval delegation failed.");
                  }}>
                    <Send className="mr-1 h-3 w-3" />Delegate
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="mb-2 text-sm font-medium text-zinc-900">Exception actions ({exceptions.length})</p>
        <div className="space-y-2 text-xs text-zinc-600">
          {exceptions.map((exception) => (
            <div key={exception.id} className="rounded-lg border border-zinc-200 p-2">
              <p className="mb-1">{exception.title} • {exception.status}</p>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="rounded-md" onClick={async () => {
                  const response = await runExceptionAction(exception.id, "retry", "Retry after connector fix");
                  setStatus(response.ok ? "Exception retried." : "Exception action failed.");
                }}>
                  <RotateCcw className="mr-1 h-3 w-3" />Retry
                </Button>
                <Button size="sm" variant="outline" className="rounded-md" onClick={async () => {
                  const response = await runExceptionAction(exception.id, "resolve", "Resolved manually");
                  setStatus(response.ok ? "Exception resolved." : "Exception action failed.");
                }}>
                  <Check className="mr-1 h-3 w-3" />Resolve
                </Button>
                <Button size="sm" variant="outline" className="rounded-md" onClick={async () => {
                  const response = await runExceptionAction(exception.id, "escalate", "Escalate to external vendor");
                  setStatus(response.ok ? "Exception escalated." : "Exception action failed.");
                }}>
                  <Send className="mr-1 h-3 w-3" />Escalate
                </Button>
              </div>
            </div>
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
