import { PageHeader } from "@/components/app/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sections: Record<string, string[]> = {
  org: [
    "Departments, locations, stockrooms, and cost centers",
    "Region-specific policy and catalog availability"
  ],
  rbac: [
    "Role/action/object permissions",
    "Approval matrix and separation-of-duties rules",
    "Auditor immutable read-only mode"
  ],
  schema: [
    "Custom object types and custom fields",
    "Validation rules and relationship definitions",
    "Field-level access restrictions"
  ],
  automation: [
    "Workflow builder draft/publish/rollback",
    "Policy builder with remediation actions",
    "Catalog forms with conditional logic"
  ],
  notifications: [
    "In-app required notification rules",
    "Optional email and chat channels",
    "SLA and approval escalation routing"
  ]
};

const renderSection = (items: string[]) => (
  <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
    <CardHeader>
      <CardTitle className="text-base">Configuration controls</CardTitle>
    </CardHeader>
    <CardContent className="space-y-2 text-sm text-zinc-600">
      {items.map((item) => (
        <p key={item} className="rounded-lg border border-zinc-200 bg-white px-3 py-2">{item}</p>
      ))}
    </CardContent>
  </Card>
);

export default function AdminStudioPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Admin Studio"
        description="Tenant configuration, schema controls, workflow publishing, and audit trails."
      />

      <Tabs defaultValue="org" className="space-y-4">
        <TabsList className="grid h-auto grid-cols-2 gap-2 rounded-xl bg-white/70 p-1 md:grid-cols-5">
          <TabsTrigger value="org" className="rounded-lg">Org</TabsTrigger>
          <TabsTrigger value="rbac" className="rounded-lg">RBAC</TabsTrigger>
          <TabsTrigger value="schema" className="rounded-lg">Schema</TabsTrigger>
          <TabsTrigger value="automation" className="rounded-lg">Automation</TabsTrigger>
          <TabsTrigger value="notifications" className="rounded-lg">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="org">{renderSection(sections.org)}</TabsContent>
        <TabsContent value="rbac">{renderSection(sections.rbac)}</TabsContent>
        <TabsContent value="schema">{renderSection(sections.schema)}</TabsContent>
        <TabsContent value="automation">{renderSection(sections.automation)}</TabsContent>
        <TabsContent value="notifications">{renderSection(sections.notifications)}</TabsContent>
      </Tabs>
    </div>
  );
}
