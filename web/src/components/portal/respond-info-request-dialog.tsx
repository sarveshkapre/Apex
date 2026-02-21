"use client";

import * as React from "react";
import { MessageSquareReply } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { respondToInfoRequest } from "@/lib/apex";

type Props = {
  workItemId: string;
  pendingApproverCount: number;
};

export function RespondInfoRequestDialog({ workItemId, pendingApproverCount }: Props) {
  const [open, setOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [body, setBody] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [status, setStatus] = React.useState("");

  const submit = async () => {
    if (!body.trim()) {
      setStatus("Response details are required.");
      return;
    }
    if (url.trim() && !fileName.trim()) {
      setStatus("Attachment file name is required when URL is provided.");
      return;
    }

    setSubmitting(true);
    setStatus("");
    try {
      const result = await respondToInfoRequest({
        workItemId,
        body,
        attachment: url.trim()
          ? {
              fileName: fileName.trim(),
              url: url.trim()
            }
          : undefined
      });
      setStatus(`Response submitted. Reopened ${result.reopenedApprovalIds.length} approval step(s).`);
      setTimeout(() => {
        setOpen(false);
        window.location.reload();
      }, 500);
    } catch {
      setStatus("Failed to submit response. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-lg">
          <MessageSquareReply className="mr-1.5 h-3.5 w-3.5" />
          Respond to info request ({pendingApproverCount})
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Provide additional request details</DialogTitle>
          <DialogDescription>
            Your response will be attached to this request and routed back to approvers.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="min-h-24"
            placeholder="Add business context, requested duration, and any supporting details."
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={fileName} onChange={(event) => setFileName(event.target.value)} placeholder="Attachment name (optional)" />
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Attachment URL (optional)" />
          </div>
          {status ? <p className="text-xs text-zinc-600">{status}</p> : null}
        </div>
        <DialogFooter>
          <Button className="rounded-xl" onClick={submit} disabled={submitting}>
            {submitting ? "Sending..." : "Send response"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
