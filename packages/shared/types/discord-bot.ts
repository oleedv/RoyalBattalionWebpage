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

export interface DiscordBotOverview {
  tickets: {
    openByTier: { normal: number; community_officer: number; admin_officer: number };
    recentlyClosed: { id: number; uuid: string; tier: string; closedAt: string }[];
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
}
