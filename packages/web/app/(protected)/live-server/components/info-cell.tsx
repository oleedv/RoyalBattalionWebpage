import type { ReactNode } from "react";

interface InfoCellProps {
  label: string;
  value: string;
  children?: ReactNode;
}

export function InfoCell({ label, value, children }: InfoCellProps) {
  return (
    <div className="relative min-h-[56px] overflow-hidden rounded-sm">
      {children && <div className="absolute inset-0">{children}</div>}
      <div className="relative flex h-full flex-col justify-end p-1">
        <div className="text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold text-text-primary">
          {value}
        </div>
      </div>
    </div>
  );
}
