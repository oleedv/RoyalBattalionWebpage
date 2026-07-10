import { Prisma } from "../generated/prisma/client";
import type { PrismaClient } from "../generated/prisma/client";
import type {
  UnifiedTicketRow,
  TicketSearchResponse,
  TicketSearchSnippet,
} from "shared";

export const TICKET_PAGE_SIZES = [10, 20, 50, 100, 500] as const;
const DEFAULT_PAGE_SIZE = 20;
const PREVIEW_LEN = 160;
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 120;
// Legacy message types that represent real conversation (vs. bot/command noise).
const LEGACY_CONVO_TYPES = ["from_user", "to_user", "bot_to_user", "chat"];
// Types used for the legacy preview (what the user actually said/typed first).
const LEGACY_PREVIEW_TYPES = ["from_user", "chat"];
const MIN_QUERY_LEN = 2;

export interface TicketSearchParams {
  q?: string;
  status?: string; // all | open | closing | closed
  type?: string; // all | <tier> | legacy
  from?: string; // ISO date (inclusive lower bound)
  to?: string; // ISO date (inclusive upper bound)
  page?: number;
  pageSize?: number;
  /** null = all current-ticket tiers allowed; array = only these tiers. */
  allowedTiers: string[] | null;
}

interface RawRow {
  kind: "current" | "legacy";
  id: number;
  uuid: string;
  tier: string | null;
  status: string;
  user_id: string;
  user_label: string | null;
  sort_date: Date;
  closed_at: Date | null;
  thread_number: number | null;
  reason: string | null;
  anonymous: number | null;
}

function likePattern(q: string): string {
  // Escape LIKE wildcards; MariaDB's default LIKE escape char is backslash.
  return "%" + q.replace(/[\\%_]/g, (ch) => "\\" + ch) + "%";
}

function normalizeQuery(q?: string): string | null {
  const trimmed = (q ?? "").trim();
  return trimmed.length >= MIN_QUERY_LEN ? trimmed : null;
}

function clampPageSize(size?: number): number {
  if (!size) return DEFAULT_PAGE_SIZE;
  return (TICKET_PAGE_SIZES as readonly number[]).includes(size)
    ? size
    : DEFAULT_PAGE_SIZE;
}

function conds(list: Prisma.Sql[]): Prisma.Sql {
  if (list.length === 0) return Prisma.sql`1=1`;
  return list.reduce((acc, c, i) => (i === 0 ? c : Prisma.sql`${acc} AND ${c}`));
}

function currentWhere(p: TicketSearchParams, q: string | null): Prisma.Sql {
  const c: Prisma.Sql[] = [];

  // Tier permission scope.
  if (p.allowedTiers !== null) {
    if (p.allowedTiers.length === 0) return Prisma.sql`1=0`;
    c.push(Prisma.sql`t.tier IN (${Prisma.join(p.allowedTiers)})`);
  }

  // Type filter (a specific tier, or "legacy" which excludes current tickets).
  if (p.type && p.type !== "all") {
    if (p.type === "legacy") return Prisma.sql`1=0`;
    c.push(Prisma.sql`t.tier = ${p.type}`);
  }

  if (p.status && p.status !== "all") c.push(Prisma.sql`t.status = ${p.status}`);
  if (p.from) c.push(Prisma.sql`t.created_at >= ${p.from}`);
  if (p.to) c.push(Prisma.sql`t.created_at <= ${p.to}`);

  if (q) {
    const like = likePattern(q);
    c.push(Prisma.sql`(
      CAST(t.id AS CHAR) LIKE ${like}
      OR t.uuid LIKE ${like}
      OR t.user_id LIKE ${like}
      OR t.reason LIKE ${like}
      OR EXISTS (SELECT 1 FROM ticket_messages m WHERE m.ticket_id = t.id AND m.content LIKE ${like})
    )`);
  }

  return conds(c);
}

function legacyWhere(p: TicketSearchParams, q: string | null): Prisma.Sql {
  const c: Prisma.Sql[] = [];

  // A specific current tier filter excludes all legacy tickets.
  if (p.type && p.type !== "all" && p.type !== "legacy") return Prisma.sql`1=0`;
  // Legacy tickets are always closed; a non-closed status filter excludes them.
  if (p.status && p.status !== "all" && p.status !== "closed") return Prisma.sql`1=0`;

  if (p.from) c.push(Prisma.sql`l.started_at >= ${p.from}`);
  if (p.to) c.push(Prisma.sql`l.started_at <= ${p.to}`);

  if (q) {
    const like = likePattern(q);
    c.push(Prisma.sql`(
      CAST(l.id AS CHAR) LIKE ${like}
      OR CAST(l.thread_number AS CHAR) LIKE ${like}
      OR l.uuid LIKE ${like}
      OR l.user_id LIKE ${like}
      OR l.username LIKE ${like}
      OR COALESCE(l.nickname, '') LIKE ${like}
      OR EXISTS (
        SELECT 1 FROM legacy_ticket_messages m
        WHERE m.ticket_id = l.id
          AND m.type IN (${Prisma.join(LEGACY_CONVO_TYPES)})
          AND m.content LIKE ${like}
      )
    )`);
  }

  return conds(c);
}

function clean(s: string): string {
  return s.replace(/[\r\n\t]/g, " ");
}

function truncate(s: string | null): string | null {
  if (!s) return null;
  const t = clean(s).trim();
  if (!t) return null;
  return t.length > PREVIEW_LEN ? t.slice(0, PREVIEW_LEN).trimEnd() + "…" : t;
}

function buildSnippet(content: string, q: string): TicketSearchSnippet | null {
  const text = clean(content);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return null;
  const start = Math.max(0, idx - SNIPPET_BEFORE);
  const end = Math.min(text.length, idx + q.length + SNIPPET_AFTER);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return {
    text: prefix + text.slice(start, end).trim() + suffix,
    matchStart: prefix.length + (idx - start),
    matchLen: q.length,
  };
}

/** Does the keyword appear in this row's metadata (so no body snippet is needed)? */
function metaMatches(row: RawRow, q: string): boolean {
  const lc = q.toLowerCase();
  const fields = [
    String(row.id),
    row.uuid,
    row.user_id,
    row.reason ?? "",
    row.user_label ?? "",
    row.thread_number != null ? String(row.thread_number) : "",
  ];
  return fields.some((f) => f.toLowerCase().includes(lc));
}

/**
 * Unified, paginated search across current (`tickets`) and legacy (`legacy_tickets`).
 * Matches metadata and message bodies, and returns previews + highlighted snippets.
 */
export async function searchTickets(
  db: PrismaClient,
  params: TicketSearchParams,
): Promise<TicketSearchResponse> {
  const q = normalizeQuery(params.q);
  const pageSize = clampPageSize(params.pageSize);
  const page = Math.max(0, Math.floor(params.page ?? 0));
  const offset = page * pageSize;

  const cw = currentWhere(params, q);
  const lw = legacyWhere(params, q);

  const pageQuery = Prisma.sql`
    SELECT * FROM (
      SELECT 'current' AS kind, t.id AS id, t.uuid AS uuid, t.tier AS tier, t.status AS status,
             t.user_id AS user_id, CAST(NULL AS CHAR(255)) AS user_label, t.created_at AS sort_date,
             t.closed_at AS closed_at, CAST(NULL AS SIGNED) AS thread_number,
             t.reason AS reason, t.anonymous_mode AS anonymous
      FROM tickets t WHERE ${cw}
      UNION ALL
      SELECT 'legacy' AS kind, l.id, l.uuid, NULL AS tier, 'closed' AS status,
             l.user_id, COALESCE(l.nickname, l.username) AS user_label, l.started_at AS sort_date,
             l.closed_at, l.thread_number, NULL AS reason, 0 AS anonymous
      FROM legacy_tickets l WHERE ${lw}
    ) u
    ORDER BY sort_date DESC, id DESC
    LIMIT ${pageSize} OFFSET ${offset}`;

  const countQuery = Prisma.sql`
    SELECT
      (SELECT COUNT(*) FROM tickets t WHERE ${cw}) +
      (SELECT COUNT(*) FROM legacy_tickets l WHERE ${lw}) AS total`;

  const [rows, countRows] = await Promise.all([
    db.$queryRaw<RawRow[]>(pageQuery),
    db.$queryRaw<{ total: bigint | number }[]>(countQuery),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  // Resolve legacy previews (first user message) for this page.
  const legacyIds = rows.filter((r) => r.kind === "legacy").map((r) => r.id);
  const legacyPreviews = new Map<number, string>();
  if (legacyIds.length > 0) {
    const previewRows = await db.$queryRaw<{ ticket_id: number; content: string }[]>(Prisma.sql`
      SELECT ticket_id, content FROM (
        SELECT ticket_id, content,
               ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at ASC, id ASC) rn
        FROM legacy_ticket_messages
        WHERE ticket_id IN (${Prisma.join(legacyIds)})
          AND type IN (${Prisma.join(LEGACY_PREVIEW_TYPES)})
          AND content IS NOT NULL AND content <> ''
      ) x WHERE rn = 1`);
    for (const r of previewRows) legacyPreviews.set(r.ticket_id, r.content);
  }

  // Identify pure body matches (keyword present, not found in metadata) and fetch snippets.
  const snippets = new Map<string, TicketSearchSnippet>();
  if (q) {
    const like = likePattern(q);
    const bodyCurrentIds = rows
      .filter((r) => r.kind === "current" && !metaMatches(r, q))
      .map((r) => r.id);
    const bodyLegacyIds = rows
      .filter((r) => r.kind === "legacy" && !metaMatches(r, q))
      .map((r) => r.id);

    if (bodyCurrentIds.length > 0) {
      const snRows = await db.$queryRaw<{ ticket_id: number; content: string }[]>(Prisma.sql`
        SELECT ticket_id, content FROM (
          SELECT ticket_id, content,
                 ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at ASC, id ASC) rn
          FROM ticket_messages
          WHERE ticket_id IN (${Prisma.join(bodyCurrentIds)}) AND content LIKE ${like}
        ) x WHERE rn = 1`);
      for (const r of snRows) {
        const s = buildSnippet(r.content, q);
        if (s) snippets.set(`current-${r.ticket_id}`, s);
      }
    }

    if (bodyLegacyIds.length > 0) {
      const snRows = await db.$queryRaw<{ ticket_id: number; content: string }[]>(Prisma.sql`
        SELECT ticket_id, content FROM (
          SELECT ticket_id, content,
                 ROW_NUMBER() OVER (PARTITION BY ticket_id ORDER BY created_at ASC, id ASC) rn
          FROM legacy_ticket_messages
          WHERE ticket_id IN (${Prisma.join(bodyLegacyIds)})
            AND type IN (${Prisma.join(LEGACY_CONVO_TYPES)})
            AND content LIKE ${like}
        ) x WHERE rn = 1`);
      for (const r of snRows) {
        const s = buildSnippet(r.content, q);
        if (s) snippets.set(`legacy-${r.ticket_id}`, s);
      }
    }
  }

  const items: UnifiedTicketRow[] = rows.map((r) => {
    const key = `${r.kind}-${r.id}`;
    const snippet = snippets.get(key) ?? null;
    const preview =
      r.kind === "current"
        ? truncate(r.reason)
        : truncate(legacyPreviews.get(r.id) ?? null);
    return {
      kind: r.kind,
      id: r.id,
      uuid: r.uuid,
      tier: r.kind === "current" ? r.tier : null,
      status: r.status,
      userId: r.user_id,
      userLabel: r.kind === "legacy" ? r.user_label : null,
      createdAt: new Date(r.sort_date).toISOString(),
      closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
      threadNumber: r.thread_number,
      anonymous: Boolean(r.anonymous),
      preview,
      snippet,
      matchedIn: snippet ? "body" : "meta",
    };
  });

  return { items, total, page, pageSize };
}
