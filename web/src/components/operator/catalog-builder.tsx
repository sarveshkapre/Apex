"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createCatalogItem, getCatalog, updateCatalogItem } from "@/lib/apex";
import { CatalogItem, WorkflowDefinition } from "@/lib/types";

type FieldDraft = {
  key: string;
  label: string;
  type: "string" | "number" | "date" | "enum" | "bool" | "text";
  required: boolean;
  options?: string;
};

export function CatalogBuilder({
  initialCatalog,
  workflows
}: {
  initialCatalog: CatalogItem[];
  workflows: WorkflowDefinition[];
}) {
  const [catalog, setCatalog] = React.useState(initialCatalog);
  const [status, setStatus] = React.useState("");

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState("Devices");
  const [delivery, setDelivery] = React.useState("3-5 business days");
  const [riskLevel, setRiskLevel] = React.useState<"low" | "medium" | "high">("medium");
  const [workflowId, setWorkflowId] = React.useState("");

  const [fieldKey, setFieldKey] = React.useState("business_justification");
  const [fieldLabel, setFieldLabel] = React.useState("Business Justification");
  const [fieldType, setFieldType] = React.useState<FieldDraft["type"]>("text");
  const [fieldRequired, setFieldRequired] = React.useState(true);
  const [fieldOptions, setFieldOptions] = React.useState("");
  const [fields, setFields] = React.useState<FieldDraft[]>([]);

  const refresh = async () => {
    const data = await getCatalog();
    setCatalog(data);
  };

  const addField = () => {
    if (!fieldKey || !fieldLabel) {
      return;
    }
    setFields((current) => [
      ...current,
      {
        key: fieldKey,
        label: fieldLabel,
        type: fieldType,
        required: fieldRequired,
        options: fieldType === "enum" ? fieldOptions : undefined
      }
    ]);
    setFieldKey("");
    setFieldLabel("");
    setFieldType("string");
    setFieldRequired(false);
    setFieldOptions("");
  };

  const create = async () => {
    if (!name || !description || !category) {
      return;
    }

    const response = await createCatalogItem({
      name,
      description,
      category,
      expectedDelivery: delivery,
      audience: ["employee", "contractor"],
      regions: ["global"],
      riskLevel,
      defaultWorkflowDefinitionId: workflowId || undefined,
      formFields: fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        options:
          field.type === "enum"
            ? (field.options ?? "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : undefined
      }))
    });

    if (!response.ok) {
      setStatus("Failed to create catalog item.");
      return;
    }

    setStatus("Catalog item created.");
    setName("");
    setDescription("");
    setCategory("Devices");
    setDelivery("3-5 business days");
    setRiskLevel("medium");
    setWorkflowId("");
    setFields([]);
    await refresh();
  };

  const toggleActive = async (item: CatalogItem, active: boolean) => {
    const response = await updateCatalogItem(item.id, { active });
    setStatus(response.ok ? `Catalog item ${active ? "activated" : "deactivated"}.` : "Failed to update catalog item.");
    await refresh();
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Catalog builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Catalog item name" />
            <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Category" />
            <Input value={delivery} onChange={(event) => setDelivery(event.target.value)} placeholder="Expected delivery" />
            <Select value={riskLevel} onValueChange={(value) => setRiskLevel(value as "low" | "medium" | "high") }>
              <SelectTrigger><SelectValue placeholder="Risk level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" className="min-h-20" />
          <Select value={workflowId} onValueChange={setWorkflowId}>
            <SelectTrigger><SelectValue placeholder="Default workflow (optional)" /></SelectTrigger>
            <SelectContent>
              {workflows.map((workflow) => (
                <SelectItem key={workflow.id} value={workflow.id}>{workflow.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <p className="mb-2 text-sm font-medium text-zinc-900">Form fields</p>
            <div className="grid gap-2 md:grid-cols-3">
              <Input value={fieldKey} onChange={(event) => setFieldKey(event.target.value)} placeholder="field_key" />
              <Input value={fieldLabel} onChange={(event) => setFieldLabel(event.target.value)} placeholder="Field label" />
              <Select value={fieldType} onValueChange={(value) => setFieldType(value as FieldDraft["type"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="enum">Enum</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="bool">Boolean</SelectItem>
                </SelectContent>
              </Select>
              <Input value={fieldOptions} onChange={(event) => setFieldOptions(event.target.value)} placeholder="Enum options (csv)" className="md:col-span-2" />
              <label className="inline-flex items-center gap-2 text-sm text-zinc-700">
                <Switch checked={fieldRequired} onCheckedChange={setFieldRequired} />
                Required
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" className="rounded-xl" onClick={addField}><Plus className="mr-2 h-4 w-4" />Add field</Button>
              <Button className="rounded-xl" onClick={create}>Create catalog item</Button>
            </div>
            {fields.length > 0 ? (
              <div className="mt-2 space-y-1 text-xs text-zinc-600">
                {fields.map((field, index) => (
                  <p key={`${field.key}-${index}`} className="rounded-md border border-zinc-200 bg-white px-2 py-1">
                    {field.key} • {field.type} • {field.required ? "required" : "optional"}
                  </p>
                ))}
              </div>
            ) : null}
          </div>

          {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Catalog inventory ({catalog.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-zinc-600">
          {catalog.map((item) => (
            <div key={item.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
              <p className="font-medium text-zinc-900">{item.name}</p>
              <p className="text-xs text-zinc-500">{item.category} • risk {item.riskLevel ?? "medium"} • workflow {item.defaultWorkflowDefinitionId ?? "none"}</p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Switch checked={item.active ?? true} onCheckedChange={(next) => toggleActive(item, next)} />
                <span>{item.active ?? true ? "Active" : "Inactive"}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
