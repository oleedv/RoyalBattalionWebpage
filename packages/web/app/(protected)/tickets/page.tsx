"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  searchTickets,
  getTicket,
  getLegacyTicket,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useDiscordNameMap } from "@/hooks/use-discord-names";
import { Skeleton, SkeletonRegion, SkeletonList } from "@/components/skeleton";
import { formatDate, formatDateTime } from "@/lib/format";
import { DiscordTranscript } from "@/components/discord-transcript/DiscordTranscript";
import { exportTranscriptLines } from "@/components/discord-transcript/group-transcript";
import type {
  Ticket,
  LegacyTicket,
  LegacyTicketMessage,
  Permission,
  UnifiedTicketRow,
  TicketSearchSnippet,
} from "shared";

function exportTicketText(ticket: Ticket) {
  const lines: string[] = [];
  lines.push(`Ticket #${ticket.id} [${ticket.status}] - ${ticket.tier}`);
  lines.push(`User: ${ticket.userId}`);
  lines.push(`Created: ${formatDateTime(ticket.createdAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${formatDateTime(ticket.closedAt)}${ticket.closedBy ? ` by ${ticket.closedBy}` : ""}`);
  lines.push(`UUID: ${ticket.uuid}`);

  if (ticket.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of ticket.events) {
      lines.push(`[${formatDateTime(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
    }
  }

  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    lines.push(...exportTranscriptLines(ticket.messages, formatDateTime));
  }

  return lines.join("\n");
}

function exportLegacyTicketText(ticket: LegacyTicket) {
  const lines: string[] = [];
  lines.push(`Legacy Ticket #${ticket.id} [closed]`);
  lines.push(`User: ${ticket.nickname || ticket.username} (${ticket.userId})`);
  if (ticket.threadNumber) lines.push(`Thread: #${ticket.threadNumber}`);
  lines.push(`Started: ${formatDateTime(ticket.startedAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${formatDateTime(ticket.closedAt)}`);
  lines.push(`UUID: ${ticket.uuid}`);

  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages) {
      lines.push(`[${formatDateTime(m.createdAt)}] [${m.type}] ${m.author || "System"}: ${m.content || ""}`);
    }
  }

  return lines.join("\n");
}

function DownloadButton({ text, filename }: { text: string; filename: string }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
    >
      Download
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-accent/15 text-accent border-accent/30",
    closing: "bg-warning/15 text-warning border-warning/30",
    closed: "bg-text-muted/15 text-text-secondary border-text-muted/30",
    accepted: "bg-success/15 text-success border-success/30",
    denied: "bg-danger/15 text-danger border-danger/30",
  };
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.closed}`}>
      {status}
    </span>
  );
}

function LegacyBadge() {
  return (
    <span className="rounded-sm border border-text-muted/30 bg-text-muted/10 px-2 py-0.5 text-xs font-medium text-text-muted">
      Legacy
    </span>
  );
}

function AnonBadge() {
  return (
    <span className="rounded-sm border border-blue-400/30 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-400">
      Anon
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const labels: Record<string, string> = {
    normal: "Normal",
    community_officer: "Community Officer",
    admin_officer: "Admin Officer",
    comp_team: "Comp Team",
    whitelist: "Whitelist",
  };
  const colors: Record<string, string> = {
    normal: "text-text-secondary",
    community_officer: "text-accent",
    admin_officer: "text-danger",
    comp_team: "text-blue-400",
    whitelist: "text-emerald-400",
  };
  return (
    <span className={`text-xs ${colors[tier] || "text-text-muted"}`}>
      {labels[tier] || tier}
    </span>
  );
}

const LEGACY_MSG_STYLES: Record<string, { border: string; bg: string; label: string; labelColor: string }> = {
  from_user: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "User", labelColor: "bg-blue-500/15 text-blue-400" },
  chat: { border: "border-border/50", bg: "bg-bg-tertiary/30", label: "Chat", labelColor: "bg-blue-500/15 text-blue-400" },
  to_user: { border: "border-accent/20", bg: "bg-accent/5", label: "Staff", labelColor: "bg-accent/15 text-accent" },
  command: { border: "border-accent/20", bg: "bg-accent/5", label: "Command", labelColor: "bg-accent/15 text-accent" },
  bot: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
  bot_to_user: { border: "border-border/30", bg: "bg-bg-tertiary/10", label: "Bot", labelColor: "bg-text-muted/15 text-text-muted" },
};

function LegacyMessageItem({ msg }: { msg: LegacyTicketMessage }) {
  const style = LEGACY_MSG_STYLES[msg.type] || LEGACY_MSG_STYLES.bot;
  const isBotType = msg.type === "bot" || msg.type === "bot_to_user";

  return (
    <div className={`rounded-sm border p-3 ${style.border} ${style.bg}`}>
      <div className="mb-1 flex items-center gap-2">
        <span className={`text-sm font-medium ${isBotType ? "text-text-muted" : "text-text-primary"}`}>
          {msg.author || "System"}
        </span>
        <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style.labelColor}`}>
          {style.label}
        </span>
        <span className="text-xs text-text-muted">
          {formatDateTime(msg.createdAt)}
        </span>
      </div>
      {msg.content && (
        <p className={`whitespace-pre-wrap text-sm ${isBotType ? "text-text-muted" : "text-text-secondary"}`}>
          {msg.content}
        </p>
      )}
    </div>
  );
}

function LegacyTicketDetail({ ticket }: { ticket: LegacyTicket }) {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      <div className="mb-4 flex items-start justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User</span>
            <div className="text-sm text-text-primary">{ticket.nickname || ticket.username}</div>
          </div>
          {ticket.threadNumber && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Thread</span>
              <div className="text-sm text-text-primary">#{ticket.threadNumber}</div>
            </div>
          )}
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Started</span>
            <div className="text-sm text-text-primary">{formatDateTime(ticket.startedAt)}</div>
          </div>
          {ticket.closedAt && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed</span>
              <div className="text-sm text-text-primary">{formatDateTime(ticket.closedAt)}</div>
            </div>
          )}
          {ticket.previousThreads != null && ticket.previousThreads > 0 && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Previous Threads</span>
              <div className="text-sm text-text-primary">{ticket.previousThreads}</div>
            </div>
          )}
        </div>
        <DownloadButton text={exportLegacyTicketText(ticket)} filename={`legacy-ticket-${ticket.id}.txt`} />
      </div>

      {ticket.messages && ticket.messages.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Messages ({ticket.messages.length})
          </h4>
          <div className="space-y-3">
            {ticket.messages.map((msg) => (
              <LegacyMessageItem key={msg.id} msg={msg} />
            ))}
          </div>
        </div>
      )}

      {!ticket.messages?.length && (
        <p className="py-4 text-center text-sm text-text-muted">
          No messages recorded
        </p>
      )}
    </div>
  );
}

function TicketDetail({ ticket, displayName }: {
  ticket: Ticket;
  displayName: (id: string | null) => string;
}) {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      <div className="mb-4 flex items-start justify-between">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User</span>
            <div className="text-sm text-text-primary">{displayName(ticket.userId)}</div>
          </div>
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Created</span>
            <div className="text-sm text-text-primary">{formatDateTime(ticket.createdAt)}</div>
          </div>
          {ticket.closedAt && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed</span>
              <div className="text-sm text-text-primary">{formatDateTime(ticket.closedAt)}</div>
            </div>
          )}
          {ticket.closedBy && (
            <div>
              <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed By</span>
              <div className="text-sm text-text-primary">{displayName(ticket.closedBy)}</div>
            </div>
          )}
        </div>
        <DownloadButton text={exportTicketText(ticket)} filename={`ticket-${ticket.id}.txt`} />
      </div>

      {/* Events timeline */}
      {ticket.events && ticket.events.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Timeline
          </h4>
          <div className="space-y-2">
            {ticket.events.map((event) => (
              <div key={event.id} className="flex items-start gap-3">
                <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary capitalize">
                      {event.eventType}
                    </span>
                    <span className="text-xs text-text-muted">
                      by {displayName(event.actorId)}
                    </span>
                  </div>
                  {event.detail && (
                    <p className="text-xs text-text-secondary">{event.detail}</p>
                  )}
                  <span className="text-xs text-text-muted">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {ticket.messages && ticket.messages.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            Messages
          </h4>
          <DiscordTranscript messages={ticket.messages} compact />
        </div>
      )}

      {!ticket.events?.length && !ticket.messages?.length && (
        <p className="py-4 text-center text-sm text-text-muted">
          No events or messages recorded
        </p>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      <SkeletonRegion label="Loading detailsΓÇª" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-sm" />
          <Skeleton className="h-16 w-full rounded-sm" />
        </div>
      </SkeletonRegion>
    </div>
  );
}

function HighlightedSnippet({ snippet }: { snippet: TicketSearchSnippet }) {
  const { text, matchStart, matchLen } = snippet;
  const end = matchStart + matchLen;
  return (
    <>
      {text.slice(0, matchStart)}
      <mark className="rounded-[2px] bg-accent/25 px-0.5 text-text-primary">
        {text.slice(matchStart, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

function RowPreview({ row }: { row: UnifiedTicketRow }) {
  if (row.snippet) {
    return (
      <p className="mt-1.5 line-clamp-2 text-xs text-text-secondary">
        <span className="mr-1.5 rounded-sm bg-bg-tertiary px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          match
        </span>
        <HighlightedSnippet snippet={row.snippet} />
      </p>
    );
  }
  if (row.preview) {
    return <p className="mt-1.5 line-clamp-2 text-xs text-text-muted">{row.preview}</p>;
  }
  return null;
}

const DOC_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
    <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5z" clipRule="evenodd" />
  </svg>
);

function UnifiedRow({ row, expanded, onExpand, currentDetail, legacyDetail, displayName }: {
  row: UnifiedTicketRow;
  expanded: boolean;
  onExpand: () => void;
  currentDetail: Ticket | null;
  legacyDetail: LegacyTicket | null;
  displayName: (id: string | null) => string;
}) {
  const isLegacy = row.kind === "legacy";
  const title = isLegacy
    ? (row.threadNumber ? `Thread #${row.threadNumber}` : `Ticket #${row.id}`)
    : `Ticket #${row.id}`;
  const who = isLegacy ? (row.userLabel || row.userId) : displayName(row.userId);
  const href = isLegacy ? `/ticket/legacy/${row.uuid}` : `/ticket/${row.uuid}`;

  return (
    <div className="facet-border rounded-sm bg-bg-card transition-all">
      <div className="flex items-center">
        <button
          onClick={onExpand}
          className="min-w-0 flex-1 px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-4">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-border bg-bg-tertiary">
                {DOC_ICON}
              </div>
              <div className="min-w-0">
                <div className="mb-0.5 flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                    {title}
                  </span>
                  <StatusBadge status={row.status} />
                  {isLegacy ? <LegacyBadge /> : row.tier && <TierBadge tier={row.tier} />}
                  {row.anonymous && <AnonBadge />}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>{who}</span>
                  <span className="h-1 w-1 rounded-full bg-text-muted" />
                  <span>{formatDate(row.createdAt)}</span>
                  {row.closedAt && (
                    <>
                      <span className="h-1 w-1 rounded-full bg-text-muted" />
                      <span>Closed: {formatDate(row.closedAt)}</span>
                    </>
                  )}
                </div>
                <RowPreview row={row} />
              </div>
            </div>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`mt-1 h-5 w-5 shrink-0 text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </button>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
          title="Open in new tab"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </a>
      </div>
      {expanded && (
        isLegacy
          ? (legacyDetail ? <LegacyTicketDetail ticket={legacyDetail} /> : <DetailSkeleton />)
          : (currentDetail ? <TicketDetail ticket={currentDetail} displayName={displayName} /> : <DetailSkeleton />)
      )}
    </div>
  );
}

const ALL_TIERS = ["normal", "community_officer", "admin_officer", "comp_team", "whitelist"] as const;
const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  community_officer: "Community Officer",
  admin_officer: "Admin Officer",
  comp_team: "Comp Team",
  whitelist: "Whitelist",
};

function getVisibleTiers(permissions: Permission[]): string[] {
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

const PAGE_SIZE_KEY = "rb-tickets-page-size";
const PAGE_SIZES = [10, 20, 50, 100, 500] as const;

function getStoredPageSize(): number {
  if (typeof window === "undefined") return 20;
  const stored = localStorage.getItem(PAGE_SIZE_KEY);
  const n = Number(stored);
  return PAGE_SIZES.includes(n as (typeof PAGE_SIZES)[number]) ? n : 20;
}

export default function TicketsPage() {
  const { apiToken, permissions } = usePermissions();
  const visibleTiers = getVisibleTiers(permissions);
  const [error, setError] = useState<string | null>(null);

  // Shared filter state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState(getStoredPageSize);
  const [page, setPage] = useState(0);

  // Tickets (server-driven)
  const [rows, setRows] = useState<UnifiedTicketRow[]>([]);
  const [total, setTotal] = useState(0);
  const [ticketsLoaded, setTicketsLoaded] = useState(false);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [ticketDetails, setTicketDetails] = useState<Record<number, Ticket>>({});
  const [legacyDetails, setLegacyDetails] = useState<Record<number, LegacyTicket>>({});
  const reqSeq = useRef(0);

  const { resolveNames, displayName } = useDiscordNameMap(apiToken);
  const hasRowsRef = useRef(false);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to first page whenever the query/filters change.
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter, tierFilter, dateFrom, dateTo]);

  const loadTickets = useCallback(async (silent = false) => {
    if (!apiToken) return;
    const seq = ++reqSeq.current;
    if (!silent) setTicketsLoading(true);
    const res = await searchTickets(apiToken, {
      q: debouncedSearch || undefined,
      status: statusFilter,
      type: tierFilter,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      page,
      pageSize,
    });
    if (seq !== reqSeq.current) return; // a newer request superseded this one
    if (res.success && res.data) {
      setError(null);
      setRows(res.data.items);
      setTotal(res.data.total);
      hasRowsRef.current = res.data.items.length > 0 || res.data.total > 0;
      const ids = res.data.items.filter((r) => r.kind === "current").map((r) => r.userId);
      void resolveNames(ids);
    } else if (!hasRowsRef.current) {
      setError(res.error || "Failed to load tickets");
    }
    setTicketsLoaded(true);
    setTicketsLoading(false);
  }, [apiToken, debouncedSearch, statusFilter, tierFilter, dateFrom, dateTo, page, pageSize, resolveNames]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const refreshData = useCallback(async () => {
    if (!apiToken) return;
    await loadTickets(true);
  }, [apiToken, loadTickets]);

  useAutoRefresh(refreshData, 20_000, !!apiToken);

  async function handleExpandTicket(row: UnifiedTicketRow) {
    const key = `${row.kind}-${row.id}`;
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    if (row.kind === "current") {
      if (!ticketDetails[row.id] && apiToken) {
        const res = await getTicket(apiToken, row.id);
        if (res.success && res.data) {
          setTicketDetails((prev) => ({ ...prev, [row.id]: res.data! }));
          const ids = (res.data.events || []).map((e) => e.actorId).filter(Boolean);
          resolveNames(ids);
        }
      }
    } else {
      if (!legacyDetails[row.id] && apiToken) {
        const res = await getLegacyTicket(apiToken, row.id);
        if (res.success && res.data) {
          setLegacyDetails((prev) => ({ ...prev, [row.id]: res.data! }));
        }
      }
    }
  }

  const activeTotal = total;
  const totalPages = Math.max(1, Math.ceil(activeTotal / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  useEffect(() => {
    if (page > totalPages - 1) setPage(totalPages - 1);
  }, [page, totalPages]);

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
    setPage(0);
  }

  const statusOptions = ["all", "open", "closing", "closed"];

  const filtersActive =
    !!debouncedSearch || statusFilter !== "all" || tierFilter !== "all" || !!dateFrom || !!dateTo;

  const initialLoading = !apiToken || !ticketsLoaded;

  const rangeStart = activeTotal === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = safePage * pageSize + rows.length;

  if (error && rows.length === 0) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">
          Tickets
        </h1>
      </div>

      {/* Search & Filter */}
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search id, user, UUID, or message text…"
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        >
          {statusOptions.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        >
          <option value="all">All Types</option>
          {visibleTiers.map((t) => (
            <option key={t} value={t}>{TIER_LABELS[t] || t}</option>
          ))}
          <option value="legacy">Legacy</option>
        </select>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span className="uppercase tracking-[0.1em]">Date range</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1.5 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
          />
          <span>–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1.5 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="rounded-sm border border-border px-2 py-1 text-text-secondary transition-colors hover:bg-bg-card-hover"
            >
              Clear
            </button>
          )}
          {ticketsLoading && ticketsLoaded && (
            <span className="ml-auto animate-pulse text-text-muted">Searching…</span>
          )}
        </div>

      <div className="space-y-3">
          {initialLoading ? (
            <SkeletonList rows={6} avatar />
          ) : rows.length === 0 ? (
            <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
              {filtersActive ? "No tickets match your search" : "No tickets found"}
            </div>
          ) : (
            rows.map((row) => (
              <UnifiedRow
                key={`${row.kind}-${row.id}`}
                row={row}
                expanded={expandedKey === `${row.kind}-${row.id}`}
                currentDetail={row.kind === "current" ? ticketDetails[row.id] || null : null}
                legacyDetail={row.kind === "legacy" ? legacyDetails[row.id] || null : null}
                onExpand={() => handleExpandTicket(row)}
                displayName={displayName}
              />
            ))
          )}
        </div>

      {/* Pagination */}
      {activeTotal > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>
              {rangeStart}–{rangeEnd} of {activeTotal.toLocaleString()}
            </span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSizeChange(Number(e.target.value))}
              className="rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s} per page</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              Prev
            </button>
            <span className="px-3 text-xs text-text-muted">
              {safePage + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
              className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:opacity-30 disabled:pointer-events-none"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
