import { PageHeader } from "@/components/app/page-header";
import { AssistantLab } from "@/components/portal/assistant-lab";
import { CommandConsole } from "@/components/portal/command-console";

export default function CommandPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Chat / Command"
        description="LLM query, request draft, plan preview, policy/workflow drafting, and anomaly insights."
      />
      <CommandConsole />
      <AssistantLab />
    </div>
  );
}
