export interface SeedingConfig {
  id: number;
  enabled: boolean;
  channelId: string | null;
  roleId: string | null;
  seedThreshold: number;
  resetThreshold: number;
  dailyTime: string | null;
  timezone: string | null;
  serverName: string | null;
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

export interface Paginated<T> {
  items: T[];
  total: number;
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
  lastHeartbeat: string;
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

export interface DiscordBotOverview {
  tickets: {
    openByTier: { normal: number; community_officer: number; admin_officer: number };
    recentlyClosed: { id: number; uuid: string; tier: string; closedAt: string; firstMessage: string | null }[];
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
