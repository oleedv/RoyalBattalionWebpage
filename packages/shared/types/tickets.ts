export interface Ticket {
  id: number;
  uuid: string;
  channelId: string;
  userId: string;
  status: "open" | "closed";
  tier: "normal" | "community_officer" | "admin_officer";
  createdAt: string;
  closedAt: string | null;
  closedBy: string | null;
  events?: TicketEvent[];
  messages?: TicketMessage[];
}

export interface TicketEvent {
  id: number;
  ticketId: number;
  eventType: "created" | "escalated" | "closed";
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
  events?: ProspectEvent[];
  messages?: ProspectMessage[];
  votes?: ProspectVote[];
}

export interface ProspectEvent {
  id: number;
  prospectId: number;
  eventType: string;
  actorId: string;
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

export interface TicketTimeout {
  id: number;
  userId: string;
  timedOutBy: string;
  expiresAt: string;
  createdAt: string;
}
