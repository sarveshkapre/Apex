import { AlertTriangle, Boxes, RotateCcw, ShieldAlert, Wrench } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listObjectsByType } from "@/lib/apex";

export default async function AssetsPage() {
  const devices = await listObjectsByType("Device");

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Assets"
        description="Track device lifecycle, compliance, and issue actions from one view."
      />
      <div className="grid gap-4">
        {devices.map((device) => (
          <Card key={device.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{String(device.fields.model ?? "Device")}</CardTitle>
              <StatusBadge value={String(device.fields.compliance_state ?? "unknown")} />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
                <p>Asset tag: {String(device.fields.asset_tag ?? "-")}</p>
                <p>Serial: {String(device.fields.serial_number ?? "-")}</p>
                <p>Assigned: {String(device.fields.assigned_date ?? "-")}</p>
                <p>Warranty: {String(device.fields.warranty_end_date ?? "-")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-lg"><Wrench className="mr-1.5 h-3.5 w-3.5" />Report issue</Button>
                <Button size="sm" variant="outline" className="rounded-lg"><Boxes className="mr-1.5 h-3.5 w-3.5" />Request accessory</Button>
                <Button size="sm" variant="outline" className="rounded-lg"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Initiate return</Button>
                <Button size="sm" variant="outline" className="rounded-lg text-rose-700"><AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Report lost/stolen</Button>
                <Button size="sm" variant="outline" className="rounded-lg"><ShieldAlert className="mr-1.5 h-3.5 w-3.5" />Request replacement</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
