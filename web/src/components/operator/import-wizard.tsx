"use client";

import * as React from "react";
import { FileUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { applyCsvImport, previewCsvImport } from "@/lib/apex";

const sampleRows = [
  { serial_number: "SN-991", asset_tag: "LAP-991", model: "ThinkPad X1" },
  { serial_number: "SN-992", asset_tag: "LAP-992", model: "MacBook Pro 14" }
];

export function ImportWizard() {
  const [preview, setPreview] = React.useState<Record<string, unknown> | null>(null);
  const [status, setStatus] = React.useState("");
  const [fileLabel, setFileLabel] = React.useState("devices.csv");

  const previewImport = async () => {
    const response = await previewCsvImport(sampleRows);
    if (!response.ok) {
      setStatus("Import preview failed.");
      return;
    }
    const json = await response.json();
    setPreview(json.data);
    setStatus("Preview generated.");
  };

  const applyImport = async () => {
    const response = await applyCsvImport(sampleRows);
    if (!response.ok) {
      setStatus("Import apply failed.");
      return;
    }
    const json = await response.json();
    setStatus(`Imported ${json.data.importedCount} rows.`);
  };

  return (
    <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
      <CardHeader>
        <CardTitle className="text-base">CSV import wizard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={fileLabel} onChange={(event) => setFileLabel(event.target.value)} className="max-w-sm" />
          <Button size="sm" variant="outline" className="rounded-md" onClick={previewImport}>
            <FileUp className="mr-1.5 h-3.5 w-3.5" />Preview
          </Button>
          <Button size="sm" variant="outline" className="rounded-md" onClick={applyImport}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />Apply
          </Button>
        </div>
        {preview ? (
          <pre className="overflow-auto rounded-lg bg-zinc-900/95 p-3 text-xs text-zinc-100">{JSON.stringify(preview, null, 2)}</pre>
        ) : null}
        {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
      </CardContent>
    </Card>
  );
}
