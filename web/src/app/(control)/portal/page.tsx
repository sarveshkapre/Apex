import { BellDot, ClipboardList, Laptop2, Sparkles } from "lucide-react";
import { MetricCard } from "@/components/app/metric-card";
import { PageHeader } from "@/components/app/page-header";
import { NewRequestDialog } from "@/components/portal/new-request-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCatalog, listObjectsByType, listWorkItems } from "@/lib/apex";

export default async function PortalHomePage() {
  const [devices, workItems, catalog] = await Promise.all([
    listObjectsByType("Device"),
    listWorkItems(),
    getCatalog()
  ]);

  const myRequests = workItems.filter((item) => item.type === "Request").slice(0, 4);

  return (
    <div className="space-y-5">
      <PageHeader
        title="End-User Portal"
        description="Your devices, access, and requests in one place with AI-guided actions."
        badge="Portal"
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Your Active Devices" value={devices.length} helper="Tracked with compliance context" />
        <MetricCard title="Open Requests" value={myRequests.length} helper="Includes approvals in-flight" />
        <MetricCard title="Common Requests" value={catalog.length} helper="Configurable by role/region" />
        <MetricCard title="Unread Alerts" value={2} helper="Shipment and policy acknowledgements" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Your current device(s)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {devices.length === 0 ? (
              <p className="text-sm text-zinc-500">No devices assigned yet.</p>
            ) : (
              devices.map((device) => (
                <div key={device.id} className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                  <p className="font-medium text-zinc-900">{String(device.fields.model ?? "Unspecified model")}</p>
                  <p className="text-xs text-zinc-500">
                    Asset {String(device.fields.asset_tag ?? "-")} • Serial {String(device.fields.serial_number ?? "-")}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Compliance: {String(device.fields.compliance_state ?? "unknown")}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <NewRequestDialog triggerLabel="Request laptop or device" />
            <NewRequestDialog triggerLabel="Request software access" />
            <NewRequestDialog triggerLabel="Report lost or stolen" defaultType="Incident" />
            <NewRequestDialog triggerLabel="Request accessory" />
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader className="flex flex-row items-center gap-2">
            <ClipboardList className="h-4 w-4 text-zinc-600" />
            <CardTitle className="text-base">Active requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myRequests.map((item) => (
              <div key={item.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <p className="text-sm font-medium text-zinc-900">{item.title}</p>
                <p className="text-xs text-zinc-500">{item.status} • {item.priority}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader className="flex flex-row items-center gap-2">
            <Laptop2 className="h-4 w-4 text-zinc-600" />
            <CardTitle className="text-base">Common requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {catalog.map((item) => (
              <div key={item.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <p className="text-sm font-medium text-zinc-900">{item.name}</p>
                <p className="text-xs text-zinc-500">{item.expectedDelivery}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader className="flex flex-row items-center gap-2">
            <BellDot className="h-4 w-4 text-zinc-600" />
            <CardTitle className="text-base">Announcements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">US stockroom refresh delivery window changed to 2 business days.</p>
            <p className="rounded-lg border border-zinc-200 bg-white px-3 py-2">New access reclaim reminders roll out on Monday.</p>
            <p className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-700">
              <Sparkles className="h-4 w-4" />
              AI request drafting now supports contractor onboarding.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
