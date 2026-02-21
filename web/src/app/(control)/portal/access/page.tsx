import { PageHeader } from "@/components/app/page-header";
import { LinkedRequestActions } from "@/components/portal/linked-request-actions";
import { StatusBadge } from "@/components/app/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listObjectsByType } from "@/lib/apex";

export default async function AccessPage() {
  const accounts = await listObjectsByType("SaaSAccount");

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Access"
        description="SaaS account visibility, entitlement controls, and self-reclaim actions."
      />
      <div className="grid gap-3">
        {accounts.map((account) => (
          <Card key={account.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{String(account.fields.app ?? "Unknown app")}</CardTitle>
              <StatusBadge value={String(account.fields.status ?? "unknown")} />
            </CardHeader>
            <CardContent>
              <div className="mb-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
                <p>Entitlement: {String(account.fields.role ?? "Standard")}</p>
                <p>Last active: {String(account.fields.last_active ?? "-")}</p>
                <p>Granted on: {String(account.fields.created_at ?? "-")}</p>
                <p>Expires on: {String(account.fields.expires_on ?? "-")}</p>
              </div>
              <LinkedRequestActions
                objectId={account.id}
                assignmentGroup="Access Operations"
                actions={[
                  {
                    label: "Request elevated access",
                    type: "Request",
                    priority: "P2",
                    title: `Elevated access request for ${String(account.fields.app ?? account.id)}`,
                    description: "User requested elevated privileges from My Access.",
                    tags: ["access", "elevation"]
                  },
                  {
                    label: "Report access issue",
                    type: "Incident",
                    priority: "P2",
                    title: `Access issue for ${String(account.fields.app ?? account.id)}`,
                    description: "User reported access issue from My Access.",
                    tags: ["access", "incident"]
                  },
                  {
                    label: "Voluntary relinquish",
                    type: "Request",
                    priority: "P3",
                    title: `Relinquish access: ${String(account.fields.app ?? account.id)}`,
                    description: "User voluntarily relinquished access.",
                    tags: ["access", "reclaim"]
                  },
                  {
                    label: "Request duration extension",
                    type: "Request",
                    priority: "P3",
                    title: `Duration extension for ${String(account.fields.app ?? account.id)}`,
                    description: "User requested extension for temporary access.",
                    tags: ["access", "extension"]
                  }
                ]}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
