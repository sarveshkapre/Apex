"use client";

import * as React from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ApprovalMatrixRule,
  ApprovalMatrixSimulationResult,
  ConfigVersion,
  ConfigVersionReadiness,
  CustomObjectSchema,
  FieldRestriction,
  NotificationRule,
  PolicyDefinition,
  SandboxRun,
  SodRule
} from "@/lib/types";
import {
  authorizeAction,
  createApprovalChain,
  createApprovalMatrixRule,
  createConfigVersion,
  createCustomSchema,
  createFieldRestriction,
  createNotificationRule,
  createPolicy,
  createSandboxRun,
  createSodRule,
  listApprovalMatrixRules,
  listConfigVersionReadiness,
  listConfigVersions,
  listCustomSchemas,
  listFieldRestrictions,
  listNotificationRules,
  listPolicies,
  listSandboxRuns,
  listSodRules,
  simulateApprovalMatrixRule,
  transitionConfigVersion
} from "@/lib/apex";
import { ImportWizard } from "@/components/operator/import-wizard";

type Props = {
  initialSchemas: CustomObjectSchema[];
  initialPolicies: PolicyDefinition[];
  initialNotifications: NotificationRule[];
  initialVersions: ConfigVersion[];
  initialConfigReadiness: ConfigVersionReadiness[];
  initialFieldRestrictions: FieldRestriction[];
  initialSodRules: SodRule[];
  initialApprovalMatrix: ApprovalMatrixRule[];
  initialSandboxRuns: SandboxRun[];
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
  initialConfigReadiness,
  initialFieldRestrictions,
  initialSodRules,
  initialApprovalMatrix,
  initialSandboxRuns
}: Props) {
  const [schemas, setSchemas] = React.useState(initialSchemas);
  const [policies, setPolicies] = React.useState(initialPolicies);
  const [notifications, setNotifications] = React.useState(initialNotifications);
  const [versions, setVersions] = React.useState(initialVersions);
  const [configReadiness, setConfigReadiness] = React.useState(initialConfigReadiness);
  const [fieldRestrictions, setFieldRestrictions] = React.useState(initialFieldRestrictions);
  const [sodRules, setSodRules] = React.useState(initialSodRules);
  const [approvalMatrix, setApprovalMatrix] = React.useState(initialApprovalMatrix);
  const [sandboxRuns, setSandboxRuns] = React.useState(initialSandboxRuns);

  const [status, setStatus] = React.useState("");
  const [schemaName, setSchemaName] = React.useState("");
  const [policyName, setPolicyName] = React.useState("");
  const [configKind, setConfigKind] = React.useState<"workflow" | "policy" | "catalog" | "schema" | "rbac">("policy");
  const [configName, setConfigName] = React.useState("Encryption required");
  const [configReason, setConfigReason] = React.useState("Draft policy tuning");
  const [configTargetKind, setConfigTargetKind] = React.useState<"policy" | "workflow">("policy");
  const [configTargetId, setConfigTargetId] = React.useState("");

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
  const [matrixCostThreshold, setMatrixCostThreshold] = React.useState("");
  const [matrixRegions, setMatrixRegions] = React.useState("");
  const [matrixRequiredTags, setMatrixRequiredTags] = React.useState("");
  const [matrixLinkedObjectTypes, setMatrixLinkedObjectTypes] = React.useState("");
  const [matrixApprovers, setMatrixApprovers] = React.useState("manager,security");
  const [simulationRequestType, setSimulationRequestType] = React.useState("Request");
  const [simulationRiskLevel, setSimulationRiskLevel] = React.useState<"low" | "medium" | "high">("medium");
  const [simulationEstimatedCost, setSimulationEstimatedCost] = React.useState("");
  const [simulationRegion, setSimulationRegion] = React.useState("");
  const [simulationTags, setSimulationTags] = React.useState("");
  const [simulationLinkedObjectTypes, setSimulationLinkedObjectTypes] = React.useState("");
  const [simulationResult, setSimulationResult] = React.useState<ApprovalMatrixSimulationResult | null>(null);

  const [chainWorkItemId, setChainWorkItemId] = React.useState("");
  const [chainMode, setChainMode] = React.useState<"all" | "any">("all");
  const [chainApprovals, setChainApprovals] = React.useState("manager:manager-approver,security:security-approver");
  const [chainReason, setChainReason] = React.useState("Manual approval chain required for sensitive change.");
  const [sandboxKind, setSandboxKind] = React.useState<"policy" | "workflow">("policy");
  const [sandboxTargetId, setSandboxTargetId] = React.useState("");
  const [sandboxInputs, setSandboxInputs] = React.useState("{\n  \"requesterId\": \"person-1\"\n}");
  const [sandboxResult, setSandboxResult] = React.useState<Record<string, unknown> | null>(null);

  const [authAction, setAuthAction] = React.useState("automation:high-risk");
  const [authResult, setAuthResult] = React.useState<string>("");

  const refresh = async () => {
    const [s, p, n, v, readiness, f, sod, matrix, sandbox] = await Promise.all([
      listCustomSchemas(),
      listPolicies(),
      listNotificationRules(),
      listConfigVersions(),
      listConfigVersionReadiness(),
      listFieldRestrictions(),
      listSodRules(),
      listApprovalMatrixRules(),
      listSandboxRuns()
    ]);
    setSchemas(s);
    setPolicies(p);
    setNotifications(n);
    setVersions(v);
    setConfigReadiness(readiness);
    setFieldRestrictions(f);
    setSodRules(sod);
    setApprovalMatrix(matrix);
    setSandboxRuns(sandbox);
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
    if (!configName.trim()) {
      setStatus("Config name is required.");
      return;
    }
    const response = await createConfigVersion({
      kind: configKind,
      name: configName.trim(),
      reason: configReason.trim() || "Config draft update",
      targetKind: configKind === "policy" || configKind === "workflow" ? configTargetKind : undefined,
      targetId: configTargetId.trim() || undefined
    });
    setStatus(response.ok ? "Config version draft created." : "Failed to create config version.");
    await refresh();
  };

  const publishVersion = async (id: string) => {
    const response = await transitionConfigVersion(id, "published", "Approved for production");
    if (response.ok) {
      setStatus("Config published.");
    } else {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; data?: { reason?: string } }
        | null;
      if (payload?.error) {
        const detail = payload.data?.reason ? ` ${payload.data.reason}` : "";
        setStatus(`${payload.error}.${detail}`.trim());
      } else {
        setStatus("Failed to publish config.");
      }
    }
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
    const parsedCost = matrixCostThreshold.trim();
    const response = await createApprovalMatrixRule({
      name: matrixName,
      requestType: matrixRequestType,
      riskLevel: matrixRisk,
      costThreshold: parsedCost ? Number(parsedCost) : undefined,
      regions: parseCsv(matrixRegions),
      requiredTags: parseCsv(matrixRequiredTags),
      linkedObjectTypes: parseCsv(matrixLinkedObjectTypes),
      approverTypes: parseCsv(matrixApprovers),
      enabled: true
    });
    setStatus(response.ok ? "Approval matrix rule added." : "Failed to add approval matrix rule.");
    await refresh();
  };

  const runApprovalMatrixSimulation = async () => {
    try {
      const parsedCost = simulationEstimatedCost.trim();
      const result = await simulateApprovalMatrixRule({
        requestType: simulationRequestType,
        riskLevel: simulationRiskLevel,
        estimatedCost: parsedCost ? Number(parsedCost) : undefined,
        region: simulationRegion.trim() || undefined,
        tags: parseCsv(simulationTags),
        linkedObjectTypes: parseCsv(simulationLinkedObjectTypes)
      });
      setSimulationResult(result);
      setStatus(
        result.fallbackUsed
          ? `Simulation used fallback approvers: ${result.approverTypes.join(", ")}.`
          : `Simulation matched ${result.matchedRules.length} rule(s): ${result.approverTypes.join(", ")}.`
      );
    } catch {
      setSimulationResult(null);
      setStatus("Approval matrix simulation failed.");
    }
  };

  const addApprovalChain = async () => {
    if (!chainWorkItemId.trim()) {
      setStatus("Work item id is required to create an approval chain.");
      return;
    }
    const parsedApprovals = parseCsv(chainApprovals)
      .map((entry) => {
        const [typeRaw, approverId] = entry.split(":").map((value) => value.trim());
        if (!typeRaw || !approverId) {
          return null;
        }
        const type = typeRaw as "manager" | "app-owner" | "security" | "finance" | "it" | "custom";
        return { type, approverId };
      })
      .filter((item): item is { type: "manager" | "app-owner" | "security" | "finance" | "it" | "custom"; approverId: string } => Boolean(item));

    if (parsedApprovals.length === 0) {
      setStatus("Approval chain must include at least one type:approver pair.");
      return;
    }

    try {
      const result = await createApprovalChain({
        workItemId: chainWorkItemId.trim(),
        mode: chainMode,
        approvals: parsedApprovals,
        reason: chainReason
      });
      setStatus(`Approval chain ${result.chainId.slice(0, 8)} created with ${result.approvals.length} step(s).`);
    } catch {
      setStatus("Failed to create approval chain.");
    }
  };

  const runSandbox = async () => {
    if (!sandboxTargetId.trim()) {
      setStatus("Sandbox target id is required.");
      return;
    }

    let parsedInputs: Record<string, unknown> = {};
    if (sandboxInputs.trim()) {
      try {
        const raw = JSON.parse(sandboxInputs) as unknown;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          setStatus("Sandbox inputs must be a JSON object.");
          return;
        }
        parsedInputs = raw as Record<string, unknown>;
      } catch {
        setStatus("Sandbox inputs must be valid JSON.");
        return;
      }
    }

    try {
      const run = await createSandboxRun({
        kind: sandboxKind,
        targetId: sandboxTargetId.trim(),
        inputs: parsedInputs
      });
      setSandboxResult(run.result);
      setStatus(`Sandbox run completed: ${run.summary}`);
      await refresh();
    } catch {
      setStatus("Sandbox run failed.");
    }
  };

  const checkAuthorization = async () => {
    const result = await authorizeAction(authAction);
    setAuthResult(`${result.actor.role} ${result.allowed ? "can" : "cannot"} run ${result.action}`);
  };

  const readinessByVersion = React.useMemo(
    () =>
      configReadiness.reduce<Record<string, ConfigVersionReadiness>>((acc, item) => {
        acc[item.versionId] = item;
        return acc;
      }, {}),
    [configReadiness]
  );

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
        <CardContent className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Input value={policyName} onChange={(event) => setPolicyName(event.target.value)} placeholder="Policy name" className="max-w-sm" />
            <Button onClick={addPolicy} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add policy</Button>
            <Button variant="outline" className="rounded-xl" onClick={addNotification}>Add notification rule</Button>
          </div>
          <div className="grid gap-2 md:grid-cols-5">
            <Select value={configKind} onValueChange={(value) => setConfigKind(value as "workflow" | "policy" | "catalog" | "schema" | "rbac")}>
              <SelectTrigger><SelectValue placeholder="Config kind" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="workflow">Workflow</SelectItem>
                <SelectItem value="catalog">Catalog</SelectItem>
                <SelectItem value="schema">Schema</SelectItem>
                <SelectItem value="rbac">RBAC</SelectItem>
              </SelectContent>
            </Select>
            <Input value={configName} onChange={(event) => setConfigName(event.target.value)} placeholder="Config name" />
            <Input value={configReason} onChange={(event) => setConfigReason(event.target.value)} placeholder="Change reason" />
            <Select value={configTargetKind} onValueChange={(value) => setConfigTargetKind(value as "policy" | "workflow")}>
              <SelectTrigger disabled={!(configKind === "policy" || configKind === "workflow")}><SelectValue placeholder="Target kind" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="workflow">Workflow</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={configTargetId}
              onChange={(event) => setConfigTargetId(event.target.value)}
              placeholder="Target id (recommended)"
              disabled={!(configKind === "policy" || configKind === "workflow")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-xl" onClick={addConfigVersion}>Create config draft</Button>
          </div>
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
            <Input
              value={matrixCostThreshold}
              onChange={(event) => setMatrixCostThreshold(event.target.value)}
              placeholder="Cost threshold (optional)"
              type="number"
            />
            <Input value={matrixRegions} onChange={(event) => setMatrixRegions(event.target.value)} placeholder="Regions (csv, optional)" />
            <Input
              value={matrixRequiredTags}
              onChange={(event) => setMatrixRequiredTags(event.target.value)}
              placeholder="Required tags (csv, optional)"
            />
            <Input
              value={matrixLinkedObjectTypes}
              onChange={(event) => setMatrixLinkedObjectTypes(event.target.value)}
              placeholder="Linked object types (csv, optional)"
            />
            <Input value={matrixApprovers} onChange={(event) => setMatrixApprovers(event.target.value)} placeholder="Approver types (csv)" />
            <Button onClick={addApprovalMatrixRule} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Add matrix rule</Button>
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
              <p className="text-xs font-medium text-zinc-700">Simulate routing before publish</p>
              <Select value={simulationRequestType} onValueChange={setSimulationRequestType}>
                <SelectTrigger><SelectValue placeholder="Request type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Request">Request</SelectItem>
                  <SelectItem value="Change">Change</SelectItem>
                  <SelectItem value="Task">Task</SelectItem>
                  <SelectItem value="Incident">Incident</SelectItem>
                </SelectContent>
              </Select>
              <Select value={simulationRiskLevel} onValueChange={(value) => setSimulationRiskLevel(value as "low" | "medium" | "high")}>
                <SelectTrigger><SelectValue placeholder="Risk level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={simulationEstimatedCost}
                onChange={(event) => setSimulationEstimatedCost(event.target.value)}
                placeholder="Estimated cost (optional)"
                type="number"
              />
              <Input value={simulationRegion} onChange={(event) => setSimulationRegion(event.target.value)} placeholder="Region (optional)" />
              <Input value={simulationTags} onChange={(event) => setSimulationTags(event.target.value)} placeholder="Tags (csv, optional)" />
              <Input
                value={simulationLinkedObjectTypes}
                onChange={(event) => setSimulationLinkedObjectTypes(event.target.value)}
                placeholder="Linked object types (csv, optional)"
              />
              <Button variant="outline" onClick={runApprovalMatrixSimulation} className="rounded-xl">
                Simulate matrix routing
              </Button>
              {simulationResult ? (
                <div className="space-y-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-600">
                  <p>
                    Result: {simulationResult.fallbackUsed ? "fallback to manager" : "rule match"} • Approvers:{" "}
                    {simulationResult.approverTypes.join(", ")}
                  </p>
                  {simulationResult.matchedRules.map((rule) => (
                    <p key={rule.id}>
                      {rule.name} • {rule.requestType}/{rule.riskLevel} • {rule.approverTypes.join(", ")}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="space-y-1 text-xs text-zinc-600">
              {approvalMatrix.map((rule) => (
                <p key={rule.id} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5">
                  {rule.name} • {rule.requestType} • {rule.riskLevel} • {rule.approverTypes.join(",")}
                  {rule.costThreshold !== undefined ? ` • min$${rule.costThreshold}` : ""}
                  {rule.regions?.length ? ` • regions:${rule.regions.join("/")}` : ""}
                  {rule.requiredTags?.length ? ` • tags:${rule.requiredTags.join("/")}` : ""}
                  {rule.linkedObjectTypes?.length ? ` • objects:${rule.linkedObjectTypes.join("/")}` : ""}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Manual approval chain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            value={chainWorkItemId}
            onChange={(event) => setChainWorkItemId(event.target.value)}
            placeholder="Work item id"
            className="max-w-sm"
          />
          <Select value={chainMode} onValueChange={(value) => setChainMode(value as "all" | "any")}>
            <SelectTrigger className="max-w-sm"><SelectValue placeholder="Chain mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All approvers required</SelectItem>
              <SelectItem value="any">Any approver can satisfy</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={chainApprovals}
            onChange={(event) => setChainApprovals(event.target.value)}
            placeholder="type:approver (csv)"
          />
          <Input value={chainReason} onChange={(event) => setChainReason(event.target.value)} placeholder="Reason" />
          <Button onClick={addApprovalChain} className="rounded-xl"><Plus className="mr-2 h-4 w-4" />Create approval chain</Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Sandbox Lab (safe dry-run)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-2">
          <div className="space-y-2">
            <Select value={sandboxKind} onValueChange={(value) => setSandboxKind(value as "policy" | "workflow")}>
              <SelectTrigger><SelectValue placeholder="Target kind" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="workflow">Workflow</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={sandboxTargetId}
              onChange={(event) => setSandboxTargetId(event.target.value)}
              placeholder={sandboxKind === "policy" ? "Policy id (e.g. pol-...)" : "Workflow definition id (e.g. wf-...)"}
            />
            <Textarea
              value={sandboxInputs}
              onChange={(event) => setSandboxInputs(event.target.value)}
              placeholder="JSON inputs"
              className="min-h-[120px] font-mono text-xs"
            />
            <Button variant="outline" className="rounded-xl" onClick={runSandbox}>Run dry-run sandbox</Button>
            {sandboxResult ? (
              <pre className="overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-100">
                {JSON.stringify(sandboxResult, null, 2)}
              </pre>
            ) : null}
          </div>
          <div className="space-y-2 text-xs text-zinc-600">
            {sandboxRuns.length === 0 ? (
              <p className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2">No sandbox runs yet.</p>
            ) : (
              sandboxRuns.slice(0, 8).map((run) => (
                <div key={run.id} className="rounded-lg border border-zinc-200 bg-white px-2.5 py-2">
                  <p className="font-medium text-zinc-900">{run.kind} • {run.targetName}</p>
                  <p>{run.summary}</p>
                  <p className="text-zinc-500">{run.id.slice(0, 8)} • {run.mode} • {run.createdAt}</p>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

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
                {readinessByVersion[version.id] ? (
                  <p className="mt-1 text-xs text-zinc-500">
                    Sandbox gate: {readinessByVersion[version.id].ready ? "ready" : "blocked"} • {readinessByVersion[version.id].reason}
                  </p>
                ) : null}
                {readinessByVersion[version.id]?.latestSandboxRunAt ? (
                  <p className="text-xs text-zinc-500">
                    Last sandbox: {readinessByVersion[version.id].latestSandboxRunAt}
                  </p>
                ) : null}
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-md"
                    onClick={() => publishVersion(version.id)}
                    disabled={Boolean(
                      readinessByVersion[version.id]?.requiredSandbox &&
                        !readinessByVersion[version.id]?.ready
                    )}
                  >
                    Publish
                  </Button>
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
