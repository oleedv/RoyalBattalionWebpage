"use client";
import { usePermissions } from "@/lib/permission-context";
import { RolesView } from "./roles-view";

export default function RolesPage() {
  const { apiToken, permissions } = usePermissions();
  if (!apiToken) return null;
  return <RolesView token={apiToken} permissions={permissions as string[]} />;
}
