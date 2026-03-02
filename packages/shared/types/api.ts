import type { Permission } from "./roles";
import type { UserWithRoles } from "./user";

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthSyncRequest {
  accessToken: string;
}

export interface AuthSyncResponse {
  token: string;
  user: UserWithRoles;
  permissions: Permission[];
}

export interface AuthMeResponse {
  user: UserWithRoles;
  permissions: Permission[];
}

export interface AdminGroup {
  id: string;
  name: string;
  permissions: string;
  sortOrder: number;
  createdAt: string;
}

export interface Clan {
  id: string;
  name: string;
  tag: string;
  createdAt: string;
}

export interface WhitelistEntry {
  id: string;
  steamId: string;
  server: string;
  name: string | null;
  clan: string | null;
  clanId: string | null;
  clanName: string | null;
  role: string | null;
  groupId: string | null;
  groupName: string | null;
  addedBy: string;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ServerConfig {
  id: string;
  server: string;
  label: string;
  sftpHost: string | null;
  sftpPort: number;
  sftpUser: string | null;
  sftpPass: string | null;
  sftpPath: string | null;
  syncEnabled: boolean;
}

export interface WhitelistComment {
  id: string;
  whitelistEntryId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string;
}

export interface WhitelistEntryWithComments extends WhitelistEntry {
  comments: WhitelistComment[];
  addedByName: string | null;
}

export interface WhitelistCandidate {
  userId: string;
  discordName: string;
  steamId: string;
  roleName: string;
}

export interface LinkSteamRequest {
  steamId: string;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  resource: string;
  resourceId: string | null;
  detail: Record<string, unknown> | null;
  createdAt: string;
}

// SquadJS plugin config
export type SquadJSPluginOptionValue =
  | string
  | number
  | boolean
  | null
  | SquadJSPluginOptionValue[]
  | { [key: string]: SquadJSPluginOptionValue };

export interface SquadJSPlugin {
  plugin: string;
  enabled: boolean;
  [key: string]: SquadJSPluginOptionValue;
}
