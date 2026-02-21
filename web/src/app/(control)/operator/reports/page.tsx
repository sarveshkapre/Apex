import { Download, FileSpreadsheet, Save } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { EvidenceExport } from "@/components/operator/evidence-export";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDashboard, listWorkItems } from "@/lib/apex";

export default async function ReportsPage() {
  const [exec, security, saas, workItems] = await Promise.all([
    getDashboard("executive"),
    getDashboard("security"),
    getDashboard("saas"),
    listWorkItems()
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

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Report builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Object filters (example: Device.compliance_state = noncompliant)" />
          <Input placeholder="Relationship filters (example: Device assigned_to Person where status=terminated)" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl"><Save className="mr-2 h-4 w-4" />Save report</Button>
            <Button variant="outline" className="rounded-xl"><FileSpreadsheet className="mr-2 h-4 w-4" />Schedule CSV</Button>
            <Button variant="outline" className="rounded-xl"><Download className="mr-2 h-4 w-4" />Export filtered CSV</Button>
          </div>
        </CardContent>
      </Card>

      <EvidenceExport workItems={workItems} />
    </div>
  );
}
