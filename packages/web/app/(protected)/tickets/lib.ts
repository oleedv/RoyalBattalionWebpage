import type { Ticket, LegacyTicket, Prospect, Permission } from "shared";

export function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export function exportTicketText(ticket: Ticket) {
  const lines: string[] = [];
  lines.push(`Ticket #${ticket.id} [${ticket.status}] - ${ticket.tier}`);
  lines.push(`User: ${ticket.userId}`);
  lines.push(`Created: ${fmtDate(ticket.createdAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${fmtDate(ticket.closedAt)}${ticket.closedBy ? ` by ${ticket.closedBy}` : ""}`);
  lines.push(`UUID: ${ticket.uuid}`);

  if (ticket.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of ticket.events) {
      lines.push(`[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
    }
  }

  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages) {
      const staff = m.isStaff ? " [STAFF]" : "";
      lines.push(`[${fmtDate(m.createdAt)}] ${m.authorTag}${staff}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

export function exportLegacyTicketText(ticket: LegacyTicket) {
  const lines: string[] = [];
  lines.push(`Legacy Ticket #${ticket.id} [closed]`);
  lines.push(`User: ${ticket.nickname || ticket.username} (${ticket.userId})`);
  if (ticket.threadNumber) lines.push(`Thread: #${ticket.threadNumber}`);
  lines.push(`Started: ${fmtDate(ticket.startedAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${fmtDate(ticket.closedAt)}`);
  lines.push(`UUID: ${ticket.uuid}`);

  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages) {
      lines.push(`[${fmtDate(m.createdAt)}] [${m.type}] ${m.author || "System"}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

export function exportProspectText(prospect: Prospect) {
  const lines: string[] = [];
  lines.push(`Prospect: ${prospect.alias} [${prospect.status}]`);
  lines.push(`User: ${prospect.userId}`);
  lines.push(`Nationality: ${prospect.nationality}`);
  lines.push(`Date of Birth: ${prospect.dateOfBirth}`);
  lines.push(`Squad Hours: ${prospect.squadHours}h`);
  lines.push(`Preferred Roles: ${prospect.preferredRoles}`);
  lines.push(`Previous Clan: ${prospect.prevClan || "--"}`);
  lines.push(`Active Hours: ${prospect.activeHours}`);
  lines.push(`Competitive: ${prospect.competitive}`);
  lines.push(`Steam ID: ${prospect.steamId}`);
  if (prospect.mentorId) lines.push(`Mentor: ${prospect.mentorId}`);
  lines.push(`Created: ${fmtDate(prospect.createdAt)}`);
  if (prospect.closedAt) lines.push(`Closed: ${fmtDate(prospect.closedAt)}${prospect.closedBy ? ` by ${prospect.closedBy}` : ""}`);
  lines.push(`UUID: ${prospect.uuid}`);
  lines.push("", `--- Why Royal Battalion? ---`, prospect.whyRb);

  if (prospect.votes?.length) {
    lines.push("", "--- Votes ---");
    for (const v of prospect.votes) {
      lines.push(`[${fmtDate(v.createdAt)}] ${v.voterTag || v.voterId}: ${v.vote}${v.reason ? ` -- ${v.reason}` : ""}`);
    }
  }

  if (prospect.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of prospect.events) {
      lines.push(`[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
    }
  }

  if (prospect.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of prospect.messages) {
      const staff = m.isStaff ? " [STAFF]" : "";
      lines.push(`[${fmtDate(m.createdAt)}] ${m.authorTag}${staff}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

export function parseAttachments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((u: unknown) => typeof u === "string");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u: unknown) => typeof u === "string");
  } catch {
    // Not JSON, try comma-separated
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("cdn.discordapp.com");
}

export const ALL_TIERS = ["normal", "community_officer", "admin_officer", "comp_team", "whitelist"] as const;

export const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  community_officer: "Community Officer",
  admin_officer: "Admin Officer",
  comp_team: "Comp Team",
  whitelist: "Whitelist",
};

/** Tier -> token text color (tokenized: blue-400 -> team-one, emerald-400 -> success). */
export const TIER_COLORS: Record<string, string> = {
  normal: "text-text-secondary",
  community_officer: "text-accent",
  admin_officer: "text-danger",
  comp_team: "text-team-one",
  whitelist: "text-success",
};

export function getVisibleTiers(permissions: Permission[]): string[] {
  if (
    permissions.includes("developer") ||
    permissions.includes("view:tickets") ||
    permissions.includes("manage:tickets")
  ) {
    return [...ALL_TIERS];
  }
  const tiers: string[] = [];
  if (permissions.includes("view:tickets:normal")) tiers.push("normal");
  if (permissions.includes("view:tickets:community_officer")) tiers.push("community_officer");
  if (permissions.includes("view:tickets:admin_officer")) tiers.push("admin_officer");
  if (permissions.includes("view:tickets:comp_team")) tiers.push("comp_team");
  if (permissions.includes("view:tickets:whitelist")) tiers.push("whitelist");
  return tiers;
}

export const LEGACY_MSG_STYLES: Record<string, { border: string; bg: string; label: string; labelColor: string }> = {
  from_user: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "User", labelColor: "bg-team-one/15 text-team-one" },
  chat: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "Chat", labelColor: "bg-team-one/15 text-team-one" },
  to_user: { border: "border-accent/20", bg: "bg-accent/5", label: "Staff", labelColor: "bg-accent/15 text-accent" },
  command: { border: "border-accent/20", bg: "bg-accent/5", label: "Command", labelColor: "bg-accent/15 text-accent" },
  bot: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
  bot_to_user: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
};
