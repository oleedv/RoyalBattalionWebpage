"use client";

import { usePermissions } from "@/lib/permission-context";
import { AuditLogsView, defaultApi } from "./audit-logs-view";

export default function AuditLogsPage() {
  const { apiToken, hasPermission } = usePermissions();
  return (
    <AuditLogsView
      token={apiToken}
      canDelete={hasPermission("developer")}
      api={defaultApi}
    />
  );
}
