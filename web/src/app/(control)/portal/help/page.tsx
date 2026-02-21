import { LifeBuoy, Search } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getKnowledge } from "@/lib/apex";

export default async function HelpPage() {
  const articles = await getKnowledge();

  return (
    <div className="space-y-4">
      <PageHeader title="Help / Knowledge" description="Search context-aware support content and escalate when needed." />
      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardContent className="pt-5">
          <div className="flex gap-2">
            <Input placeholder="Search setup, access, repairs, lost/stolen..." />
            <Button className="rounded-xl"><Search className="mr-2 h-4 w-4" />Search</Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {articles.map((article) => (
          <Card key={article.id} className="rounded-2xl border-zinc-300/70 bg-white/85">
            <CardHeader>
              <CardTitle className="text-base">{article.title}</CardTitle>
              <p className="text-xs text-zinc-500">{article.category}</p>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-600">{article.summary}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-2xl border-zinc-300/70 bg-white/85">
        <CardHeader>
          <CardTitle className="text-base">Escalation</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="rounded-xl">
            <LifeBuoy className="mr-2 h-4 w-4" />
            Contact IT
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
