import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-row items-center justify-between gap-4 p-4", className)}>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted">
          {label}
        </p>
        <p className="mt-1 font-mono text-xl tabular-nums text-text-primary">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}
