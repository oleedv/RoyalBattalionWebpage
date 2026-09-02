export const PERMISSIONS = [
  "view:whitelist",
  "manage:whitelist",
  "view:members",
  "manage:members",
  "view:tickets",
  "manage:tickets",
  "view:prospects",
  "view:prospect-settings",
  "manage:prospects",
  "manage:roles",
  "manage:matches",
  "view:squadjs",
  "manage:squadjs",
  "view:live-server",
  "manage:live-server",
  "manage:whitelist-sync",
  "view:discord-bot",
  "manage:discord-bot",
  "view:tickets:normal",
  "view:tickets:community_officer",
  "view:tickets:admin_officer",
  "view:tickets:comp_team",
  "view:tickets:whitelist",
  "view:audit-logs",
  "view:seeding-tracker",
  "view:giveaway",
  "manage:giveaway",
  "manage:giveaway-tickets",
  "view:api-docs",
  "manage:clan-move",
  "manage:randomize",
  "manage:balance-teams",
  "manage:rcon-console",
  "developer",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface DiscordRole {
  id: string;
  discordRoleId: string;
  name: string;
  permissions: Permission[];
  grantsWhitelist: boolean;
  isMemberRole: boolean;
  memberCount: number;
}

export interface RoleMember {
  id: string;
  discordId: string;
  discordName: string;
  displayName: string | null;
  avatarUrl: string | null;
  hasLoggedIn: boolean;
  disabled: boolean;
}

export interface RolePermission {
  id: string;
  roleId: string;
  permission: Permission;
}
