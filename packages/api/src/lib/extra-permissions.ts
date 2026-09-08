import { EXTRA_GRANTABLE_PERMISSIONS, type Permission } from "shared";

export const EXTRA_GRANTABLE = EXTRA_GRANTABLE_PERMISSIONS;

export function mergePermissions(
  rolePerms: Permission[],
  extraPerms: Permission[],
): Permission[] {
  return [...new Set([...rolePerms, ...extraPerms])];
}

export function sanitizeExtraPermissions(permissions: string[]): Permission[] {
  const allowed = new Set<string>(EXTRA_GRANTABLE);
  return permissions.filter((p): p is Permission => allowed.has(p));
}
