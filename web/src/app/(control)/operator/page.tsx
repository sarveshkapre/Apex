import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboard, listApprovals, listWorkItems } from "@/lib/apex";

export default async function OperatorOverviewPage() {
  const [dashboard, approvals, workItems] = await Promise.all([
    getDashboard("it-ops"),
    listApprovals(),
    listWorkItems()
  ]);

  const pendingApprovals = approvals.filter((item) => item.decision === "pending").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Operator Console"
        description="Unified operational surface for IT, security, and procurement teams."
        badge="Operator"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Queue Backlog" value={workItems.length} helper="Requests, incidents, tasks, exceptions" />
        <MetricCard title="Pending Approvals" value={pendingApprovals} helper="Manager, app owner, security, finance" />
        <MetricCard title="Automation Success" value={`${dashboard.automationSuccessRate}%`} helper="Last 24h workflow actions" />
        <MetricCard title="Open Risks" value={dashboard.openRisks} helper="Policy breaches + unresolved exceptions" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Work hub priorities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Offboarding exceptions with unresolved device recovery</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">SLA-breach risk for high-priority endpoint incidents</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Stale connector sync in identity provider</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Evidence readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">18 workflows are export-ready for audit evidence packages.</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">4 workflows missing attachment/signature artifacts.</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">Average offboarding closure latency: 6.1 hours.</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
