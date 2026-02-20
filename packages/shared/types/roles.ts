export const PERMISSIONS = [
  "view:whitelist",
  "manage:whitelist",
  "view:members",
  "manage:members",
  "manage:roles",
  "admin",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface DiscordRole {
  id: string;
  discordRoleId: string;
  name: string;
  permissions: Permission[];
}

export interface RolePermission {
  id: string;
  roleId: string;
  permission: Permission;
}
