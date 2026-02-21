import { MessageSquareText, Paperclip, Timer } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { RequestTimeline } from "@/components/app/request-timeline";
import { StatusBadge } from "@/components/app/status-badge";
import { CatalogRequestDialog } from "@/components/portal/catalog-request-dialog";
import { NewRequestDialog } from "@/components/portal/new-request-dialog";
import { RespondInfoRequestDialog } from "@/components/portal/respond-info-request-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalog, listApprovals, listWorkItems } from "@/lib/apex";

export default async function RequestsPage() {
  const [items, catalog, approvals] = await Promise.all([listWorkItems(), getCatalog(), listApprovals()]);
  const infoRequestsByWorkItem = approvals.reduce<Map<string, number>>((acc, approval) => {
    if (approval.decision !== "info-requested") {
      return acc;
    }
    const existing = acc.get(approval.workItemId) ?? 0;
    acc.set(approval.workItemId, existing + 1);
    return acc;
  }, new Map());

  return (
    <div className="space-y-4">
      <PageHeader title="My Requests" description="Track every request with status, owner, SLA, and collaboration history." />
      <div className="flex flex-wrap justify-end gap-2">
        <CatalogRequestDialog triggerLabel="Catalog request" catalogItems={catalog} />
        <NewRequestDialog triggerLabel="New request" />
      </div>

      <div className="grid gap-3">
        {items.map((item) => (
          <Card key={item.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <p className="text-xs text-zinc-500">Owner: {item.assignmentGroup ?? "Unassigned"}</p>
              </div>
              <StatusBadge value={item.status} />
            </CardHeader>
            <CardContent className="space-y-3">
              <RequestTimeline status={item.status} />
              {infoRequestsByWorkItem.get(item.id) ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <p>Approver requested additional information to continue this workflow.</p>
                  <RespondInfoRequestDialog
                    workItemId={item.id}
                    pendingApproverCount={infoRequestsByWorkItem.get(item.id) ?? 0}
                  />
                </div>
              ) : null}
              <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                <p className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />SLA target: {item.priority}</p>
                <p className="inline-flex items-center gap-1"><MessageSquareText className="h-3.5 w-3.5" />Comments: {item.comments?.length ?? 0}</p>
                <p className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />Attachments: {item.attachments?.length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
