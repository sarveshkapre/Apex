import { Filter, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listWorkItems } from "@/lib/apex";

export default async function QueueCenterPage() {
  const items = await listWorkItems();

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

      <div className="grid gap-3">
        {items.map((item) => (
          <Card key={item.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{item.title}</CardTitle>
                <p className="text-xs text-zinc-500">
                  {item.type} • {item.assignmentGroup ?? "Unassigned"} • {item.priority}
                </p>
              </div>
              <StatusBadge value={item.status} />
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-sm text-zinc-600">Requester: {item.requesterId} • Linked objects: {item.linkedObjectIds.length}</p>
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600">
                <p className="inline-flex items-center gap-1 text-zinc-800"><Sparkles className="h-3.5 w-3.5" />AI suggestion</p>
                Recommended next action: validate required approval chain and run reconciliation on linked objects.
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
