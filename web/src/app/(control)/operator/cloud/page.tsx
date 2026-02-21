import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { CloudGovernance } from "@/components/operator/cloud-governance";
import { getCloudTagCoverage } from "@/lib/apex";

export default async function CloudGovernancePage() {
  const coverage = await getCloudTagCoverage();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cloud Tag Governance"
        description="Enforce required ownership and cost tags with dry-run and policy-safe remediation."
        badge="P1"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Cloud Resources" value={coverage.totalResources} helper="Discovered across providers" />
        <MetricCard title="Coverage" value={`${coverage.coveragePercent}%`} helper="Required tags present" />
        <MetricCard title="Compliant" value={coverage.compliantResources} helper="Meets all required tags" />
        <MetricCard title="Noncompliant" value={coverage.nonCompliantResources} helper="Needs remediation" />
      </section>

      <CloudGovernance initialCoverage={coverage} />
    </div>
  );
}
