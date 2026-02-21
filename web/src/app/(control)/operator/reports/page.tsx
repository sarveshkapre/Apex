import { PageHeader } from "@/components/app/page-header";
import { EvidenceExport } from "@/components/operator/evidence-export";
import { ReportStudio } from "@/components/operator/report-studio";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDashboard, listReportDefinitions, listReportRuns, listWorkItems } from "@/lib/apex";

export default async function ReportsPage() {
  const [exec, security, saas, workItems, reportDefinitions, reportRuns] = await Promise.all([
    getDashboard("executive"),
    getDashboard("security"),
    getDashboard("saas"),
    listWorkItems(),
    listReportDefinitions(),
    listReportRuns()
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Reports & Exports" description="Build reports, schedule exports, and generate evidence packages." />

      <section className="grid gap-3 md:grid-cols-3">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader><CardTitle className="text-base">Executive</CardTitle></CardHeader>
          <CardContent className="text-sm text-zinc-600">Compliance score {exec.complianceScore}% • open risks {exec.openRisks}</CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader><CardTitle className="text-base">Security</CardTitle></CardHeader>
          <CardContent className="text-sm text-zinc-600">SLA breaches {security.slaBreaches} • automation {security.automationSuccessRate}%</CardContent>
        </Card>
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader><CardTitle className="text-base">SaaS</CardTitle></CardHeader>
          <CardContent className="text-sm text-zinc-600">License waste ${saas.licenseWasteEstimate.toLocaleString()}</CardContent>
        </Card>
      </section>

      <ReportStudio initialDefinitions={reportDefinitions} initialRuns={reportRuns} />

      <EvidenceExport workItems={workItems} />
    </div>
  );
}
