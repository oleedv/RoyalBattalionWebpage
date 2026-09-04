export interface BirthdayConfig {
  enabled: boolean;
  channelId: string | null;
  postTime: string; // "HH:MM" 24h
  timezone: string;
}

export interface SeedingConfig {
  id: number;
  enabled: boolean;
  channelId: string | null;
  roleIds: string[];
  seedThreshold: number;
  dailyTime: string | null;
  timezone: string | null;
  announcerServerId: number | null;
  trackerServerId: number | null;
  trackerEnabled: boolean;
  requiredSeedDays: number;
  rollingWindowDays: number;
  whitelistDurationDays: number;
  maxExtensionDays: number;
  progressionChannelId: string | null;
  leaderboardChannelId: string | null;
  appreciationChannelId: string | null;
  minProgressionDays: number;
}

export interface SeedingLiveStatus {
  serverResolvedOk: boolean;
  socketConnected: boolean;
  currentPopulation: number | null;
  currentLayer: string | null;
  activeSessionId: number | null;
  updatedAt: string | null;
}

export interface SquadServerOption {
  id: number;
  name: string;
}

export interface SeedingSession {
  id: number;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  startPlayers: number | null;
  peakPlayers: number | null;
  endPlayers: number | null;
  mapName: string | null;
  layerName: string | null;
  status: "active" | "completed" | "reset" | "expired";
  callMessageId: string | null;
  completionMessageId: string | null;
}

export interface SeedingRapportSeeder {
  playerName: string;
  steamId: string | null;
  joinTime: string | null;
  leaveTime: string | null;
  seedDurationMinutes: number | null;
  sessionDurationMinutes: number | null;
}

export interface SeedingRapport {
  date: string;
  totalSeeders: number;
  totalJoins: number;
  avgSeedMinutes: number;
  totalSeedMinutes: number;
  seeders: SeedingRapportSeeder[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasNext: boolean;
}

export interface BotMessage {
  id: number;
  messageId: string;
  channelId: string;
  channelName: string | null;
  guildId: string | null;
  authorId: string;
  authorTag: string;
  content: string | null;
  attachments: unknown[] | null;
  isDm: boolean;
  direction: "incoming" | "outgoing";
  createdAt: string;
  parentChannelId?: string | null;
  parentChannelName?: string | null;
  threadId?: string | null;
  threadName?: string | null;
  replyToMessageId?: string | null;
  replyToTag?: string | null;
  replyToContent?: string | null;
}

export interface BotLog {
  id: number;
  level: number;
  levelLabel: string;
  module: string | null;
  message: string;
  data: unknown | null;
  createdAt: string;
}

export interface BotStatus {
  status: "online" | "offline" | "starting";
  uptimeSeconds: number;
  guildCount: number;
  memberCount: number;
  latencyMs: number;
  dbConnected: boolean;
  squadjsConnected: boolean;
  seedingSchedulerActive: boolean;
  prospectSchedulerActive: boolean;
  lastHeartbeat: string | null;
  startedAt: string | null;
}

export interface MentorProspect {
  id: number;
  uuid: string;
  userId: string;
  alias: string;
  nationality: string;
  squadHours: number;
  preferredRoles: string;
  steamId: string;
  mentorId: string | null;
  pausedAt: string | null;
  extraDays: number;
  createdAt: string;
}

export interface MentorGroup {
  mentorId: string | null;
  prospects: MentorProspect[];
}

export type TempVoiceEventType =
  | "created"
  | "deleted"
  | "renamed"
  | "privacy"
  | "dnd"
  | "region"
  | "bitrate"
  | "limit"
  | "trust"
  | "untrust"
  | "block"
  | "unblock"
  | "invite"
  | "kick"
  | "transfer"
  | "claim"
  | "blocked_name"
  | "config"
  | "preset"
  | "other";

export type TempVoiceManageOp =
  | "rename"
  | "limit"
  | "lock"
  | "unlock"
  | "invisible"
  | "visible"
  | "closechat"
  | "openchat"
  | "dnd"
  | "bitrate"
  | "region"
  | "delete"
  | "transfer"
  | "kick";

export interface TempVoiceConfig {
  triggerChannelId: string | null;
  categoryId: string | null;
  logChannelId: string | null;
  maxChannelsPerUser: number;
  defaultAllowVad: boolean;
  guildId: string | null;
}

export interface TempVoiceChannel {
  id: number;
  channelId: string;
  ownerId: string;
  guildId: string;
  panelMessageId: string | null;
  name: string;
  userLimit: number;
  bitrate: number | null;
  region: string | null;
  isLocked: boolean;
  isInvisible: boolean;
  isChatClosed: boolean;
  isDnd: boolean;
  memberCount: number;
  memberIds: string[];
  trustedIds: string[];
  blockedIds: string[];
  createdAt: string;
  lastActivity: string;
  snapshotAt: string | null;
}

export interface TempVoiceStats {
  activeChannels: number;
  peopleInVoice: number;
  lockedChannels: number;
  invisibleChannels: number;
  dndChannels: number;
  createdToday: number;
  deletedToday: number;
  uniqueOwners: number;
  oldestCreatedAt: string | null;
  hourlyCreated: number[];
}

export interface TempVoiceOverview {
  config: TempVoiceConfig | null;
  stats: TempVoiceStats;
  channels: TempVoiceChannel[];
}

export interface TempVoiceEvent {
  id: number;
  eventType: TempVoiceEventType;
  channelId: string | null;
  channelName: string | null;
  actorId: string | null;
  ownerId: string | null;
  details: unknown;
  createdAt: string;
}

export interface TempVoicePreset {
  userId: string;
  guildId: string;
  channelName: string | null;
  bitrate: number | null;
  region: string | null;
  userLimit: number | null;
  isLocked: boolean;
  isInvisible: boolean;
  isChatClosed: boolean;
  isDnd: boolean;
  updatedAt: string;
}

export interface TempVoicePresetPatch {
  channelName?: string | null;
  bitrate?: number | null;
  region?: string | null;
  userLimit?: number | null;
  isLocked?: boolean;
  isInvisible?: boolean;
  isChatClosed?: boolean;
  isDnd?: boolean;
  /** When true (default), also queue Discord changes if this user has a live temp channel. */
  applyLive?: boolean;
}

export interface DiscordBotOverview {
  tickets: {
    openByTier: { normal: number; community_officer: number; admin_officer: number };
    recentlyClosed: { id: number; uuid: string; tier: string; closedAt: string | null; firstMessage: string | null }[];
  };
  prospects: {
    open: number;
    accepted: number;
    denied: number;
    recentActivity: { id: number; alias: string; status: string; createdAt: string }[];
  };
  seeding: {
    activeSession: SeedingSession | null;
    recentSessions: SeedingSession[];
    config: { enabled: boolean; seedThreshold: number } | null;
  };
  botStatus: BotStatus | null;
}
