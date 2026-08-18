"use client";

import { usePermissions } from "@/lib/permission-context";
import { ApplicationsList } from "./components/ApplicationsList";

export default function ProspectsApplicationsPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canApps = hasPermission("view:prospects") || hasPermission("manage:prospects");

  if (!apiToken) return null;
  if (!canApps) return <div className="text-danger">Insufficient permissions.</div>;

  return <ApplicationsList apiToken={apiToken} />;
}
