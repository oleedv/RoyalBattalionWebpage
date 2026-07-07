import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  success: "text-success border-success/40 bg-success/10",
  warning: "text-warning border-warning/40 bg-warning/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  accent: "text-accent border-border-accent bg-accent/10",
  neutral: "text-text-secondary border-border bg-bg-tertiary/50",
};

/** Domain states rendered across pages. Variant sets defaults; explicit
 * tone/pulse/children props still override. */
const VARIANTS = {
  "match-win": { tone: "success", label: "WIN" },
  "match-loss": { tone: "danger", label: "LOSS" },
  "match-draw": { tone: "neutral", label: "DRAW" },
  "server-online": { tone: "success", label: "Online", pulse: true },
  "server-offline": { tone: "neutral", label: "Offline" },
  "ticket-open": { tone: "accent", label: "Open" },
  "ticket-closed": { tone: "neutral", label: "Closed" },
  "ticket-accepted": { tone: "success", label: "Accepted" },
  "ticket-denied": { tone: "danger", label: "Denied" },
  "ticket-legacy": { tone: "warning", label: "Legacy" },
} as const satisfies Record<string, { tone: Tone; label: string; pulse?: boolean }>;

export type StatusVariant = keyof typeof VARIANTS;

export function StatusBadge({
  variant,
  tone,
  pulse,
  className,
  children,
}: {
  variant?: StatusVariant;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const v: { tone: Tone; label: string; pulse?: boolean } | undefined =
    variant ? VARIANTS[variant] : undefined;
  const resolvedTone = tone ?? v?.tone ?? "neutral";
  const resolvedPulse = pulse ?? v?.pulse ?? false;
  const content = children ?? v?.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em]",
        TONES[resolvedTone],
        className,
      )}
    >
      {resolvedPulse && (
        <span
          data-slot="pulse-dot"
          aria-hidden="true"
          className="relative flex size-1.5"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {content}
    </span>
  );
}

/** Map a match result string to its StatusBadge variant. */
export function matchResultVariant(result: string): StatusVariant {
  const r = result.toLowerCase();
  if (r === "win") return "match-win";
  if (r === "loss") return "match-loss";
  return "match-draw";
}
