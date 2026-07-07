"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type RosterRow = {
  id: string;
  primary: string;
  secondary?: string;
  meta?: string;
  avatarUrl?: string | null;
};

/** Scrollable people list in a Dialog with a count header (who's-online). */
export function RosterDialog({
  open,
  onOpenChange,
  title,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: RosterRow[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b border-border px-5 py-3">
          <DialogTitle className="text-sm font-semibold tracking-wide">
            {title} ({rows.length})
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y divide-border/40 overflow-y-auto">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="relative shrink-0">
                {row.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={row.avatarUrl}
                    alt={row.primary}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
                    {row.primary.charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-success ring-2 ring-bg-card"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-text-primary">
                  {row.primary}
                </div>
                {row.secondary && (
                  <div className="truncate text-xs text-text-muted">
                    {row.secondary}
                  </div>
                )}
              </div>
              {row.meta && (
                <div className="shrink-0 font-mono text-xs text-text-muted">
                  {row.meta}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
