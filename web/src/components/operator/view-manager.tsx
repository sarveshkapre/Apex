"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSavedView } from "@/lib/apex";
import { SavedView } from "@/lib/types";

export function ViewManager({ initial }: { initial: SavedView[] }) {
  const [views, setViews] = React.useState(initial);
  const [name, setName] = React.useState("");
  const [status, setStatus] = React.useState("");

  const create = async () => {
    if (!name) {
      return;
    }
    const response = await createSavedView({
      name,
      objectType: "Device",
      columns: ["asset_tag", "serial_number", "compliance_state"]
    });
    if (response.ok) {
      const json = await response.json();
      setViews((items) => [...items, json.data]);
      setName("");
      setStatus("Saved view created.");
    } else {
      setStatus("Failed to save view.");
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className="mb-2 text-sm font-medium text-zinc-900">Saved views ({views.length})</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="View name" className="max-w-xs" />
        <Button size="sm" variant="outline" className="rounded-lg" onClick={create}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Save
        </Button>
      </div>
      <div className="space-y-1 text-xs text-zinc-600">
        {views.map((view) => (
          <p key={view.id}>{view.name} • {view.objectType}</p>
        ))}
      </div>
      {status ? <p className="mt-2 text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
