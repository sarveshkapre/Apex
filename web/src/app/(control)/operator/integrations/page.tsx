import { PageHeader } from "@/components/app/page-header";
import { IntegrationCenter } from "@/components/operator/integration-center";
import { listConnectorConfigs } from "@/lib/apex";

export default async function IntegrationsPage() {
  const connectors = await listConnectorConfigs();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Integrations Health"
        description="Connector status, sync health, error diagnostics, and remediation controls."
      />
      <IntegrationCenter initial={connectors} />
    </div>
  );
}
