import { Badge } from "@/components/ui/badge";

const tone: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-700",
  "In Progress": "bg-blue-100 text-blue-700",
  Waiting: "bg-amber-100 text-amber-700",
  Submitted: "bg-zinc-100 text-zinc-700",
  Completed: "bg-emerald-100 text-emerald-700",
  Blocked: "bg-rose-100 text-rose-700",
  Healthy: "bg-emerald-100 text-emerald-700",
  Degraded: "bg-amber-100 text-amber-700",
  Failed: "bg-rose-100 text-rose-700",
  compliant: "bg-emerald-100 text-emerald-700",
  noncompliant: "bg-rose-100 text-rose-700"
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <Badge className={`rounded-full border-0 px-2 py-0.5 font-normal ${tone[value] ?? "bg-zinc-100 text-zinc-700"}`}>
      {value}
    </Badge>
  );
}
