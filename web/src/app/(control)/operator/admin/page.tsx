import { PageHeader } from "@/components/app/page-header";
import { AdminStudio } from "@/components/operator/admin-studio";
import { CatalogBuilder } from "@/components/operator/catalog-builder";
import {
  getCatalog,
  listApprovalMatrixRules,
  listConfigVersions,
  listCustomSchemas,
  listFieldRestrictions,
  listNotificationRules,
  listPolicies,
  listSodRules,
  listWorkflowDefinitions
} from "@/lib/apex";

export default async function AdminStudioPage() {
  const [schemas, policies, notifications, versions, fieldRestrictions, sodRules, approvalMatrix, catalog, workflows] = await Promise.all([
    listCustomSchemas(),
    listPolicies(),
    listNotificationRules(),
    listConfigVersions(),
    listFieldRestrictions(),
    listSodRules(),
    listApprovalMatrixRules(),
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
        initialFieldRestrictions={fieldRestrictions}
        initialSodRules={sodRules}
        initialApprovalMatrix={approvalMatrix}
      />
      <CatalogBuilder initialCatalog={catalog} workflows={workflows} />
    </div>
  );
}
