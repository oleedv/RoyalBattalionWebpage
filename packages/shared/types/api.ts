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
  userId: string | null;
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

export interface PlaytimeStats {
  steamId: string;
  playtime30: number;
  playtime90: number;
  seed30: number;
  seed90: number;
}

// Personal Squad stats (dashboard) — sourced read-only from the SquadJS DB.
// "Kills" = enemies incapacitated (matches the in-game scoreboard and the
// server's Grafana convention, which counts combat on `wound` events).
export type StatWindowKey = "d7" | "d30" | "d90" | "all";

export interface PlayerStatsWindow {
  kills: number;
  deaths: number;
  kdr: number;
  teamkills: number;
  revivesGiven: number;
  revivesReceived: number;
  playtimeHours: number;
  seedHours: number;
  sessions: number;
  avgSessionMinutes: number;
  slHours: number;
  slRounds: number;
  squadsCreated: number;
  vehiclesDestroyed: number;
  fobHabHits: number;
  seedDays: number;
}

export interface PlayerStatsRecords {
  favoriteWeapon: { name: string; kills: number } | null;
  favoriteMap: { map: string; rounds: number } | null;
  bestRound: { map: string | null; date: string; kills: number } | null;
}

export interface PlayerStatsDailyPoint {
  date: string; // YYYY-MM-DD
  kills: number;
  deaths: number;
  playtimeHours: number;
}

export interface PlayerStats {
  linked: boolean; // user has a steamId linked
  hasData: boolean; // a matching SquadJS player record with activity exists
  steamId: string | null;
  playerName: string | null; // most recent in-game name on our server
  windows: Record<StatWindowKey, PlayerStatsWindow>;
  records: PlayerStatsRecords;
  daily: PlayerStatsDailyPoint[]; // last 90 days, ascending, gap-filled
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

// Seed tracker
export interface SeedTrackerLeaderboardEntry {
  steamId: string;
  name: string;
  seedDays: number;
  totalDuration: number;
  avgQuality: number;
  streak: number;
  lastSeedDate: string | null;
  isActive?: boolean;
}

export interface SeedTrackerPlayerDetail {
  steamId: string;
  name: string;
  seedDays30: number;
  seedDays90: number;
  seedDaysAll: number;
  totalDuration30: number;
  avgQuality: number;
  streak: number;
  timeOfDayDistribution: number[];
  frequencyByWeekday: number[];
  recentSessions: SeedTrackerSession[];
  whitelistStatus: {
    hasWhitelist: boolean;
    role: string | null;
    expiresAt: string | null;
  } | null;
}

export interface SeedTrackerSession {
  id: number;
  seedDate: string;
  joinTime: string;
  spawnTime: string | null;
  leaveTime: string | null;
  joinPopulation: number;
  peakPopulation: number;
  thresholdReached: boolean;
  durationSeconds: number | null;
  qualityScore: number | null;
  status: "active" | "completed" | "abandoned";
}

export interface SeedTrackerStats {
  totalSeeders: number;
  totalSeedHours: number;
  avgQuality: number;
  activeSeeders7d: number;
  currentlySeedingCount?: number;
}
