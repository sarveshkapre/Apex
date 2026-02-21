import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { PolicyCenter } from "@/components/operator/policy-center";
import { getQualityDashboard, listPolicies, listPolicyExceptions } from "@/lib/apex";

export default async function PoliciesPage() {
  const [quality, policies, exceptions] = await Promise.all([getQualityDashboard(), listPolicies(), listPolicyExceptions()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Policies & Compliance"
        description="Policy catalog, compliance posture, exception management, and remediation orchestration."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Freshness" value={`${Math.round(quality.summary.freshness * 100)}%`} helper="Source data recency" />
        <MetricCard title="Completeness" value={`${Math.round(quality.summary.completeness * 100)}%`} helper="Required fields populated" />
        <MetricCard title="Consistency" value={`${Math.round(quality.summary.consistency * 100)}%`} helper="Conflict rate across sources" />
        <MetricCard title="Coverage" value={`${Math.round(quality.summary.coverage * 100)}%`} helper="Control-plane signal coverage" />
      </section>

      <PolicyCenter initial={policies} initialExceptions={exceptions} />
    </div>
  );
}
