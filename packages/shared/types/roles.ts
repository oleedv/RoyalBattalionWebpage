export const PERMISSIONS = [
  "view:whitelist",
  "manage:whitelist",
  "view:members",
  "manage:members",
  "view:tickets",
  "manage:tickets",
  "manage:roles",
  "manage:matches",
  "view:squadjs",
  "manage:squadjs",
  "view:live-server",
  "manage:live-server",
  "admin",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface DiscordRole {
  id: string;
  discordRoleId: string;
  name: string;
  permissions: Permission[];
  grantsWhitelist: boolean;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permission: Permission;
}
