import { PageHeader } from "@/components/app/page-header";
import { AdminStudio } from "@/components/operator/admin-studio";
import {
  listConfigVersions,
  listCustomSchemas,
  listNotificationRules,
  listPolicies
} from "@/lib/apex";

export default async function AdminStudioPage() {
  const [schemas, policies, notifications, versions] = await Promise.all([
    listCustomSchemas(),
    listPolicies(),
    listNotificationRules(),
    listConfigVersions()
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
      />
    </div>
  );
}
