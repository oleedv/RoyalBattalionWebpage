"use client";

import type { SquadJSPlugin } from "shared";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";

interface ConfigDiffDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  original: SquadJSPlugin[];
  updated: SquadJSPlugin[];
  environment: string;
  onConfirm: () => void;
  saving: boolean;
  saveError: string | null;
}

export function ConfigDiffDialog({
  open,
  onOpenChange,
  original,
  updated,
  environment,
  onConfirm,
  saving,
  saveError,
}: ConfigDiffDialogProps) {
  const changedPlugins = updated
    .filter((p, i) => JSON.stringify(p) !== JSON.stringify(original[i]))
    .map((p) => p.plugin);

  const diffEntries = changedPlugins.map((name) => {
    const origIdx = original.findIndex((p) => p.plugin === name);
    const updIdx = updated.findIndex((p) => p.plugin === name);
    return {
      name,
      before: origIdx >= 0 ? JSON.stringify(original[origIdx], null, 2) : "",
      after: updIdx >= 0 ? JSON.stringify(updated[updIdx], null, 2) : "",
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-w-5xl sm:max-w-5xl flex-col gap-0 p-0"
      >
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-display text-lg font-semibold tracking-wide">
            Review Changes
          </DialogTitle>
          <p className="mt-0.5 text-xs text-text-secondary">
            <span className="capitalize">{environment}</span> --{" "}
            {changedPlugins.length} plugin
            {changedPlugins.length !== 1 ? "s" : ""} modified:{" "}
            {changedPlugins.join(", ")}
          </p>
        </DialogHeader>

        {/* Deploy notice */}
        <div className="border-b border-accent/20 bg-accent/5 px-6 py-3 text-xs text-accent">
          This will commit to the <strong>main</strong> branch and trigger
          CI/CD deployment for{" "}
          <strong className="capitalize">{environment}</strong>.
        </div>

        {/* Diff view */}
        <div className="max-h-[90vh] overflow-auto px-6 py-4">
          {diffEntries.map((entry) => (
            <div key={entry.name} className="mb-6">
              <h3 className="mb-2 font-display text-sm font-semibold tracking-wide text-text-primary">
                {entry.name}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                    Before
                  </p>
                  <pre className="rounded-sm border border-border bg-bg-tertiary p-3 font-mono text-xs text-text-secondary whitespace-pre-wrap">
                    {entry.before}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                    After
                  </p>
                  <pre className="rounded-sm border border-accent/20 bg-bg-tertiary p-3 font-mono text-xs text-text-primary whitespace-pre-wrap">
                    {entry.after}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>

        {saveError && (
          <div className="border-t border-danger/20 bg-danger/5 px-6 py-3 text-xs text-danger">
            {saveError}
          </div>
        )}

        <DialogFooter className="mx-0 mb-0 border-t border-border bg-transparent px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="gold" onClick={onConfirm} disabled={saving}>
            {saving ? "Committing..." : "Commit & Deploy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
