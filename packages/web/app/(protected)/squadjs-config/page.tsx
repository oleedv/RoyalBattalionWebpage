"use client";

import { usePermissions } from "@/lib/permission-context";
import { SquadJSConfigView } from "./squadjs-config-view";

export default function SquadJSConfigPage() {
  const { apiToken, permissions } = usePermissions();
  if (!apiToken) return null;
  return (
    <SquadJSConfigView token={apiToken} permissions={permissions as string[]} />
  );
}
