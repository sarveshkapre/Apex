import { Clock3, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
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
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-lg"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Request elevated access</Button>
                <Button size="sm" variant="outline" className="rounded-lg"><ShieldCheck className="mr-1.5 h-3.5 w-3.5" />Report access issue</Button>
                <Button size="sm" variant="outline" className="rounded-lg"><UserMinus className="mr-1.5 h-3.5 w-3.5" />Voluntary relinquish</Button>
                <Button size="sm" variant="outline" className="rounded-lg"><Clock3 className="mr-1.5 h-3.5 w-3.5" />Request duration extension</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
