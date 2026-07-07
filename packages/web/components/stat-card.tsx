"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { InfoTip } from "@/components/info-tip";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  accent,
  tip,
  href,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: boolean;
  tip?: string;
  href?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const card = (
    <Card
      className={cn(
        "flex flex-row items-center justify-between gap-4 p-4",
        href && "transition-colors hover:bg-bg-card-hover",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted">
          <span>{label}</span>
          {tip && <InfoTip text={tip} label={label} />}
        </p>
        <p
          className={cn(
            "mt-1 font-mono text-xl tabular-nums",
            accent ? "text-accent" : "text-text-primary",
          )}
        >
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
      </div>
      {children}
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {card}
      </Link>
    );
  }
  return card;
}

export function StatGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="text-xs font-medium uppercase tracking-[0.15em] text-text-secondary">
        {label}
      </div>
      {children}
    </div>
  );
}
