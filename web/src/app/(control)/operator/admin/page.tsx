import { PageHeader } from "@/components/app/page-header";
import { AdminStudio } from "@/components/operator/admin-studio";
import {
  listApprovalMatrixRules,
  listConfigVersions,
  listCustomSchemas,
  listFieldRestrictions,
  listNotificationRules,
  listPolicies,
  listSodRules
} from "@/lib/apex";

export default async function AdminStudioPage() {
  const [schemas, policies, notifications, versions, fieldRestrictions, sodRules, approvalMatrix] = await Promise.all([
    listCustomSchemas(),
    listPolicies(),
    listNotificationRules(),
    listConfigVersions(),
    listFieldRestrictions(),
    listSodRules(),
    listApprovalMatrixRules()
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
    </div>
  );
}
