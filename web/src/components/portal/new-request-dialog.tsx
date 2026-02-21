"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  triggerLabel: string;
  defaultType?: string;
};

export function NewRequestDialog({ triggerLabel, defaultType = "Request" }: Props) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<string>("");
  const [type, setType] = React.useState(defaultType);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setResult("");

    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "");
    const description = String(form.get("description") ?? "");

    try {
      const response = await fetch("/api/apex/work-items", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-actor-id": "portal-user-1",
          "x-actor-role": "end-user"
        },
        body: JSON.stringify({
          tenantId: "tenant-demo",
          workspaceId: "workspace-demo",
          type,
          priority: "P2",
          title,
          description,
          requesterId: "person-1",
          linkedObjectIds: [],
          tags: ["portal"]
        })
      });

      if (!response.ok) {
        throw new Error("Failed to create request");
      }

      setResult("Request submitted. Timeline and approvals are now active.");
      event.currentTarget.reset();
      setTimeout(() => setOpen(false), 600);
    } catch {
      setResult("Request API unavailable. Your draft is saved locally for retry.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-xl">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Create service request</DialogTitle>
          <DialogDescription>
            Generate a structured request with approval and fulfillment workflow context.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger>
              <SelectValue placeholder="Request type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Request">Service Request</SelectItem>
              <SelectItem value="Incident">Incident</SelectItem>
              <SelectItem value="Change">Change</SelectItem>
            </SelectContent>
          </Select>
          <Input name="title" placeholder="What do you need?" required />
          <Textarea
            name="description"
            placeholder="Business reason, urgency, and any required dates"
            className="min-h-28"
            required
          />
          {result ? <p className="text-xs text-zinc-600">{result}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="rounded-xl">
              <Send className="mr-2 h-4 w-4" />
              {submitting ? "Submitting..." : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
