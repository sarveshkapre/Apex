import { PageHeader } from "@/components/app/page-header";
import { CommandConsole } from "@/components/portal/command-console";

export default function CommandPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Chat / Command"
        description="LLM-style query, request draft, and plan preview with policy guardrails."
      />
      <CommandConsole />
    </div>
  );
}
