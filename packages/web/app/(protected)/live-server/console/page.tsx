"use client";

import { usePermissions } from "@/lib/permission-context";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { LiveServerTabs } from "../components/live-server-tabs";
import { RconConsole } from "./components/rcon-console";

export default function RconConsolePage() {
  const { apiToken, hasPermission } = usePermissions();
  const canConsole = hasPermission("manage:rcon-console");
  const canMonitor =
    hasPermission("view:live-server") || hasPermission("manage:live-server");

  return (
    <div className="space-y-3">
      <LiveServerTabs active="console" canConsole={canConsole} />
      {canConsole ? (
        <RconConsole apiToken={apiToken} />
      ) : (
        <AccessDeniedCard
          message="You do not have access to the RCON console."
          cta={canMonitor ? { href: "/live-server", label: "Open Live Server Monitor" } : undefined}
        />
      )}
    </div>
  );
}
