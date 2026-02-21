import { GitMerge, Link2, Search } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listObjects } from "@/lib/apex";

export default async function GraphPage() {
  const objects = await listObjects();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Asset Graph Explorer"
        description="Browse canonical objects, provenance, relationships, and timeline state transitions."
      />

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardContent className="flex flex-wrap gap-2 pt-5">
          <Input placeholder="Search objects by serial, person, app, resource..." className="max-w-xl" />
          <Button variant="outline" className="rounded-xl"><Search className="mr-2 h-4 w-4" />Search</Button>
          <Button variant="outline" className="rounded-xl"><GitMerge className="mr-2 h-4 w-4" />Merge duplicates</Button>
          <Button variant="outline" className="rounded-xl"><Link2 className="mr-2 h-4 w-4" />Link relationship</Button>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {objects.map((object) => (
          <Card key={object.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base">{object.type}</CardTitle>
                <p className="text-xs text-zinc-500">{object.id}</p>
              </div>
              <StatusBadge value={String(object.fields.compliance_state ?? "Active")} />
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-zinc-600">
              {Object.entries(object.fields)
                .slice(0, 4)
                .map(([key, value]) => (
                  <p key={key} className="flex items-center justify-between gap-2 border-b border-zinc-100 pb-1">
                    <span className="text-zinc-500">{key}</span>
                    <span className="truncate font-medium text-zinc-800">{String(value)}</span>
                  </p>
                ))}
              <p className="pt-1 text-[11px] text-zinc-500">
                Quality: F {Math.round(object.quality.freshness * 100)}% / C {Math.round(object.quality.completeness * 100)}%
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
