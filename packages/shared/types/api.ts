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

export interface WhitelistEntry {
  id: string;
  steamId: string;
  name: string | null;
  clan: string | null;
  role: string | null;
  addedBy: string;
  reason: string | null;
  createdAt: string;
}

export interface LinkSteamRequest {
  steamId: string;
}
