import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { RenewalsGovernance } from "@/components/operator/renewals-governance";
import { getContractRenewalOverview, listContractRenewalRuns } from "@/lib/apex";

export default async function RenewalsPage() {
  const [overview, runs] = await Promise.all([getContractRenewalOverview(90), listContractRenewalRuns()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contract Renewals"
        description="Track upcoming renewals, run reminder workflows, and route procurement actions with audit context."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Scanned Contracts" value={overview.scannedContracts} helper="Contracts in renewal inventory" />
        <MetricCard title="Due in Window" value={overview.dueContracts} helper="Renewals requiring action" />
        <MetricCard title="Overdue" value={overview.overdueContracts} helper="Renewals past renewal date" />
        <MetricCard title="Runs" value={runs.length} helper="Reminder executions" />
      </section>

      <RenewalsGovernance initialOverview={overview} initialRuns={runs} />
    </div>
  );
}
