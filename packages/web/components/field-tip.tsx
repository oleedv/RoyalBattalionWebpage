"use client";

/**
 * Wraps an immutable profile field. On hover it surfaces a hint that the value
 * can't be self-edited and a ticket is the way to correct it.
 */
export function FieldTip({ children }: { children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex cursor-help items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-bg-primary px-2 py-1 text-[10px] text-text-secondary opacity-0 shadow-lg ring-1 ring-border transition-opacity group-hover:opacity-100">
        If this is incorrect, create a community ticket.
      </span>
    </span>
  );
}
