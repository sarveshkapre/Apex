"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ConfigVersion,
  CustomObjectSchema,
  NotificationRule,
  PolicyDefinition
} from "@/lib/types";
import {
  createConfigVersion,
  createCustomSchema,
  createNotificationRule,
  createPolicy,
  listConfigVersions,
  listCustomSchemas,
  listNotificationRules,
  listPolicies,
  transitionConfigVersion
} from "@/lib/apex";
import { ImportWizard } from "@/components/operator/import-wizard";

type Props = {
  initialSchemas: CustomObjectSchema[];
  initialPolicies: PolicyDefinition[];
  initialNotifications: NotificationRule[];
  initialVersions: ConfigVersion[];
};

export function AdminStudio({
  initialSchemas,
  initialPolicies,
  initialNotifications,
  initialVersions
}: Props) {
  const [schemas, setSchemas] = React.useState(initialSchemas);
  const [policies, setPolicies] = React.useState(initialPolicies);
  const [notifications, setNotifications] = React.useState(initialNotifications);
  const [versions, setVersions] = React.useState(initialVersions);
  const [status, setStatus] = React.useState("");
  const [schemaName, setSchemaName] = React.useState("");
  const [policyName, setPolicyName] = React.useState("");

  const refresh = async () => {
    const [s, p, n, v] = await Promise.all([
      listCustomSchemas(),
      listPolicies(),
      listNotificationRules(),
      listConfigVersions()
    ]);
    setSchemas(s);
    setPolicies(p);
    setNotifications(n);
    setVersions(v);
  };

  const addSchema = async () => {
    if (!schemaName) {
      return;
    }
    const response = await createCustomSchema({
      name: schemaName,
      pluralName: `${schemaName}s`
    });
    setStatus(response.ok ? "Schema created." : "Schema creation failed.");
    setSchemaName("");
    await refresh();
  };

  const addPolicy = async () => {
    if (!policyName) {
      return;
    }
    const response = await createPolicy({
      name: policyName,
      objectType: "Device",
      field: "encryption_state",
      value: "enabled"
    });
    setStatus(response.ok ? "Policy created." : "Policy creation failed.");
    setPolicyName("");
    await refresh();
  };

  const addNotification = async () => {
    const response = await createNotificationRule({
      name: "SLA breach alert",
      trigger: "sla_breach",
      channels: ["in-app", "email"]
    });
    setStatus(response.ok ? "Notification rule created." : "Notification rule creation failed.");
    await refresh();
  };

  const addConfigVersion = async () => {
    const response = await createConfigVersion({
      kind: "policy",
      name: "Encryption required",
      reason: "Draft policy tuning"
    });
    setStatus(response.ok ? "Config version draft created." : "Failed to create config version.");
    await refresh();
  };

  const publishVersion = async (id: string) => {
    const response = await transitionConfigVersion(id, "published", "Approved for production");
    setStatus(response.ok ? "Config published." : "Failed to publish config.");
    await refresh();
  };

  const rollbackVersion = async (id: string) => {
    const response = await transitionConfigVersion(id, "rolled_back", "Rollback to prior version");
    setStatus(response.ok ? "Config rolled back." : "Failed to roll back config.");
    await refresh();
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Create custom schema</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input value={schemaName} onChange={(event) => setSchemaName(event.target.value)} placeholder="Schema name" className="max-w-sm" />
          <Button onClick={addSchema} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Create policy</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input value={policyName} onChange={(event) => setPolicyName(event.target.value)} placeholder="Policy name" className="max-w-sm" />
          <Button onClick={addPolicy} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add</Button>
          <Button variant="outline" className="rounded-xl" onClick={addNotification}>Add notification rule</Button>
          <Button variant="outline" className="rounded-xl" onClick={addConfigVersion}>Create config draft</Button>
        </CardContent>
      </Card>

      <ImportWizard />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader><CardTitle className="text-base">Schemas ({schemas.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            {schemas.map((schema) => (
              <p key={schema.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                {schema.name} • {schema.fields.length} fields
              </p>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader><CardTitle className="text-base">Policies ({policies.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            {policies.map((policy) => (
              <p key={policy.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                {policy.name} • {policy.objectType} • v{policy.version}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader><CardTitle className="text-base">Notification rules ({notifications.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            {notifications.map((rule) => (
              <p key={rule.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                {rule.name} • {rule.trigger} • {rule.channels.join(", ")}
              </p>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader><CardTitle className="text-base">Config versions ({versions.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            {versions.map((version) => (
              <div key={version.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <p>
                  {version.kind}: {version.name} v{version.version} • {version.state}
                </p>
                <div className="mt-1.5 flex gap-1.5">
                  <Button size="sm" variant="outline" className="rounded-md" onClick={() => publishVersion(version.id)}>Publish</Button>
                  <Button size="sm" variant="outline" className="rounded-md" onClick={() => rollbackVersion(version.id)}>Rollback</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
