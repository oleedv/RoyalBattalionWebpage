"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function CfgDialog({
  open,
  onClose,
  content,
  activeServer,
}: {
  open: boolean;
  onClose: () => void;
  content: string;
  activeServer: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  function handleCopy() {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="flex-row items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle className="font-display text-lg font-semibold tracking-wide">
            admins.cfg ({activeServer})
          </DialogTitle>
          <Button variant="outline" size="sm" onClick={handleCopy} className="mr-6">
            {copied ? "Copied!" : "Copy"}
          </Button>
        </DialogHeader>
        <div className="max-h-[70vh] flex-1 overflow-auto p-6">
          <pre className="whitespace-pre font-mono text-xs leading-relaxed text-text-secondary">{content}</pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
