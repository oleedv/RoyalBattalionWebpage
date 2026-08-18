"use client";

import { usePermissions } from "@/lib/permission-context";
import { SettingsCard } from "../components/SettingsCard";
import { CooldownList } from "../components/CooldownList";

export default function ProspectsSettingsPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canView =
    hasPermission("view:prospects") ||
    hasPermission("view:prospect-settings") ||
    hasPermission("manage:prospects");

  if (!apiToken) return null;
  if (!canView) return <div className="text-danger">Insufficient permissions.</div>;

  const canManage = hasPermission("manage:prospects");

  return (
    <div className="space-y-8">
      <SettingsCard apiToken={apiToken} canManage={canManage} />
      <CooldownList apiToken={apiToken} canManage={canManage} />
    </div>
  );
}
