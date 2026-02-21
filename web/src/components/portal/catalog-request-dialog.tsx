"use client";

import * as React from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { previewCatalogItem, submitCatalogRequest } from "@/lib/apex";
import { CatalogItem, CatalogPreviewResult } from "@/lib/types";

type Props = {
  triggerLabel: string;
  catalogItems: CatalogItem[];
  defaultCatalogItemId?: string;
};

const toStringValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

export function CatalogRequestDialog({ triggerLabel, catalogItems, defaultCatalogItemId }: Props) {
  const [open, setOpen] = React.useState(false);
  const [selectedCatalogItemId, setSelectedCatalogItemId] = React.useState(defaultCatalogItemId ?? catalogItems[0]?.id ?? "");
  const [fieldValues, setFieldValues] = React.useState<Record<string, unknown>>({});
  const [description, setDescription] = React.useState("");
  const [preview, setPreview] = React.useState<CatalogPreviewResult | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [result, setResult] = React.useState("");

  const selectedItem = catalogItems.find((item) => item.id === selectedCatalogItemId);

  React.useEffect(() => {
    if (!open || !selectedCatalogItemId) {
      return;
    }

    let active = true;
    setLoadingPreview(true);
    previewCatalogItem(selectedCatalogItemId, fieldValues)
      .then((response) => {
        if (active) {
          setPreview(response);
        }
      })
      .catch(() => {
        if (active) {
          setPreview({ catalogItemId: selectedCatalogItemId, fields: [] });
        }
      })
      .finally(() => {
        if (active) {
          setLoadingPreview(false);
        }
      });

    return () => {
      active = false;
    };
  }, [open, selectedCatalogItemId, fieldValues]);

  const onCatalogChange = (catalogItemId: string) => {
    setSelectedCatalogItemId(catalogItemId);
    setFieldValues({});
    setResult("");
  };

  const onFieldChange = (key: string, value: unknown) => {
    setFieldValues((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!selectedItem) {
      return;
    }

    setSubmitting(true);
    setResult("");

    try {
      const requiredMissing = (preview?.fields ?? []).some((field) => {
        if (!field.requiredResolved) {
          return false;
        }
        const value = fieldValues[field.key] ?? field.defaultValue;
        return value === undefined || value === "" || value === null;
      });

      if (requiredMissing) {
        setResult("Fill all required catalog fields before submitting.");
        setSubmitting(false);
        return;
      }

      const submitted = await submitCatalogRequest({
        catalogItemId: selectedItem.id,
        requesterId: "person-1",
        title: selectedItem.name,
        description,
        fieldValues
      });
      setResult(`Request submitted with ${submitted.approvals.length} approval step(s).`);
      setTimeout(() => setOpen(false), 800);
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Failed to submit catalog request.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Catalog request</DialogTitle>
          <DialogDescription>
            Select a catalog item, fill dynamic fields, and submit into the approval workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Select value={selectedCatalogItemId} onValueChange={onCatalogChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select catalog item" />
            </SelectTrigger>
            <SelectContent>
              {catalogItems.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedItem ? (
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <p className="font-medium text-zinc-900">{selectedItem.description}</p>
              <p className="mt-1">Expected delivery: {selectedItem.expectedDelivery}</p>
            </div>
          ) : null}

          {loadingPreview ? (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Resolving form rules...
            </div>
          ) : null}

          <div className="grid gap-2">
            {(preview?.fields ?? []).map((field) => {
              const value = fieldValues[field.key] ?? field.defaultValue;
              const requiredMarker = field.requiredResolved ? " *" : "";

              if (field.type === "text") {
                return (
                  <div key={field.id} className="space-y-1">
                    <p className="text-xs font-medium text-zinc-600">{field.label}{requiredMarker}</p>
                    <Textarea
                      value={toStringValue(value)}
                      onChange={(event) => onFieldChange(field.key, event.target.value)}
                      className="min-h-24"
                    />
                  </div>
                );
              }

              if (field.type === "enum") {
                return (
                  <div key={field.id} className="space-y-1">
                    <p className="text-xs font-medium text-zinc-600">{field.label}{requiredMarker}</p>
                    <Select value={toStringValue(value)} onValueChange={(next) => onFieldChange(field.key, next)}>
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options ?? []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              if (field.type === "bool") {
                return (
                  <div key={field.id} className="space-y-1">
                    <p className="text-xs font-medium text-zinc-600">{field.label}{requiredMarker}</p>
                    <Select
                      value={toStringValue(value)}
                      onValueChange={(next) => onFieldChange(field.key, next === "true")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Select ${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">True</SelectItem>
                        <SelectItem value="false">False</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                );
              }

              return (
                <div key={field.id} className="space-y-1">
                  <p className="text-xs font-medium text-zinc-600">{field.label}{requiredMarker}</p>
                  <Input
                    type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                    value={toStringValue(value)}
                    onChange={(event) => {
                      if (field.type === "number") {
                        onFieldChange(field.key, Number(event.target.value));
                        return;
                      }
                      onFieldChange(field.key, event.target.value);
                    }}
                  />
                </div>
              );
            })}
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-zinc-600">Description (optional)</p>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="min-h-20"
              placeholder="Add business context and timing details"
            />
          </div>

          {result ? <p className="text-xs text-zinc-600">{result}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting || !selectedItem} className="rounded-xl">
            <Send className="mr-2 h-4 w-4" />
            {submitting ? "Submitting..." : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
