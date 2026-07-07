"use client";

import { cn } from "@/lib/utils";

const TONE_DOT: Record<"success" | "warning" | "danger", string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

/** Pulsing connection dot + label, shared by Live Server Monitor and Console. */
export function ConnectionStatus({
  tone,
  label,
  active,
  className,
}: {
  tone: "success" | "warning" | "danger";
  label: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span
        data-slot="status-dot"
        aria-hidden="true"
        className={cn(
          "h-2 w-2 rounded-full transition-all duration-150",
          TONE_DOT[tone],
          active && "scale-150 brightness-150",
        )}
      />
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}

/** Active-server switcher, shared by Live Server Monitor (tabs) and Console (select). */
export function ServerScope({
  servers,
  active,
  onSwitch,
  variant = "select",
  className,
}: {
  servers: string[];
  active: string;
  onSwitch: (key: string) => void;
  variant?: "select" | "tabs";
  className?: string;
}) {
  if (servers.length <= 1) return null;

  if (variant === "tabs") {
    return (
      <div className={cn("flex gap-1 border-b border-border", className)}>
        {servers.map((key) => (
          <button
            key={key}
            onClick={() => onSwitch(key)}
            className={cn(
              "relative px-5 py-2.5 text-sm font-medium capitalize tracking-wide transition-colors",
              active === key ? "text-accent" : "text-text-muted hover:text-text-secondary",
            )}
          >
            {key}
            {active === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      aria-label="Active server"
      value={active}
      onChange={(e) => onSwitch(e.target.value)}
      className={cn(
        "rounded-sm border border-border bg-bg-primary px-2 py-1 text-[11px] text-text-primary outline-none focus:border-accent",
        className,
      )}
    >
      {servers.map((key) => (
        <option key={key} value={key}>
          {key}
        </option>
      ))}
    </select>
  );
}
