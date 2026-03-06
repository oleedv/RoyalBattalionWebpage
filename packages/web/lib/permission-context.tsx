"use client";

import { createContext, useContext } from "react";
import type { Permission, UserWithRoles } from "shared";

interface PermissionContextValue {
  permissions: Permission[];
  apiToken: string | null;
  user: UserWithRoles | null;
  hasPermission: (perm: Permission) => boolean;
}

const PermissionContext = createContext<PermissionContextValue>({
  permissions: [],
  apiToken: null,
  user: null,
  hasPermission: () => false,
});

export function PermissionProvider({
  children,
  permissions,
  apiToken,
  user,
}: {
  children: React.ReactNode;
  permissions: Permission[];
  apiToken: string | null;
  user: UserWithRoles | null;
}) {
  function hasPermission(perm: Permission): boolean {
    return permissions.includes("developer") || permissions.includes(perm);
  }

  return (
    <PermissionContext.Provider
      value={{ permissions, apiToken, user, hasPermission }}
    >
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionContext);
}
