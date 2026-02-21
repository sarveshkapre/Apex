import { Check, Circle, Dot } from "lucide-react";

const order = ["Submitted", "Approved", "In progress", "Waiting on you", "Completed"];

export function RequestTimeline({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const completeIndex = order.findIndex((step) =>
    normalized.includes(step.toLowerCase().replace(" on you", "").replace(" ", ""))
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      {order.map((step, index) => {
        const state = completeIndex >= index || (status === "Completed" && index === order.length - 1);
        return (
          <div key={step} className="inline-flex items-center gap-1.5">
            {state ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : index === 0 ? <Circle className="h-3.5 w-3.5" /> : <Dot className="h-3.5 w-3.5" />}
            <span className={state ? "text-zinc-800" : "text-zinc-500"}>{step}</span>
          </div>
        );
      })}
    </div>
  );
}
