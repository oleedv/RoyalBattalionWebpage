import type { AuditLogEntry } from "shared";
import {
  formatAuditSource,
  formatWhitelistActionSummary,
} from "./whitelist-audit-detail";

export type AuditInspectContext = {
  groups?: { id: string; name: string }[];
  clans?: { id: string; name: string; tag?: string }[];
};

export type AuditPerson = {
  label: string;
  name: string;
  id?: string;
};

export type AuditField = {
  key: string;
  label: string;
  value: string;
  filterValue?: string;
  copyable?: boolean;
};

export type AuditChange = {
  key: string;
  label: string;
  from?: string;
  to: string;
};

export type AuditInspection = {
  summary: string;
  actionLabel: string;
  actorName: string;
  actorId: string;
  resource: string;
  resourceLabel: string;
  resourceId: string | null;
  createdAt: string;
  people: AuditPerson[];
  fields: AuditField[];
  changes: AuditChange[];
};

const FIELD_LABELS: Record<string, string> = {
  steamId: "Steam ID",
  steamIds: "Steam IDs",
  eosId: "EOS ID",
  playerId: "Player ID",
  playerName: "Player",
  playerNames: "Players",
  name: "Name",
  names: "Names",
  targetName: "Target",
  discordName: "Discord name",
  discordId: "Discord ID",
  discordRoleId: "Discord role ID",
  userId: "User ID",
  authorName: "Author",
  displayName: "Display name",
  originalRequester: "Original requester",
  alias: "Alias",
  clan: "Clan",
  clanId: "Clan",
  clanTag: "Clan tag",
  role: "Role",
  groupId: "Group",
  reason: "Reason",
  message: "Message",
  command: "Command",
  expiresAt: "Expires",
  server: "Server",
  layer: "Layer",
  map: "Map",
  playerCount: "Players online",
  count: "Count",
  created: "Created",
  skipped: "Skipped",
  total: "Total",
  textPreview: "Comment",
  commentId: "Comment ID",
  source: "Source",
  triggeredBy: "Triggered by",
  permissions: "Permissions",
  isMemberRole: "Member role",
  grantsWhitelist: "Grants whitelist",
  environment: "Environment",
  plugins: "Plugins",
  prize: "Prize",
  status: "Status",
  monthLabel: "Month",
  entryChannelId: "Entry channel",
  channelId: "Channel",
  date: "Date",
  days: "Days",
  hours: "Hours",
  mentorId: "Mentor ID",
  banLength: "Ban length",
  teamID: "Team",
  squadID: "Squad",
  targetTeam: "Target team",
  mode: "Mode",
  syncEnabled: "Sync enabled",
  label: "Label",
  tag: "Tag",
  result: "Result",
  resynced: "Resynced",
  queued: "Queued",
  delta: "Ticket delta",
  bonusTickets: "Bonus tickets",
  previousBonus: "Previous bonus",
  previousMentorId: "Previous mentor",
  timedOutBy: "Timed out by",
  createdBy: "Created by",
  playerIds: "Player IDs",
  error: "Error",
  team1Count: "Team 1",
  team2Count: "Team 2",
  playersMoved: "Players moved",
  changes: "Changes",
};

const COPYABLE_KEYS = new Set([
  "steamId",
  "steamIds",
  "eosId",
  "playerId",
  "discordId",
  "discordRoleId",
  "userId",
  "commentId",
  "channelId",
  "entryChannelId",
  "mentorId",
  "clanId",
]);

const NAME_KEYS: { key: string; label: string }[] = [
  { key: "playerName", label: "Player" },
  { key: "targetName", label: "Target" },
  { key: "discordName", label: "Discord" },
  { key: "authorName", label: "Author" },
  { key: "displayName", label: "Display name" },
  { key: "originalRequester", label: "Original requester" },
  { key: "alias", label: "Alias" },
  { key: "name", label: "Name" },
];

const NAME_LIST_KEYS: { key: string; label: string }[] = [
  { key: "playerNames", label: "Player" },
  { key: "names", label: "Name" },
];

const RESOURCE_LABELS: Record<string, string> = {
  WhitelistEntry: "Whitelist entry",
  DiscordRole: "Discord role",
  user: "Member",
  admin_group: "Admin group",
  clan: "Clan",
  server_config: "Server config",
  match: "Match",
  SquadJSConfig: "SquadJS config",
  discord_bot: "Discord bot",
  prospect: "Prospect",
  LiveServer: "Live server",
  giveaway: "Giveaway",
  seeding: "Seeding",
  ticket_timeout: "Ticket timeout",
};

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asString(v)).filter(Boolean);
}

export function formatActionLabel(action: string): string {
  return action.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatResourceLabel(resource: string): string {
  return RESOURCE_LABELS[resource] ?? resource.replace(/_/g, " ");
}

export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function looksLikeIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}(T[\d:.+-Z]*)?$/.test(value);
}

export function formatFieldValue(
  key: string,
  value: unknown,
  ctx: AuditInspectContext = {},
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "source") {
    const mapped = formatAuditSource(value);
    if (mapped) return mapped;
  }
  if (key === "groupId" && ctx.groups) {
    const found = ctx.groups.find((g) => g.id === value);
    if (found) return found.name;
  }
  if (key === "clanId" && ctx.clans) {
    const found = ctx.clans.find((c) => c.id === value);
    if (found) return found.tag ? `[${found.tag}] ${found.name}` : found.name;
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  if (typeof value === "string") {
    if (looksLikeIsoDate(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .map((item) => (typeof item === "object" ? JSON.stringify(item) : String(item)))
      .join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function quote(value: unknown): string | null {
  const s = asString(value);
  return s ? `"${s}"` : null;
}

function withTarget(prefix: string, detail: Record<string, unknown>, extra?: string | null): string {
  const who =
    asString(detail.playerName) ||
    asString(detail.targetName) ||
    asString(detail.discordName) ||
    asString(detail.name) ||
    asString(detail.alias);
  const base = who ? `${prefix} ${who}` : prefix;
  return extra ? `${base} · ${extra}` : base;
}

function listWho(detail: Record<string, unknown>): string | null {
  const names = stringList(detail.playerNames).length
    ? stringList(detail.playerNames)
    : stringList(detail.names);
  if (names.length === 0) return null;
  const shown = names.slice(0, 4).join(", ");
  return names.length > 4 ? `${shown} · +${names.length - 4} more` : shown;
}

export function formatAuditSummary(
  action: string,
  detail: Record<string, unknown> | null | undefined,
): string {
  const d = detail ?? {};
  if (action.startsWith("whitelist.")) {
    return formatWhitelistActionSummary(action, d);
  }

  switch (action) {
    case "rcon.warn":
      return withTarget("Warned", d, quote(d.message));
    case "rcon.kick":
      return withTarget("Kicked", d, asString(d.reason) || null);
    case "rcon.ban":
      return withTarget(
        "Banned",
        d,
        [asString(d.banLength), asString(d.reason)].filter(Boolean).join(" · ") || null,
      );
    case "rcon.switchteam": {
      const who = asString(d.playerName) || asString(d.name);
      return who ? `Moved ${who} to the other team` : "Moved a player to the other team";
    }
    case "rcon.switchsquad":
      return d.count
        ? `Moved ${d.count} players${listWho(d) ? ` (${listWho(d)})` : ""}`
        : "Moved players between teams";
    case "rcon.switchclan":
      return `Moved ${d.count || 0} clan members${d.clanTag ? ` [${d.clanTag}]` : ""}${listWho(d) ? ` (${listWho(d)})` : ""} to team ${d.targetTeam ?? "?"}`;
    case "rcon.queueclan":
      return `Queued ${d.count || 0} clan members${d.clanTag ? ` [${d.clanTag}]` : ""} for team ${d.targetTeam ?? "?"}`;
    case "rcon.demotecommander":
      return withTarget("Demoted commander", d);
    case "rcon.broadcast":
      return quote(d.message) ? `Broadcast ${quote(d.message)}` : "Sent a broadcast";
    case "rcon.disband":
      return `Disbanded squad ${d.squadID ?? "?"} on team ${d.teamID ?? "?"}`;
    case "rcon.setnextlayer":
      return d.layer ? `Set next layer to ${d.layer}` : "Set next layer";
    case "rcon.changelayer":
      return d.layer ? `Changed layer to ${d.layer}` : "Changed layer";
    case "rcon.endmatch":
      return d.layer ? `Ended match on ${d.layer}` : "Ended the current match";
    case "rcon.restartmatch":
      return d.layer ? `Restarted match on ${d.layer}` : "Restarted the current match";
    case "rcon.queuerandomize":
      return `Queued ${d.mode || "team"} randomization`;
    case "rcon.runrandomize":
      return `Ran ${d.mode || "team"} randomization`;
    case "rcon.cancelrandomize":
      return "Cancelled randomization";
    case "rcon.queuebalance":
      return "Queued team balance";
    case "rcon.cancelbalance":
      return asString(d.originalRequester)
        ? `Cancelled team balance (queued by ${d.originalRequester})`
        : "Cancelled team balance";
    case "rcon.balanceexecuted":
      return `Team balance executed${d.playersMoved != null ? ` · ${d.playersMoved} moved` : ""}`;
    case "rcon.balancefailed":
      return `Team balance failed${d.error ? ` · ${d.error}` : ""}`;
    case "rcon.listdisconnected":
      return "Listed disconnected players";
    case "rcon.console":
      return asString(d.command) ? `RCON: ${d.command}` : "Ran an RCON command";
    case "role.create":
      return d.name ? `Created role ${d.name}` : "Created a role";
    case "role.update_permissions":
      return d.name ? `Updated permissions for ${d.name}` : "Updated role permissions";
    case "role.update_member_role":
      return d.name ? `Set member-role flag on ${d.name}` : "Updated member role flag";
    case "role.update_whitelist_grant":
      return d.name ? `Set whitelist grant on ${d.name}` : "Updated whitelist grant";
    case "role.delete":
      return d.name ? `Deleted role ${d.name}` : "Deleted a role";
    case "member.update":
      return withTarget("Updated member", d);
    case "member.delete":
      return withTarget("Deleted member", d);
    case "member.disable":
      return withTarget("Disabled member", d, asString(d.reason) || null);
    case "member.enable":
      return withTarget("Enabled member", d);
    case "member.bulk_update":
      return `Updated ${d.count ?? "?"} members${listWho(d) ? ` (${listWho(d)})` : ""}`;
    case "member.bulk_delete":
      return `Deleted ${d.count ?? "?"} members${listWho(d) ? ` (${listWho(d)})` : ""}`;
    case "member.bulk_disable":
      return `Disabled ${d.count ?? "?"} members${listWho(d) ? ` (${listWho(d)})` : ""}`;
    case "member.bulk_enable":
      return `Enabled ${d.count ?? "?"} members${listWho(d) ? ` (${listWho(d)})` : ""}`;
    case "member.bulk_comment":
      return `Commented on ${d.count ?? "?"} members`;
    case "member.comment.add":
      return withTarget("Added a member comment", d, quote(d.textPreview));
    case "member.comment.delete":
      return withTarget("Deleted a member comment", d);
    case "member.sync_roles":
      return "Synced Discord roles";
    case "admin_group.create":
      return d.name ? `Created admin group ${d.name}` : "Created an admin group";
    case "admin_group.update":
      return d.name ? `Updated admin group ${d.name}` : "Updated an admin group";
    case "admin_group.delete":
      return d.name ? `Deleted admin group ${d.name}` : "Deleted an admin group";
    case "clan.create":
      return d.name ? `Created clan ${d.tag ? `[${d.tag}] ` : ""}${d.name}` : "Created a clan";
    case "clan.update":
      return d.name ? `Updated clan ${d.name}` : "Updated a clan";
    case "clan.delete":
      return d.name ? `Deleted clan ${d.tag ? `[${d.tag}] ` : ""}${d.name}` : "Deleted a clan";
    case "server_config.upsert":
      return d.label ? `Saved server config ${d.label}` : "Saved server config";
    case "server_config.toggle_sync":
      return `Set whitelist sync ${d.syncEnabled === false ? "off" : "on"}`;
    case "server_config.delete":
      return d.label ? `Deleted server config ${d.label}` : "Deleted server config";
    case "match.update":
      return d.map || d.layer ? `Updated match ${d.layer || d.map}` : "Updated a match";
    case "match.resync":
      return d.resynced != null ? `Resynced ${d.resynced} matches` : "Resynced matches";
    case "match.delete":
      return d.layer || d.map ? `Deleted match ${d.layer || d.map}` : "Deleted a match";
    case "squadjs.update_config":
      return d.environment ? `Updated SquadJS config (${d.environment})` : "Updated SquadJS config";
    case "discord_bot.update_birthday_config":
      return "Updated birthday config";
    case "discord_bot.update_seeding_config":
      return "Updated seeding config";
    case "discord_bot.send_seeding_call":
      return "Queued a seeding call";
    case "discord_bot.send_seeding_rapport":
      return d.date ? `Queued seeding rapport for ${d.date}` : "Queued a seeding rapport";
    case "discord_bot.pause_prospect":
      return withTarget("Paused prospect", d);
    case "discord_bot.unpause_prospect":
      return withTarget("Unpaused prospect", d);
    case "discord_bot.extend_prospect":
      return withTarget("Extended prospect", d, d.days != null ? `${d.days} days` : null);
    case "discord_bot.reassign_mentor_queued":
      return withTarget("Queued mentor reassignment", d);
    case "discord_bot.create_ticket_timeout":
      return withTarget("Created ticket timeout", d, d.hours != null ? `${d.hours}h` : null);
    case "discord_bot.expire_ticket_timeout":
      return withTarget("Ended ticket timeout", d);
    case "prospect.update_config":
      return "Updated prospect config";
    case "prospect.cooldown_create":
      return withTarget("Created prospect cooldown", d, d.days != null ? `${d.days} days` : null);
    case "prospect.cooldown_update":
      return withTarget("Updated prospect cooldown", d, d.days != null ? `${d.days} days` : null);
    case "prospect.cooldown_delete":
      return withTarget("Removed prospect cooldown", d);
    case "giveaway.update_config":
      return "Updated giveaway config";
    case "giveaway.update_active":
      return d.prize ? `Updated giveaway (${d.prize})` : "Updated the active giveaway";
    case "giveaway.start":
      return d.prize ? `Started giveaway: ${d.prize}` : "Started a giveaway";
    case "giveaway.open_vote":
      return "Opened giveaway voting";
    case "giveaway.draw":
      return d.prize ? `Drew giveaway: ${d.prize}` : "Drew the giveaway";
    case "giveaway.cancel":
      return d.prize ? `Cancelled giveaway: ${d.prize}` : "Cancelled the giveaway";
    case "giveaway.add_entry":
      return "Added a giveaway entry";
    case "giveaway.adjust_tickets":
      return d.delta != null ? `Adjusted tickets by ${d.delta}` : "Adjusted giveaway tickets";
    default:
      return formatActionLabel(action);
  }
}

function isFromTo(value: unknown): value is { from: unknown; to: unknown } {
  return !!value && typeof value === "object" && "from" in value && "to" in value;
}

export function extractChanges(
  changes: unknown,
  ctx: AuditInspectContext = {},
): AuditChange[] {
  if (!changes || typeof changes !== "object") return [];
  const entries = Object.entries(changes as Record<string, unknown>);
  const keys = entries.map(([k]) => k);
  const out: AuditChange[] = [];
  for (const [key, value] of entries) {
    if (key === "clanId" && keys.includes("clan")) continue;
    if (isFromTo(value)) {
      out.push({
        key,
        label: fieldLabel(key),
        from: formatFieldValue(key, value.from, ctx),
        to: formatFieldValue(key, value.to, ctx),
      });
    } else {
      out.push({
        key,
        label: fieldLabel(key),
        to: formatFieldValue(key, value, ctx),
      });
    }
  }
  return out;
}

function pushPerson(people: AuditPerson[], seen: Set<string>, person: AuditPerson) {
  const key = `${person.label}:${person.name.toLowerCase()}:${person.id ?? ""}`;
  if (!person.name || seen.has(key)) return;
  seen.add(key);
  people.push(person);
}

export function inspectAuditLog(
  log: AuditLogEntry,
  ctx: AuditInspectContext = {},
): AuditInspection {
  const detail = (log.detail && typeof log.detail === "object") ? log.detail : {};
  const people: AuditPerson[] = [];
  const seen = new Set<string>();

  pushPerson(people, seen, { label: "Actor", name: log.userName, id: log.userId });

  for (const { key, label } of NAME_KEYS) {
    const name = asString(detail[key]);
    if (name && name !== log.userName) {
      pushPerson(people, seen, { label, name });
    }
  }
  for (const { key, label } of NAME_LIST_KEYS) {
    for (const name of stringList(detail[key])) {
      if (name !== log.userName) pushPerson(people, seen, { label, name });
    }
  }

  const changes = extractChanges(detail.changes, ctx);
  const fields: AuditField[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (key === "changes") continue;
    if (value === null || value === undefined || value === "") continue;
    const nameMeta = NAME_KEYS.find((n) => n.key === key);
    fields.push({
      key,
      label: fieldLabel(key),
      value: formatFieldValue(key, value, ctx),
      filterValue: nameMeta ? asString(value) || undefined : undefined,
      copyable: COPYABLE_KEYS.has(key),
    });
  }

  return {
    summary: formatAuditSummary(log.action, detail),
    actionLabel: formatActionLabel(log.action),
    actorName: log.userName,
    actorId: log.userId,
    resource: log.resource,
    resourceLabel: formatResourceLabel(log.resource),
    resourceId: log.resourceId,
    createdAt: log.createdAt,
    people,
    fields,
    changes,
  };
}
