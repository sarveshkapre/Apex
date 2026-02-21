"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { applyObjectManualOverride, listObjects } from "@/lib/apex";
import { GraphObject } from "@/lib/types";

const displayValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? "");
  }
};

const parseOverrideValue = (raw: string): unknown => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return "";
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
};

export function ProvenanceOverrideLab({ initialObjects }: { initialObjects: GraphObject[] }) {
  const [objects, setObjects] = React.useState(initialObjects);
  const [objectId, setObjectId] = React.useState(initialObjects[0]?.id ?? "");
  const [field, setField] = React.useState("");
  const [value, setValue] = React.useState("");
  const [reason, setReason] = React.useState("Operational override pending source reconciliation.");
  const [overrideUntil, setOverrideUntil] = React.useState("");
  const [status, setStatus] = React.useState("");

  const selectedObject = React.useMemo(
    () => objects.find((item) => item.id === objectId),
    [objects, objectId]
  );

  const fields = React.useMemo(() => {
    if (!selectedObject) {
      return [] as string[];
    }
    return Object.keys(selectedObject.fields).sort();
  }, [selectedObject]);

  React.useEffect(() => {
    if (!fields.includes(field)) {
      setField(fields[0] ?? "");
    }
  }, [field, fields]);

  React.useEffect(() => {
    if (!selectedObject || !field) {
      return;
    }
    setValue(displayValue(selectedObject.fields[field]));
  }, [selectedObject, field]);

  const provenanceEntries = React.useMemo(() => {
    if (!selectedObject || !field) {
      return [];
    }
    return [...(selectedObject.provenance?.[field] ?? [])].sort((left, right) =>
      right.observedAt.localeCompare(left.observedAt)
    );
  }, [field, selectedObject]);

  const refreshObjects = async () => {
    try {
      const latest = await listObjects();
      setObjects(latest);
    } catch {
      setStatus("Override applied, but object refresh failed.");
    }
  };

  const applyOverride = async () => {
    if (!selectedObject || !field || !reason.trim()) {
      setStatus("Object, field, and reason are required.");
      return;
    }

    try {
      const updated = await applyObjectManualOverride({
        objectId: selectedObject.id,
        field,
        value: parseOverrideValue(value),
        reason,
        overrideUntil: overrideUntil ? new Date(overrideUntil).toISOString() : undefined
      });

      setObjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStatus("Manual override recorded with provenance.");
      await refreshObjects();
    } catch {
      setStatus("Manual override failed.");
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
      <p className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-900">
        <ShieldCheck className="h-4 w-4" />Provenance overrides
      </p>

      <div className="grid gap-2 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs text-zinc-500">Object</p>
          <Select value={objectId} onValueChange={setObjectId}>
            <SelectTrigger><SelectValue placeholder="Select object" /></SelectTrigger>
            <SelectContent>
              {objects.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.type} • {item.id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="mb-1 text-xs text-zinc-500">Field</p>
          <Select value={field} onValueChange={setField}>
            <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
            <SelectContent>
              {fields.map((fieldName) => (
                <SelectItem key={fieldName} value={fieldName}>{fieldName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Override value" />
        <Input
          value={overrideUntil}
          onChange={(event) => setOverrideUntil(event.target.value)}
          type="datetime-local"
          placeholder="Override until (optional)"
        />
      </div>

      <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Override reason" />
      <Button className="rounded-lg" onClick={applyOverride}>Apply override</Button>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-600">
        <p className="mb-2 text-zinc-900">Field provenance ({provenanceEntries.length})</p>
        <div className="space-y-1">
          {provenanceEntries.length === 0 ? <p>No provenance entries for this field yet.</p> : null}
          {provenanceEntries.slice(0, 6).map((entry) => (
            <p key={`${entry.signalId}-${entry.observedAt}`} className="rounded border border-zinc-200 bg-white px-2 py-1">
              {entry.sourceId} • confidence {entry.confidence} • {entry.observedAt}
              {entry.overriddenBy ? ` • by ${entry.overriddenBy}` : ""}
              {entry.overrideReason ? ` • ${entry.overrideReason}` : ""}
            </p>
          ))}
        </div>
      </div>

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
