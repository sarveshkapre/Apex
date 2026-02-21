import { PageHeader } from "@/components/app/page-header";
import { AdminStudio } from "@/components/operator/admin-studio";
import { CatalogBuilder } from "@/components/operator/catalog-builder";
import {
  getCatalog,
  listApprovalMatrixRules,
  listConfigVersionReadiness,
  listConfigVersions,
  listCustomSchemas,
  listFieldRestrictions,
  listNotificationRules,
  listPolicies,
  listSandboxRuns,
  listSodRules,
  listWorkflowDefinitions
} from "@/lib/apex";

export default async function AdminStudioPage() {
  const [schemas, policies, notifications, versions, configReadiness, fieldRestrictions, sodRules, approvalMatrix, sandboxRuns, catalog, workflows] = await Promise.all([
    listCustomSchemas(),
    listPolicies(),
    listNotificationRules(),
    listConfigVersions(),
    listConfigVersionReadiness(),
    listFieldRestrictions(),
    listSodRules(),
    listApprovalMatrixRules(),
    listSandboxRuns(),
    getCatalog(),
    listWorkflowDefinitions()
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Admin Studio"
        description="Schema, policy, notification, and configuration version governance controls."
      />
      <AdminStudio
        initialSchemas={schemas}
        initialPolicies={policies}
        initialNotifications={notifications}
        initialVersions={versions}
        initialConfigReadiness={configReadiness}
        initialFieldRestrictions={fieldRestrictions}
        initialSodRules={sodRules}
        initialApprovalMatrix={approvalMatrix}
        initialSandboxRuns={sandboxRuns}
      />
      <CatalogBuilder initialCatalog={catalog} workflows={workflows} />
    </div>
  );
}
