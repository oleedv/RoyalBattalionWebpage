import type {
  AdminGroup,
  AuditLogEntry,
  Clan,
  WhitelistEntry,
} from "shared";
import type { BulkAddSkippedEntry } from "@/lib/api-client";

export const SQUAD_PERMISSIONS = [
  "startvote", "cheat", "private", "config", "manageserver", "featuretest",
  "debug", "teamchange", "cameraman", "pause", "kick", "ban", "changemap",
  "chat", "balance", "reserve", "immune", "forceteamchange", "canseeadminchat",
  "clientdemos",
];

// Default servers if no ServerConfig exists in DB
export const DEFAULT_SERVERS = [
  { server: "main", label: "Main Server" },
  { server: "battle", label: "Battle Server" },
];

export function getStoredDefaultServer(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rb-default-server") || "";
}

export function formatExpiry(
  expiresAt: string | null,
): { label: string; expired: boolean } | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  const now = new Date();
  if (exp <= now) return { label: "Expired", expired: true };
  const diff = exp.getTime() - now.getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return { label: `${days}d left`, expired: false };
  const hours = Math.floor(diff / 3600000);
  return { label: `${hours}h left`, expired: false };
}

/* ── Audit readable-diff helpers ─────────────────────────────────────── */

// Human-readable labels for audit-detail fields
export const WL_DETAIL_LABELS: Record<string, string> = {
  steamId: "Steam ID",
  name: "Name",
  clan: "Clan",
  clanId: "Clan",
  role: "Role",
  groupId: "Group",
  reason: "Reason",
  expiresAt: "Expires",
  userId: "Linked user",
  server: "Server",
  count: "Entries",
  created: "Created",
  skipped: "Skipped",
  total: "Total",
  textPreview: "Comment",
  commentId: "Comment",
  steamIds: "Steam IDs",
  changes: "Changes",
};

// Resolve a stored value into something a human can read (ids -> names, dates, etc.)
export function wlReadableValue(
  field: string,
  value: unknown,
  groups: AdminGroup[],
  clans: Clan[],
): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "groupId") return groups.find((g) => g.id === value)?.name ?? String(value);
  if (field === "clanId") return clans.find((c) => c.id === value)?.name ?? String(value);
  if (field === "expiresAt" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export type WlReadableChange = { key: string; label: string; from: string; to: string };

// Turn a whitelist.update `changes` map into readable from -> to rows,
// dropping internal id fields that duplicate a human-readable twin (clanId vs clan).
export function wlReadableChanges(
  changes: unknown,
  groups: AdminGroup[],
  clans: Clan[],
): WlReadableChange[] {
  if (!changes || typeof changes !== "object") return [];
  const keys = Object.keys(changes as Record<string, unknown>);
  const out: WlReadableChange[] = [];
  for (const k of keys) {
    const v = (changes as Record<string, unknown>)[k];
    if (!v || typeof v !== "object" || !("from" in v) || !("to" in v)) continue;
    if (k === "clanId" && keys.includes("clan")) continue;
    const { from, to } = v as { from: unknown; to: unknown };
    out.push({
      key: k,
      label: WL_DETAIL_LABELS[k] ?? k,
      from: wlReadableValue(k, from, groups, clans),
      to: wlReadableValue(k, to, groups, clans),
    });
  }
  return out;
}

export function getActionVerb(action: string): string {
  switch (action) {
    case "whitelist.add": return "added this entry";
    case "whitelist.update": return "updated entry";
    case "whitelist.delete": return "removed entry";
    case "whitelist.comment.add": return "added a comment";
    case "whitelist.comment.delete": return "deleted a comment";
    case "whitelist.bulk_update": return "bulk updated";
    case "whitelist.bulk_add": return "bulk added";
    case "whitelist.bulk_delete": return "bulk deleted";
    default: return action;
  }
}

export function getActionLabel(action: string): string {
  const parts = action.split(".");
  return parts[parts.length - 1];
}

export type WlActionTone = "danger" | "success" | "warning" | "accent";

export function getActionTone(action: string): WlActionTone {
  if (action.includes("delete")) return "danger";
  if (action.includes("add")) return "success";
  if (action.includes("update")) return "warning";
  return "accent";
}

export const ACTION_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "whitelist.add", label: "Add" },
  { value: "whitelist.update", label: "Update" },
  { value: "whitelist.delete", label: "Delete" },
  { value: "whitelist.bulk_add", label: "Bulk Add" },
  { value: "whitelist.bulk_update", label: "Bulk Update" },
  { value: "whitelist.bulk_delete", label: "Bulk Delete" },
  { value: "whitelist.comment.add", label: "Comment Add" },
  { value: "whitelist.comment.delete", label: "Comment Delete" },
];

export function getDetailSummary(
  log: AuditLogEntry,
  groups: AdminGroup[],
  clans: Clan[],
): string {
  const detail = (log.detail || {}) as Record<string, unknown>;
  switch (log.action) {
    case "whitelist.add":
      return `Added ${(detail.name as string) || (detail.steamId as string) || "entry"}${detail.server ? ` on ${detail.server}` : ""}`;
    case "whitelist.update": {
      const readable = wlReadableChanges(detail.changes, groups, clans);
      if (readable.length === 0) return "Updated entry";
      const parts = readable.map((c) => `${c.label}: ${c.from} → ${c.to}`);
      if (parts.length <= 2) return parts.join(" · ");
      return `${parts.slice(0, 2).join(" · ")} · +${parts.length - 2} more`;
    }
    case "whitelist.delete":
      return `Removed ${(detail.name as string) || (detail.steamId as string) || "entry"}${detail.server ? ` from ${detail.server}` : ""}`;
    case "whitelist.bulk_add":
      return `Added ${detail.created ?? "?"} entries (${detail.skipped ?? 0} skipped)`;
    case "whitelist.bulk_update":
      return `Updated ${detail.count ?? "?"} entries`;
    case "whitelist.bulk_delete":
      return `Deleted ${detail.count ?? "?"} entries`;
    case "whitelist.comment.add": {
      const preview = detail.textPreview as string | undefined;
      if (!preview) return "Added comment";
      const trimmed = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;
      return `Commented: "${trimmed}"`;
    }
    case "whitelist.comment.delete":
      return "Deleted comment";
    default:
      return log.action;
  }
}

/* ── Import parsing + classification ─────────────────────────────────── */

export interface ParsedImportRow {
  steamId: string;
  name: string;
  clanId: string;
  role: string;
  groupId: string;
  error: boolean;
}

export function parseImportLines(
  text: string,
  clans: Clan[],
  groups: AdminGroup[],
): ParsedImportRow[] {
  const allLines = text.split("\n");
  const parsed: ParsedImportRow[] = [];
  let currentClanId = "";

  for (const line of allLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Group=")) continue;

    // Detect clan section headers like "// RB" or "// No Clan"
    if (trimmed.startsWith("//")) {
      const sectionName = trimmed.replace(/^\/\/\s*/, "").trim();
      if (sectionName && sectionName !== "No Clan") {
        // Match by tag or name (case-insensitive)
        const matchedClan = clans.find(
          (c) =>
            c.tag.toLowerCase() === sectionName.toLowerCase() ||
            c.name.toLowerCase() === sectionName.toLowerCase(),
        );
        currentClanId = matchedClan?.id || "";
      } else {
        currentClanId = "";
      }
      continue;
    }

    // Parse Admin=steamId:GroupName // PlayerName
    const match = trimmed.match(/^(.+?)=(\d+):(.+?)\s*\/\/\s*(.+)$/);
    if (match) {
      const roleName = match[3].trim();
      const matchedGroup = groups.find((g) => g.name.toLowerCase() === roleName.toLowerCase());
      parsed.push({ clanId: currentClanId, steamId: match[2].trim(), role: roleName, groupId: matchedGroup?.id || "", name: match[4].trim(), error: false });
    } else {
      // Try simpler format: Admin=steamId:GroupName
      const simpleMatch = trimmed.match(/^(.+?)=(\d+):(.+)$/);
      if (simpleMatch) {
        const roleName = simpleMatch[3].trim();
        const matchedGroup = groups.find((g) => g.name.toLowerCase() === roleName.toLowerCase());
        parsed.push({ clanId: currentClanId, steamId: simpleMatch[2].trim(), role: roleName, groupId: matchedGroup?.id || "", name: "", error: false });
      } else {
        parsed.push({ steamId: "", name: "", clanId: "", role: "", groupId: "", error: true });
      }
    }
  }
  return parsed;
}

export type ImportDupeReason = "existing" | "batch";

// Classify import rows against the currently loaded whitelist (same server) and within the pasted batch
export function classifyImportRows(
  rows: ParsedImportRow[],
  entries: WhitelistEntry[],
): Map<number, ImportDupeReason> {
  const map = new Map<number, ImportDupeReason>();
  const existingSteamIds = new Set(entries.map((e) => e.steamId));
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const sid = row.steamId.trim();
    if (!sid) return;
    if (existingSteamIds.has(sid)) {
      map.set(i, "existing");
    } else if (seen.has(sid)) {
      map.set(i, "batch");
    } else {
      seen.add(sid);
    }
  });
  return map;
}

export function importCounts(
  rows: ParsedImportRow[],
  dupeMap: Map<number, ImportDupeReason>,
): { newCount: number; existingCount: number; batchCount: number; errorCount: number } {
  let newCount = 0;
  let existingCount = 0;
  let batchCount = 0;
  let errorCount = 0;
  rows.forEach((row, i) => {
    if (row.error) { errorCount++; return; }
    if (!row.steamId.trim()) { errorCount++; return; }
    const reason = dupeMap.get(i);
    if (reason === "existing") existingCount++;
    else if (reason === "batch") batchCount++;
    else newCount++;
  });
  return { newCount, existingCount, batchCount, errorCount };
}

export function formatImportResult(
  created: number,
  skipped: BulkAddSkippedEntry[],
  now: number = Date.now(),
): string {
  let msg = `Imported ${created} ${created === 1 ? "entry" : "entries"}`;
  if (skipped.length > 0) {
    const sample = skipped.slice(0, 5)
      .map((s) => {
        if (s.reason === "duplicate_in_batch") return `${s.steamId} (duplicate in batch)`;
        const who = s.existingName ? ` as "${s.existingName}"` : "";
        let when = "";
        if (s.existingExpiresAt) {
          const exp = new Date(s.existingExpiresAt);
          const expIso = s.existingExpiresAt.slice(0, 10);
          when = exp.getTime() < now ? `, expired ${expIso}` : `, expires ${expIso}`;
        } else if (s.existingName !== undefined) {
          when = ", no expiry";
        }
        return `${s.steamId} (already whitelisted${who}${when})`;
      })
      .join(", ");
    const extra = skipped.length > 5 ? `, +${skipped.length - 5} more` : "";
    msg += `. Skipped ${skipped.length}: ${sample}${extra}`;
  }
  return msg;
}

/* ── admins.cfg generation ───────────────────────────────────────────── */

export function generateCfgContent(
  entries: WhitelistEntry[],
  groups: AdminGroup[],
  activeServer: string,
  now: Date = new Date(),
): string {
  const lines: string[] = [];
  const timestamp = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

  // Header
  lines.push("// ============================================================");
  lines.push("// Royal Battalion Whitelist");
  lines.push(`// Generated: ${timestamp}`);
  lines.push(`// Server: ${activeServer}`);
  lines.push("// ============================================================");
  lines.push("");

  // Group definitions
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const g of sortedGroups) {
    lines.push(`Group=${g.name}:${g.permissions}`);
  }
  if (sortedGroups.length > 0) lines.push("");

  // Entries grouped by clan
  const activeEntries = entries.filter((e) => {
    if (!e.expiresAt) return true;
    return new Date(e.expiresAt) > now;
  });

  const byClan = new Map<string, WhitelistEntry[]>();
  for (const e of activeEntries) {
    const clan = e.clan || "No Clan";
    if (!byClan.has(clan)) byClan.set(clan, []);
    byClan.get(clan)!.push(e);
  }

  const sortedClans = [...byClan.keys()].sort((a, b) => {
    if (a === "No Clan") return 1;
    if (b === "No Clan") return -1;
    return a.localeCompare(b);
  });

  for (const clan of sortedClans) {
    lines.push(`// ${clan}`);
    for (const e of byClan.get(clan)!) {
      const groupName = e.groupName || e.role || "Whitelist";
      const playerName = e.name || e.steamId;
      lines.push(`Admin=${e.steamId}:${groupName} // ${playerName}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
