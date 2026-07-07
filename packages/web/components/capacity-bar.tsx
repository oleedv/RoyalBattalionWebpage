import { cn } from "@/lib/utils";

/** Server player-fill bar with a smooth width transition. */
export function CapacityBar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
      aria-label={`${value} of ${max}`}
      className={cn(
        "h-1 w-full overflow-hidden rounded-full bg-bg-tertiary",
        className,
      )}
    >
      <div
        className="h-full rounded-full bg-accent transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
