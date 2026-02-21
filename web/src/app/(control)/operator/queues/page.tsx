import { Filter, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { QueueOps } from "@/components/operator/queue-ops";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getSlaBreaches, listApprovalsInbox, listExceptions, listWorkItems } from "@/lib/apex";

export default async function QueueCenterPage() {
  const [items, breaches, approvals, exceptions] = await Promise.all([
    listWorkItems(),
    getSlaBreaches(),
    listApprovalsInbox("manager-approver"),
    listExceptions()
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Queue Center" description="Unified queue for requests, incidents, tasks, approvals, and exceptions." />

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardContent className="flex flex-wrap gap-2 pt-5">
          <Input placeholder="Filter by assignment group, priority, region, VIP..." className="max-w-xl" />
          <Button variant="outline" className="rounded-xl"><Filter className="mr-2 h-4 w-4" />Filters</Button>
          <Button variant="outline" className="rounded-xl">Bulk assign</Button>
          <Button variant="outline" className="rounded-xl">Bulk priority</Button>
          <Button variant="outline" className="rounded-xl">Export</Button>
        </CardContent>
      </Card>

      <QueueOps items={items} breaches={breaches.breaches} approvals={approvals} exceptions={exceptions} />

      <div className="grid gap-3">
        {items.map((item) => (
          <Card key={item.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-base font-medium text-zinc-900">{item.title}</p>
                  <p className="text-xs text-zinc-500">
                    {item.type} • {item.assignmentGroup ?? "Unassigned"} • {item.priority}
                  </p>
                </div>
                <StatusBadge value={item.status} />
              </div>
              <p className="text-sm text-zinc-600">Requester: {item.requesterId} • Linked objects: {item.linkedObjectIds.length}</p>
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                <p className="inline-flex items-center gap-1 text-zinc-800"><Sparkles className="h-3.5 w-3.5" />AI suggestion</p>
                Suggested action: reconcile linked objects, then route for approval if risk score is elevated.
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
