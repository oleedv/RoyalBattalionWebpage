"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/lib/permission-context";

const TABS = [
  { href: "/prospects", label: "Applications", apps: true },
  { href: "/prospects/mentors", label: "Mentors", apps: true },
  { href: "/prospects/settings", label: "Settings", apps: false },
] as const;

export function ProspectTabs() {
  const pathname = usePathname();
  const { hasPermission } = usePermissions();
  const canApps = hasPermission("view:prospects") || hasPermission("manage:prospects");
  const canSettings =
    canApps || hasPermission("view:prospect-settings");

  const visible = TABS.filter((t) => (t.apps ? canApps : canSettings));

  return (
    <div className="mb-6 flex gap-1 rounded-sm border border-border bg-bg-tertiary/50 p-1">
      {visible.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 rounded-sm px-4 py-2 text-center text-sm font-medium tracking-wide transition-colors ${
              active
                ? "bg-bg-card text-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
