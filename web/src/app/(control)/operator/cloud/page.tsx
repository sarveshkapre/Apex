import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { CloudGovernance } from "@/components/operator/cloud-governance";
import { getCloudTagCoverage, listCloudTagRuns } from "@/lib/apex";

export default async function CloudGovernancePage() {
  const [coverage, runs] = await Promise.all([getCloudTagCoverage(), listCloudTagRuns()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cloud Tag Governance"
        description="Enforce required ownership and cost tags with dry-run and policy-safe remediation."
        badge="P1"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Cloud Resources" value={coverage.totalResources} helper="Discovered across providers" />
        <MetricCard title="Coverage" value={`${coverage.coveragePercent}%`} helper="Required tags present" />
        <MetricCard title="Compliant" value={coverage.compliantResources} helper="Meets all required tags" />
        <MetricCard title="Noncompliant" value={coverage.nonCompliantResources} helper="Needs remediation" />
        <MetricCard title="Auto-Tag Ready" value={coverage.autoTagReadyResources} helper="High-confidence candidates" />
        <MetricCard title="Approval Needed" value={coverage.approvalRequiredResources} helper="Medium-confidence candidates" />
      </section>

      <CloudGovernance initialCoverage={coverage} initialRuns={runs} />
    </div>
  );
}
