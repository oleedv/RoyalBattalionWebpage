import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  success: "text-success border-success/40 bg-success/10",
  warning: "text-warning border-warning/40 bg-warning/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  accent: "text-accent border-border-accent bg-accent/10",
  neutral: "text-text-secondary border-border bg-bg-tertiary/50",
};

export function StatusBadge({
  tone = "neutral",
  pulse = false,
  className,
  children,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em]",
        TONES[tone],
        className,
      )}
    >
      {pulse && (
        <span
          data-slot="pulse-dot"
          aria-hidden="true"
          className="relative flex size-1.5"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
