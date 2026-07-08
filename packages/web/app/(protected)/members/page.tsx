"use client";

import { usePermissions } from "@/lib/permission-context";
import { MembersView, defaultApi } from "./members-view";

export default function MembersPage() {
  const { apiToken, permissions } = usePermissions();
  if (!apiToken) return null;
  return (
    <MembersView
      token={apiToken}
      permissions={permissions as string[]}
    />
  );
}
