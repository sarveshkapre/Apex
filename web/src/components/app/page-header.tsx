import { Badge } from "@/components/ui/badge";

export function PageHeader({
  title,
  description,
  badge
}: {
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <p className="mt-1 text-sm text-zinc-600">{description}</p>
      </div>
      {badge ? <Badge className="rounded-full bg-zinc-900 text-white">{badge}</Badge> : null}
    </div>
  );
}
