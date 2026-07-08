"use client";

import { usePermissions } from "@/lib/permission-context";
import { ApiDocsView } from "./api-docs-view";

export default function ApiDocsPage() {
  const { hasPermission } = usePermissions();
  return <ApiDocsView canView={hasPermission("developer")} />;
}
