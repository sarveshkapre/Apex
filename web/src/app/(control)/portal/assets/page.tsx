import { PageHeader } from "@/components/app/page-header";
import { LinkedRequestActions } from "@/components/portal/linked-request-actions";
import { LostStolenReportDialog } from "@/components/portal/lost-stolen-report-dialog";
import { StatusBadge } from "@/components/app/status-badge";
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
              <LinkedRequestActions
                objectId={device.id}
                assignmentGroup="Endpoint Operations"
                actions={[
                  {
                    label: "Report issue",
                    type: "Incident",
                    priority: "P2",
                    title: `Device issue: ${String(device.fields.model ?? device.id)}`,
                    description: "User-reported device issue from My Assets.",
                    tags: ["device", "issue"]
                  },
                  {
                    label: "Request accessory",
                    type: "Request",
                    priority: "P3",
                    title: `Accessory request for ${String(device.fields.asset_tag ?? device.id)}`,
                    description: "Accessory request initiated from My Assets.",
                    tags: ["device", "accessory"]
                  },
                  {
                    label: "Initiate return",
                    type: "Request",
                    priority: "P2",
                    title: `Return workflow for ${String(device.fields.asset_tag ?? device.id)}`,
                    description: "Device return request initiated by end user.",
                    tags: ["device", "return"]
                  },
                  {
                    label: "Request replacement",
                    type: "Request",
                    priority: "P2",
                    title: `Replacement request for ${String(device.fields.asset_tag ?? device.id)}`,
                    description: "Replacement request submitted from My Assets.",
                    tags: ["device", "replacement"]
                  }
                ]}
              />
              <LostStolenReportDialog
                deviceId={device.id}
                assetLabel={String(device.fields.asset_tag ?? device.fields.model ?? device.id)}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
