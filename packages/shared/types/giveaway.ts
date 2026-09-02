export type GiveawayStatus = "open" | "voting" | "drawn" | "cancelled";

export interface GiveawayRules {
  windowDays: number;
  minHours: number;
  hoursWeight: number;
  seedWeight: number;
  voteWeight: number;
  votesPerVoter: number;
}

export interface GiveawayConfig extends GiveawayRules {
  defaultEntryChannelId: string | null;
  defaultVoteChannelId: string | null;
}

export interface GiveawayRecord {
  id: number;
  prize: string;
  monthLabel: string;
  scope: "rb_only" | "community";
  status: GiveawayStatus;
  drawAt: string;
  windowDays: number;
  minHours: number;
  hoursWeight: number;
  seedWeight: number;
  voteWeight: number;
  votesPerVoter: number;
  entryChannelId: string | null;
  entryMessageId: string | null;
  voteChannelId: string | null;
  voteMessageId: string | null;
  winnerUserId: string | null;
  createdBy: string;
  createdAt: string;
  drawnAt: string | null;
}

export interface GiveawayLeaderboardRow {
  userId: string;
  steamId: string | null;
  manual: boolean;
  hours: number;
  seed: number;
  votes: number;
  tickets: number;
  bonusTickets: number;
  enteredAt: string | null;
}

export interface GiveawayVoteEvent {
  voterId: string;
  targetId: string;
  createdAt: string;
}

export interface GiveawaySnapshot {
  giveaway: GiveawayRecord;
  leaderboard: GiveawayLeaderboardRow[];
  votes: GiveawayVoteEvent[];
  totalTickets: number;
  votesCast: number;
}

export interface GiveawayHistoryItem {
  id: number;
  prize: string;
  monthLabel: string;
  status: GiveawayStatus;
  drawAt: string;
  winnerUserId: string | null;
  entryCount: number;
  createdAt: string;
  drawnAt: string | null;
}

export interface GiveawayStartRequest {
  prize: string;
  monthLabel?: string;
  drawAt?: string;
  entryChannelId?: string;
  windowDays?: number;
  minHours?: number;
  hoursWeight?: number;
  seedWeight?: number;
  voteWeight?: number;
  votesPerVoter?: number;
}

export interface GiveawayAddEntryRequest {
  userId: string;
  hours: number;
  seed: number;
}

export interface GiveawayAdjustTicketsRequest {
  userId: string;
  delta: number;
}
