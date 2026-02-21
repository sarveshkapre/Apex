"use client";

import * as React from "react";
import { Check, Download, Link2, MessageSquareText, RotateCcw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  addExternalTicketComment,
  decideApproval,
  delegateApproval,
  linkExternalTicket,
  listExternalTicketComments,
  listWorkItems,
  runExceptionAction,
  runWorkItemBulkAction
} from "@/lib/apex";
import {
  Approval,
  ExternalTicketComment,
  ExternalTicketLink,
  SlaBreach,
  WorkItem,
  WorkItemBulkAction,
  WorkItemBulkResult
} from "@/lib/types";

export function QueueOps({
  items,
  breaches,
  approvals,
  exceptions,
  externalLinks
}: {
  items: WorkItem[];
  breaches: SlaBreach[];
  approvals: Approval[];
  exceptions: WorkItem[];
  externalLinks: ExternalTicketLink[];
}) {
  const [queueItems, setQueueItems] = React.useState(items);
  const [filterText, setFilterText] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkAction, setBulkAction] = React.useState<WorkItemBulkAction>("assign");
  const [bulkAssigneeId, setBulkAssigneeId] = React.useState("agent-1");
  const [bulkAssignmentGroup, setBulkAssignmentGroup] = React.useState("Service Desk");
  const [bulkPriority, setBulkPriority] = React.useState<"P0" | "P1" | "P2" | "P3" | "P4">("P2");
  const [bulkTag, setBulkTag] = React.useState("needs-human-input");
  const [bulkComment, setBulkComment] = React.useState("Bulk queue action executed by operator.");
  const [bulkWorkflowStep, setBulkWorkflowStep] = React.useState<
    "triage" | "start" | "wait" | "block" | "complete" | "cancel"
  >("triage");
  const [lastBulkResult, setLastBulkResult] = React.useState<WorkItemBulkResult | null>(null);

  const [ticketId, setTicketId] = React.useState("");
  const [workItemId, setWorkItemId] = React.useState(items[0]?.id ?? "");
  const [delegateTo, setDelegateTo] = React.useState("backup-approver");
  const [status, setStatus] = React.useState("");

  const [links, setLinks] = React.useState(externalLinks);
  const [selectedLinkId, setSelectedLinkId] = React.useState(externalLinks[0]?.id ?? "");
  const [comments, setComments] = React.useState<ExternalTicketComment[]>([]);
  const [commentBody, setCommentBody] = React.useState("");

  React.useEffect(() => {
    setQueueItems(items);
  }, [items]);

  React.useEffect(() => {
    setSelectedIds((current) => current.filter((id) => queueItems.some((item) => item.id === id)));
    if (!workItemId && queueItems[0]?.id) {
      setWorkItemId(queueItems[0].id);
    }
  }, [queueItems, workItemId]);

  React.useEffect(() => {
    if (!selectedLinkId) {
      setComments([]);
      return;
    }

    let active = true;
    listExternalTicketComments(selectedLinkId)
      .then((data) => {
        if (active) {
          setComments(data);
        }
      })
      .catch(() => {
        if (active) {
          setComments([]);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedLinkId]);

  const filteredItems = React.useMemo(() => {
    if (!filterText.trim()) {
      return queueItems;
    }
    const q = filterText.toLowerCase();
    return queueItems.filter((item) => {
      const haystack = [
        item.id,
        item.title,
        item.type,
        item.status,
        item.priority,
        item.assignmentGroup ?? "",
        item.assigneeId ?? "",
        item.requesterId,
        item.tags.join(" ")
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [filterText, queueItems]);

  const filteredIds = React.useMemo(() => filteredItems.map((item) => item.id), [filteredItems]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.includes(id));

  const toggleItem = (id: string, checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((value) => value !== id);
    });
  };

  const toggleAllFiltered = (checked: boolean) => {
    setSelectedIds((current) => {
      if (checked) {
        return [...new Set([...current, ...filteredIds])];
      }
      return current.filter((id) => !filteredIds.includes(id));
    });
  };

  const applyBulkAction = async () => {
    if (selectedIds.length === 0) {
      setStatus("Select at least one queue item.");
      return;
    }

    try {
      const payload: Parameters<typeof runWorkItemBulkAction>[0] = {
        workItemIds: selectedIds,
        action: bulkAction
      };

      if (bulkAction === "assign") {
        payload.assigneeId = bulkAssigneeId.trim() || undefined;
        payload.assignmentGroup = bulkAssignmentGroup.trim() || undefined;
      }
      if (bulkAction === "priority") {
        payload.priority = bulkPriority;
      }
      if (bulkAction === "tag") {
        payload.tag = bulkTag;
      }
      if (bulkAction === "comment") {
        payload.comment = bulkComment;
      }
      if (bulkAction === "workflow-step") {
        payload.workflowStep = bulkWorkflowStep;
      }

      const result = await runWorkItemBulkAction(payload);
      setLastBulkResult(result);

      if (result.action !== "export") {
        const latest = await listWorkItems();
        setQueueItems(latest);
      }

      const changed = result.updatedCount ?? result.matchedCount ?? 0;
      setStatus(`Bulk ${result.action} completed for ${changed} item(s).`);
    } catch {
      setStatus("Bulk action failed.");
    }
  };

  const link = async () => {
    if (!ticketId || !workItemId) {
      return;
    }
    const response = await linkExternalTicket({
      workItemId,
      provider: "Jira",
      externalTicketId: ticketId
    });
    if (!response.ok) {
      setStatus("Failed to link ticket.");
      return;
    }
    const json = (await response.json()) as { data: ExternalTicketLink };
    setLinks((current) => [...current, json.data]);
    setSelectedLinkId(json.data.id);
    setStatus("External ticket linked.");
    setTicketId("");
  };

  const addComment = async () => {
    if (!selectedLinkId || !commentBody) {
      return;
    }
    const response = await addExternalTicketComment(selectedLinkId, commentBody);
    if (!response.ok) {
      setStatus("Failed to add external ticket comment.");
      return;
    }
    const latest = await listExternalTicketComments(selectedLinkId);
    setComments(latest);
    setCommentBody("");
    setStatus("External comment synced.");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-900">Queue bulk actions</p>
          <p className="text-xs text-zinc-500">Selected: {selectedIds.length}</p>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <Input
            value={filterText}
            onChange={(event) => setFilterText(event.target.value)}
            placeholder="Filter by queue fields"
            className="md:col-span-2"
          />
          <Select value={bulkAction} onValueChange={(value) => setBulkAction(value as WorkItemBulkAction)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="assign">Assign</SelectItem>
              <SelectItem value="priority">Change priority</SelectItem>
              <SelectItem value="tag">Add tag</SelectItem>
              <SelectItem value="comment">Add comment</SelectItem>
              <SelectItem value="workflow-step">Apply workflow step</SelectItem>
              <SelectItem value="export">Export CSV</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-lg" onClick={applyBulkAction}>Apply action</Button>
        </div>

        {bulkAction === "assign" ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <Input value={bulkAssigneeId} onChange={(event) => setBulkAssigneeId(event.target.value)} placeholder="Assignee id" />
            <Input value={bulkAssignmentGroup} onChange={(event) => setBulkAssignmentGroup(event.target.value)} placeholder="Assignment group" />
          </div>
        ) : null}

        {bulkAction === "priority" ? (
          <div className="mt-2 max-w-[220px]">
            <Select value={bulkPriority} onValueChange={(value) => setBulkPriority(value as typeof bulkPriority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="P0">P0</SelectItem>
                <SelectItem value="P1">P1</SelectItem>
                <SelectItem value="P2">P2</SelectItem>
                <SelectItem value="P3">P3</SelectItem>
                <SelectItem value="P4">P4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {bulkAction === "tag" ? (
          <div className="mt-2">
            <Input value={bulkTag} onChange={(event) => setBulkTag(event.target.value)} placeholder="Tag" />
          </div>
        ) : null}

        {bulkAction === "comment" ? (
          <div className="mt-2">
            <Input value={bulkComment} onChange={(event) => setBulkComment(event.target.value)} placeholder="Comment" />
          </div>
        ) : null}

        {bulkAction === "workflow-step" ? (
          <div className="mt-2 max-w-[260px]">
            <Select value={bulkWorkflowStep} onValueChange={(value) => setBulkWorkflowStep(value as typeof bulkWorkflowStep)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="triage">Triage</SelectItem>
                <SelectItem value="start">Start work</SelectItem>
                <SelectItem value="wait">Wait</SelectItem>
                <SelectItem value="block">Block</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="cancel">Cancel</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {lastBulkResult?.action === "export" && lastBulkResult.content ? (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
            <p className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-zinc-800">
              <Download className="h-3.5 w-3.5" />{lastBulkResult.fileName}
            </p>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[11px] text-zinc-600">{lastBulkResult.content}</pre>
          </div>
        ) : null}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-900">Queue items ({filteredItems.length})</p>
          <div className="inline-flex items-center gap-1 text-xs text-zinc-600">
            <Checkbox checked={allFilteredSelected} onCheckedChange={(value) => toggleAllFiltered(value === true)} />
            Select filtered
          </div>
        </div>
        <div className="space-y-2 text-xs text-zinc-600">
          {filteredItems.map((item) => (
            <div key={item.id} className="rounded-lg border border-zinc-200 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="inline-flex items-start gap-2">
                  <Checkbox checked={selectedIds.includes(item.id)} onCheckedChange={(value) => toggleItem(item.id, value === true)} />
                  <div>
                    <p className="font-medium text-zinc-900">{item.title}</p>
                    <p>{item.type} • {item.status} • {item.priority}</p>
                    <p>{item.assignmentGroup ?? "Unassigned"} • {item.assigneeId ?? "No assignee"}</p>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500">{item.id.slice(0, 8)}</p>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 ? <p>No queue items match the current filter.</p> : null}
        </div>
      </div>

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

        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2.5">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-zinc-800">
            <MessageSquareText className="h-3.5 w-3.5" />External comments
          </p>
          <div className="mb-2 flex flex-wrap gap-2">
            <Input
              value={selectedLinkId}
              onChange={(event) => setSelectedLinkId(event.target.value)}
              placeholder="External link id"
              className="max-w-[240px]"
            />
            <Input
              value={commentBody}
              onChange={(event) => setCommentBody(event.target.value)}
              placeholder="Add comment to external ticket"
              className="min-w-[260px] flex-1"
            />
            <Button size="sm" variant="outline" className="rounded-lg" onClick={addComment}>Sync comment</Button>
          </div>
          {links.length > 0 ? (
            <p className="mb-2 text-[11px] text-zinc-500">Known links: {links.map((linkItem) => `${linkItem.id}(${linkItem.externalTicketId})`).join(", ")}</p>
          ) : null}
          <div className="space-y-1 text-xs text-zinc-600">
            {comments.length === 0 ? <p>No external comments synced yet.</p> : null}
            {comments.map((comment) => (
              <p key={comment.id} className="rounded border border-zinc-200 bg-white px-2 py-1">
                {comment.author}: {comment.body}
              </p>
            ))}
          </div>
        </div>

        {status ? <p className="mt-2 text-xs text-zinc-500">{status}</p> : null}
      </div>
    </div>
  );
}
