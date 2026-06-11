"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActiveFilter = { key: string; label: string };

export function FilterBar({
  children,
  activeFilters,
  onClear,
  onClearAll,
  className,
}: {
  children?: React.ReactNode;
  activeFilters: ActiveFilter[];
  onClear: (key: string) => void;
  onClearAll: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
      {activeFilters.length > 0 && (
        <div role="list" className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <span
              key={f.key}
              role="listitem"
              className="inline-flex items-center gap-1 rounded-sm border border-border-accent bg-accent/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-accent"
            >
              {f.label}
              <button
                type="button"
                aria-label={`Remove filter ${f.label}`}
                onClick={() => onClear(f.key)}
                className="hover:text-text-primary"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            aria-label="Clear all filters"
            onClick={onClearAll}
            className="px-1 text-[11px] uppercase tracking-[0.08em] text-text-muted hover:text-text-primary"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
