import { RefreshCw, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getIntegrations } from "@/lib/apex";

export default async function IntegrationsPage() {
  const integrations = await getIntegrations();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Integrations Health"
        description="Connector status, sync health, error diagnostics, and remediation controls."
      />

      <div className="grid gap-3">
        {integrations.map((integration) => (
          <Card key={integration.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{integration.name}</CardTitle>
                <p className="text-xs text-zinc-500">{integration.type}</p>
              </div>
              <StatusBadge value={integration.status} />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-xs text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
                <p>Last successful sync: {new Date(integration.lastSuccessfulSync).toLocaleString()}</p>
                <p>Ingested: {integration.ingested}</p>
                <p>Updated: {integration.updated}</p>
                <p>Failed: {integration.failed}</p>
              </div>
              <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600">{integration.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-lg"><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Run sync now</Button>
                <Button size="sm" variant="outline" className="rounded-lg">Test connection</Button>
                <Button size="sm" variant="outline" className="rounded-lg"><Wrench className="mr-1.5 h-3.5 w-3.5" />Open mapping config</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
