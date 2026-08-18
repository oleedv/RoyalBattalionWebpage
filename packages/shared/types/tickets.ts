export interface Ticket {
  id: number;
  uuid: string;
  channelId: string;
  userId: string;
  status: "open" | "closing" | "closed";
  tier: "normal" | "community_officer" | "admin_officer" | "comp_team" | "whitelist";
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  events?: TicketEvent[];
  messages?: TicketMessage[];
}

export interface TicketEvent {
  id: number;
  ticketId: number;
  eventType: "created" | "escalated" | "closed" | "reopened";
  actorId: string;
  detail: string | null;
  createdAt: string;
}

export interface TicketMessage {
  id: number;
  ticketId: number;
  authorId: string;
  authorTag: string;
  content: string | null;
  attachments: string | null;
  isStaff: boolean;
  createdAt: string;
}

export interface Prospect {
  id: number;
  uuid: string;
  channelId: string;
  userId: string;
  status: "open" | "closed" | "accepted" | "denied";
  alias: string;
  nationality: string;
  dateOfBirth: string;
  squadHours: number;
  preferredRoles: string;
  prevClan: string;
  whyRb: string;
  activeHours: string;
  competitive: string;
  steamId: string;
  mentorId: string | null;
  pausedAt: string | null;
  extraDays: number;
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  /** Display name for `closedBy` when it could be resolved. */
  closedByName?: string | null;
  events?: ProspectEvent[];
  messages?: ProspectMessage[];
  votes?: ProspectVote[];
  forumMessages?: ProspectForumMessage[];
}

export interface ProspectEvent {
  id: number;
  prospectId: number;
  eventType: string;
  actorId: string;
  /** Display name for `actorId` when it could be resolved. */
  actorName?: string | null;
  detail: string | null;
  createdAt: string;
}

export interface ProspectMessage {
  id: number;
  prospectId: number;
  authorId: string;
  authorTag: string;
  content: string | null;
  attachments: string | null;
  isStaff: boolean;
  createdAt: string;
}

export interface ProspectVote {
  id: number;
  prospectId: number;
  voterId: string;
  voterTag: string | null;
  vote: "yes" | "no" | "unsure";
  reason: string | null;
  createdAt: string;
}

export interface ProspectForumMessage {
  id: number;
  prospectId: number;
  messageId: string;
  authorId: string;
  authorTag: string;
  authorAvatar: string | null;
  isBot: boolean;
  content: string | null;
  attachments: string | null;
  embeds: DiscordEmbed[] | null;
  createdAt: string;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: { name: string; url?: string; icon_url?: string };
  footer?: { text: string; icon_url?: string };
  image?: { url: string };
  thumbnail?: { url: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface TicketTimeout {
  id: number;
  userId: string;
  timedOutBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface TicketSearchSnippet {
  /** Excerpt of a message body around the first keyword match. */
  text: string;
  /** Offset of the match within `text`. */
  matchStart: number;
  /** Length of the matched keyword. */
  matchLen: number;
}

/** One row in the unified (current + legacy) ticket search result. */
export interface UnifiedTicketRow {
  kind: "current" | "legacy";
  id: number;
  uuid: string;
  tier: string | null;
  status: string;
  userId: string;
  /** Legacy display name (nickname/username); null for current tickets (resolved client-side). */
  userLabel: string | null;
  createdAt: string;
  closedAt: string | null;
  threadNumber: number | null;
  anonymous: boolean;
  /** Opening reason (current) or first user message (legacy), truncated. */
  preview: string | null;
  /** Set when the keyword matched a message body. */
  snippet: TicketSearchSnippet | null;
  matchedIn: "meta" | "body";
}

export interface TicketSearchResponse {
  items: UnifiedTicketRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LegacyTicket {
  id: number;
  uuid: string;
  threadNumber: number | null;
  userId: string;
  username: string;
  nickname: string | null;
  previousThreads: number | null;
  startedAt: string;
  closedAt: string | null;
  messages?: LegacyTicketMessage[];
}

export interface LegacyTicketMessage {
  id: number;
  ticketId: number;
  type: "bot" | "from_user" | "to_user" | "bot_to_user" | "chat" | "command";
  author: string | null;
  content: string | null;
  createdAt: string;
}
