"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePermissions } from "@/lib/permission-context";
import { ProspectTabs } from "./components/ProspectTabs";

export default function ProspectsLayout({ children }: { children: React.ReactNode }) {
  const { hasPermission, apiToken } = usePermissions();
  const pathname = usePathname();
  const router = useRouter();

  const canApps = hasPermission("view:prospects") || hasPermission("manage:prospects");
  const canSettings = canApps || hasPermission("view:prospect-settings");

  useEffect(() => {
    if (!apiToken) return;
    if (!canApps && canSettings && pathname !== "/prospects/settings") {
      router.replace("/prospects/settings");
    }
  }, [apiToken, canApps, canSettings, pathname, router]);

  if (!apiToken) {
    return <div className="text-text-secondary">Loading...</div>;
  }

  if (!canSettings) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-wide">Prospects</h1>
      </div>
      <ProspectTabs />
      {children}
    </div>
  );
}
