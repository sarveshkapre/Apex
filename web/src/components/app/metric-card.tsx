import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function MetricCard({
  title,
  value,
  helper
}: {
  title: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <Card className="rounded-2xl border-zinc-300/70 bg-white/85 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-zinc-600">{title}</CardTitle>
        <ArrowUpRight className="h-4 w-4 text-zinc-400" />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
        {helper ? <p className="mt-1 text-xs text-zinc-500">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}
