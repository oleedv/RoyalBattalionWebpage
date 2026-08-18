"use client";

import { usePermissions } from "@/lib/permission-context";
import { MentorView } from "../components/MentorView";

export default function ProspectsMentorsPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canApps = hasPermission("view:prospects") || hasPermission("manage:prospects");

  if (!apiToken) return null;
  if (!canApps) return <div className="text-danger">Insufficient permissions.</div>;

  return <MentorView apiToken={apiToken} canManage={hasPermission("manage:prospects")} />;
}
