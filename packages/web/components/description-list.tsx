import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Uppercase micro-label + value grid used in detail panels. */
export function DescriptionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </dl>
  );
}

export function InfoField({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm text-text-primary",
          mono && "font-mono text-xs tabular-nums text-text-secondary",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
