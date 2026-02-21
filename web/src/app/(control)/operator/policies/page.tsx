import { CheckCircle2, ShieldAlert } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getQualityDashboard } from "@/lib/apex";

export default async function PoliciesPage() {
  const quality = await getQualityDashboard();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Policies & Compliance"
        description="Policy catalog, coverage metrics, noncompliance exceptions, and evidence actions."
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Freshness" value={`${Math.round(quality.summary.freshness * 100)}%`} helper="Source data recency" />
        <MetricCard title="Completeness" value={`${Math.round(quality.summary.completeness * 100)}%`} helper="Required fields populated" />
        <MetricCard title="Consistency" value={`${Math.round(quality.summary.consistency * 100)}%`} helper="Conflict rate across sources" />
        <MetricCard title="Coverage" value={`${Math.round(quality.summary.coverage * 100)}%`} helper="Control-plane signal coverage" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Device posture exceptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            <p className="inline-flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-rose-600" />Stale devices: {quality.drilldowns.staleDevices.length}</p>
            <p className="inline-flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-rose-600" />Unknown owners: {quality.drilldowns.unknownOwners.length}</p>
            <p className="inline-flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-rose-600" />Unmatched identities: {quality.drilldowns.unmatchedIdentities.length}</p>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Policy actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Encryption required policy published</p>
            <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Leaver revocation-gap policy active</p>
            <p className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />MFA required for high-risk apps active</p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
