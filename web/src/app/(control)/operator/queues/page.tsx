import { PageHeader } from "@/components/app/page-header";
import { QueueOps } from "@/components/operator/queue-ops";
import { getSlaBreaches, listApprovalsInbox, listExceptions, listExternalTicketLinks, listWorkItems } from "@/lib/apex";

export default async function QueueCenterPage() {
  const [items, breaches, approvals, exceptions, externalLinks] = await Promise.all([
    listWorkItems(),
    getSlaBreaches(),
    listApprovalsInbox("manager-approver"),
    listExceptions(),
    listExternalTicketLinks()
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Queue Center" description="Unified queue for requests, incidents, tasks, approvals, and exceptions." />

      <QueueOps items={items} breaches={breaches.breaches} approvals={approvals} exceptions={exceptions} externalLinks={externalLinks} />
    </div>
  );
}
