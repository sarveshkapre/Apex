"use client";

import * as React from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ApprovalMatrixRule,
  ConfigVersion,
  CustomObjectSchema,
  FieldRestriction,
  NotificationRule,
  PolicyDefinition,
  SodRule
} from "@/lib/types";
import {
  authorizeAction,
  createApprovalMatrixRule,
  createConfigVersion,
  createCustomSchema,
  createFieldRestriction,
  createNotificationRule,
  createPolicy,
  createSodRule,
  listApprovalMatrixRules,
  listConfigVersions,
  listCustomSchemas,
  listFieldRestrictions,
  listNotificationRules,
  listPolicies,
  listSodRules,
  transitionConfigVersion
} from "@/lib/apex";
import { ImportWizard } from "@/components/operator/import-wizard";

type Props = {
  initialSchemas: CustomObjectSchema[];
  initialPolicies: PolicyDefinition[];
  initialNotifications: NotificationRule[];
  initialVersions: ConfigVersion[];
  initialFieldRestrictions: FieldRestriction[];
  initialSodRules: SodRule[];
  initialApprovalMatrix: ApprovalMatrixRule[];
};

const parseCsv = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export function AdminStudio({
  initialSchemas,
  initialPolicies,
  initialNotifications,
  initialVersions,
  initialFieldRestrictions,
  initialSodRules,
  initialApprovalMatrix
}: Props) {
  const [schemas, setSchemas] = React.useState(initialSchemas);
  const [policies, setPolicies] = React.useState(initialPolicies);
  const [notifications, setNotifications] = React.useState(initialNotifications);
  const [versions, setVersions] = React.useState(initialVersions);
  const [fieldRestrictions, setFieldRestrictions] = React.useState(initialFieldRestrictions);
  const [sodRules, setSodRules] = React.useState(initialSodRules);
  const [approvalMatrix, setApprovalMatrix] = React.useState(initialApprovalMatrix);

  const [status, setStatus] = React.useState("");
  const [schemaName, setSchemaName] = React.useState("");
  const [policyName, setPolicyName] = React.useState("");

  const [restrictionObjectType, setRestrictionObjectType] = React.useState("Person");
  const [restrictionField, setRestrictionField] = React.useState("compensation");
  const [restrictionReadRoles, setRestrictionReadRoles] = React.useState("it-admin,finance");
  const [restrictionWriteRoles, setRestrictionWriteRoles] = React.useState("it-admin,finance");

  const [sodName, setSodName] = React.useState("Requester cannot approve own request");
  const [sodDescription, setSodDescription] = React.useState("Blocks requester identity from approving matching request types.");
  const [sodRequestTypes, setSodRequestTypes] = React.useState("Request,Change");

  const [matrixName, setMatrixName] = React.useState("High risk access chain");
  const [matrixRequestType, setMatrixRequestType] = React.useState("Request");
  const [matrixRisk, setMatrixRisk] = React.useState<"low" | "medium" | "high">("high");
  const [matrixApprovers, setMatrixApprovers] = React.useState("manager,security");

  const [authAction, setAuthAction] = React.useState("automation:high-risk");
  const [authResult, setAuthResult] = React.useState<string>("");

  const refresh = async () => {
    const [s, p, n, v, f, sod, matrix] = await Promise.all([
      listCustomSchemas(),
      listPolicies(),
      listNotificationRules(),
      listConfigVersions(),
      listFieldRestrictions(),
      listSodRules(),
      listApprovalMatrixRules()
    ]);
    setSchemas(s);
    setPolicies(p);
    setNotifications(n);
    setVersions(v);
    setFieldRestrictions(f);
    setSodRules(sod);
    setApprovalMatrix(matrix);
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

  const addFieldRestriction = async () => {
    const response = await createFieldRestriction({
      objectType: restrictionObjectType,
      field: restrictionField,
      readRoles: parseCsv(restrictionReadRoles),
      writeRoles: parseCsv(restrictionWriteRoles),
      maskStyle: "redacted"
    });
    setStatus(response.ok ? "Field restriction added." : "Failed to add field restriction.");
    await refresh();
  };

  const addSodRule = async () => {
    const response = await createSodRule({
      name: sodName,
      description: sodDescription,
      requestTypes: parseCsv(sodRequestTypes),
      enabled: true
    });
    setStatus(response.ok ? "SoD rule added." : "Failed to add SoD rule.");
    await refresh();
  };

  const addApprovalMatrixRule = async () => {
    const response = await createApprovalMatrixRule({
      name: matrixName,
      requestType: matrixRequestType,
      riskLevel: matrixRisk,
      approverTypes: parseCsv(matrixApprovers),
      enabled: true
    });
    setStatus(response.ok ? "Approval matrix rule added." : "Failed to add approval matrix rule.");
    await refresh();
  };

  const checkAuthorization = async () => {
    const result = await authorizeAction(authAction);
    setAuthResult(`${result.actor.role} ${result.allowed ? "can" : "cannot"} run ${result.action}`);
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
          <CardTitle className="text-base">Create policy and version draft</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input value={policyName} onChange={(event) => setPolicyName(event.target.value)} placeholder="Policy name" className="max-w-sm" />
          <Button onClick={addPolicy} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add policy</Button>
          <Button variant="outline" className="rounded-xl" onClick={addNotification}>Add notification rule</Button>
          <Button variant="outline" className="rounded-xl" onClick={addConfigVersion}>Create config draft</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">RBAC field restrictions</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-5">
          <Select value={restrictionObjectType} onValueChange={setRestrictionObjectType}>
            <SelectTrigger className="md:col-span-1"><SelectValue placeholder="Object type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Person">Person</SelectItem>
              <SelectItem value="Identity">Identity</SelectItem>
              <SelectItem value="Device">Device</SelectItem>
              <SelectItem value="SaaSAccount">SaaS Account</SelectItem>
              <SelectItem value="CloudResource">Cloud Resource</SelectItem>
            </SelectContent>
          </Select>
          <Input value={restrictionField} onChange={(event) => setRestrictionField(event.target.value)} placeholder="Field name" className="md:col-span-1" />
          <Input value={restrictionReadRoles} onChange={(event) => setRestrictionReadRoles(event.target.value)} placeholder="Read roles (csv)" className="md:col-span-1" />
          <Input value={restrictionWriteRoles} onChange={(event) => setRestrictionWriteRoles(event.target.value)} placeholder="Write roles (csv)" className="md:col-span-1" />
          <Button onClick={addFieldRestriction} className="rounded-xl md:col-span-1"><ShieldCheck className="mr-2 h-4 w-4" />Enforce</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Separation of duties rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input value={sodName} onChange={(event) => setSodName(event.target.value)} placeholder="Rule name" />
            <Input value={sodDescription} onChange={(event) => setSodDescription(event.target.value)} placeholder="Description" />
            <Input value={sodRequestTypes} onChange={(event) => setSodRequestTypes(event.target.value)} placeholder="Request types (csv)" />
            <Button onClick={addSodRule} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add SoD rule</Button>
            <div className="space-y-1 text-xs text-zinc-600">
              {sodRules.map((rule) => (
                <p key={rule.id} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5">
                  {rule.name} • {rule.requestTypes.join(", ")} • {rule.enabled ? "enabled" : "disabled"}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
          <CardHeader>
            <CardTitle className="text-base">Approval matrix</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input value={matrixName} onChange={(event) => setMatrixName(event.target.value)} placeholder="Rule name" />
            <Select value={matrixRequestType} onValueChange={setMatrixRequestType}>
              <SelectTrigger><SelectValue placeholder="Request type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Request">Request</SelectItem>
                <SelectItem value="Change">Change</SelectItem>
                <SelectItem value="Task">Task</SelectItem>
                <SelectItem value="Incident">Incident</SelectItem>
              </SelectContent>
            </Select>
            <Select value={matrixRisk} onValueChange={(value) => setMatrixRisk(value as "low" | "medium" | "high")}>
              <SelectTrigger><SelectValue placeholder="Risk" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Input value={matrixApprovers} onChange={(event) => setMatrixApprovers(event.target.value)} placeholder="Approver types (csv)" />
            <Button onClick={addApprovalMatrixRule} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add matrix rule</Button>
            <div className="space-y-1 text-xs text-zinc-600">
              {approvalMatrix.map((rule) => (
                <p key={rule.id} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5">
                  {rule.name} • {rule.requestType} • {rule.riskLevel} • {rule.approverTypes.join(",")}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Authorization check</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={authAction} onValueChange={setAuthAction}>
            <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="object:view">object:view</SelectItem>
              <SelectItem value="object:create">object:create</SelectItem>
              <SelectItem value="object:update">object:update</SelectItem>
              <SelectItem value="workflow:run">workflow:run</SelectItem>
              <SelectItem value="workflow:edit">workflow:edit</SelectItem>
              <SelectItem value="approval:decide">approval:decide</SelectItem>
              <SelectItem value="automation:high-risk">automation:high-risk</SelectItem>
              <SelectItem value="audit:export">audit:export</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="rounded-xl" onClick={checkAuthorization}>Evaluate</Button>
          {authResult ? <p className="text-xs text-zinc-600">{authResult}</p> : null}
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
          <CardHeader><CardTitle className="text-base">Field restrictions ({fieldRestrictions.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-600">
            {fieldRestrictions.map((restriction) => (
              <p key={restriction.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                {restriction.objectType}.{restriction.field} • read [{restriction.readRoles.join(",")}] • write [{restriction.writeRoles.join(",")}]
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
      </div>

      {status ? <p className="text-xs text-zinc-500">{status}</p> : null}
    </div>
  );
}
