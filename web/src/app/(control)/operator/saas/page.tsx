import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { SaasGovernance } from "@/components/operator/saas-governance";
import { getDashboard, listSaasReclaimPolicies, listSaasReclaimRuns } from "@/lib/apex";

export default async function SaasGovernancePage() {
  const [saasDashboard, policies, runs] = await Promise.all([
    getDashboard("saas"),
    listSaasReclaimPolicies(),
    listSaasReclaimRuns()
  ]);

  const latestRun = runs[0];

  return (
    <div className="space-y-4">
      <PageHeader
        title="SaaS Governance"
        description="Manage seat reclaim policies, run previews, and retriable execution history."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="License Waste" value={`$${saasDashboard.licenseWasteEstimate.toLocaleString()}`} helper="Potential reclaim savings" />
        <MetricCard title="Policies" value={policies.length} helper="Configured reclaim controls" />
        <MetricCard title="Runs" value={runs.length} helper="Historical reclaim executions" />
        <MetricCard title="Last Run" value={latestRun ? latestRun.status : "none"} helper={latestRun ? latestRun.completedAt : "No runs yet"} />
      </section>

      <SaasGovernance initialPolicies={policies} initialRuns={runs} />
    </div>
  );
}
