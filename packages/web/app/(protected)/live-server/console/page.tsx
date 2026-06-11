"use client";

import { usePermissions } from "@/lib/permission-context";
import { LiveServerTabs } from "../components/live-server-tabs";
import { RconConsole } from "./components/rcon-console";

export default function RconConsolePage() {
  const { apiToken, hasPermission } = usePermissions();
  const canConsole = hasPermission("manage:rcon-console");

  if (!canConsole) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  return (
    <div className="space-y-3">
      <LiveServerTabs active="console" canConsole={canConsole} />
      <RconConsole apiToken={apiToken} />
    </div>
  );
}
