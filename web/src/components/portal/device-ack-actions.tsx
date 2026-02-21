"use client";

import * as React from "react";
import { CheckCircle2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acknowledgeDeviceCustody } from "@/lib/apex";

export function DeviceAckActions({ deviceId }: { deviceId: string }) {
  const [status, setStatus] = React.useState("");
  const [pendingType, setPendingType] = React.useState<"receipt" | "return-shipment" | null>(null);

  const acknowledge = async (type: "receipt" | "return-shipment") => {
    setPendingType(type);
    setStatus("");
    try {
      const result = await acknowledgeDeviceCustody({
        deviceId,
        type,
        acknowledgedBy: "person-1",
        note: type === "receipt" ? "Device received by user." : "Return shipment dropped off by user."
      });
      setStatus(`${result.acknowledgement.type} acknowledged at ${result.acknowledgement.acknowledgedAt}.`);
    } catch {
      setStatus("Failed to record acknowledgement.");
    } finally {
      setPendingType(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          onClick={() => acknowledge("receipt")}
          disabled={pendingType !== null}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          {pendingType === "receipt" ? "Acknowledging..." : "Acknowledge receipt"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="rounded-lg"
          onClick={() => acknowledge("return-shipment")}
          disabled={pendingType !== null}
        >
          <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
          {pendingType === "return-shipment" ? "Acknowledging..." : "Acknowledge return shipment"}
        </Button>
      </div>
      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
