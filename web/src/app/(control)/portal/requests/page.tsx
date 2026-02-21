import { MessageSquareText, Paperclip, Timer } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { RequestTimeline } from "@/components/app/request-timeline";
import { StatusBadge } from "@/components/app/status-badge";
import { NewRequestDialog } from "@/components/portal/new-request-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listWorkItems } from "@/lib/apex";

export default async function RequestsPage() {
  const items = await listWorkItems();

  return (
    <div className="space-y-4">
      <PageHeader title="My Requests" description="Track every request with status, owner, SLA, and collaboration history." />
      <div className="flex justify-end">
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
              <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                <p className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />SLA target: {item.priority}</p>
                <p className="inline-flex items-center gap-1"><MessageSquareText className="h-3.5 w-3.5" />Comments thread active</p>
                <p className="inline-flex items-center gap-1"><Paperclip className="h-3.5 w-3.5" />Attachments ready</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
