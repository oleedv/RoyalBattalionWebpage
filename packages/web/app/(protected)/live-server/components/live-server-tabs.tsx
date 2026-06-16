"use client";

import Link from "next/link";

export function LiveServerTabs({
  active,
  canConsole,
}: {
  active: "monitor" | "console";
  canConsole: boolean;
}) {
  const tab = (href: string, label: string, key: "monitor" | "console") => (
    <Link
      href={href}
      className={`rounded-sm px-3 py-1.5 text-xs font-medium transition-colors ${
        active === key ? "bg-accent/15 text-accent" : "text-text-muted hover:text-text-primary"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex gap-1 border-b border-border pb-2">
      {tab("/live-server", "Monitor", "monitor")}
      {canConsole && tab("/live-server/console", "Console", "console")}
    </div>
  );
}
