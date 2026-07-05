"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { getTickets, getTicket, resolveDiscordNames } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePermissions } from "@/lib/permission-context";
import { Skeleton, SkeletonList } from "@/components/skeleton";
import type { Ticket, Permission } from "shared";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-accent/15 text-accent border-accent/30",
    closed: "bg-text-muted/15 text-text-secondary border-text-muted/30",
  };
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.closed}`}>
      {status}
    </span>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const labels: Record<string, string> = {
    normal: "Normal",
    community_officer: "Community Officer",
    admin_officer: "Admin Officer",
  };
  const colors: Record<string, string> = {
    normal: "text-text-secondary",
    community_officer: "text-accent",
    admin_officer: "text-danger",
  };
  return (
    <span className={`text-xs ${colors[tier] || "text-text-muted"}`}>
      {labels[tier] || tier}
    </span>
  );
}

function parseAttachments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((u: unknown) => typeof u === "string");
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((u: unknown) => typeof u === "string");
  } catch { /* not JSON */ }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("cdn.discordapp.com");
}

function MessageAttachments({ attachments }: { attachments: string | null }) {
  const urls = parseAttachments(attachments);
  if (urls.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((url, i) =>
        isImageUrl(url) ? (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
            <img src={url} alt={`Attachment ${i + 1}`} className="max-h-32 max-w-48 rounded-sm border border-border/50 object-cover transition-opacity hover:opacity-80" loading="lazy" />
          </a>
        ) : (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-accent transition-colors hover:bg-bg-card-hover">
            Attachment {i + 1}
          </a>
        )
      )}
    </div>
  );
}

function exportTicketText(ticket: Ticket) {
  const lines: string[] = [];
  lines.push(`Ticket #${ticket.id} [${ticket.status}] - ${ticket.tier}`);
  lines.push(`User: ${ticket.userId}`);
  lines.push(`Created: ${fmtDate(ticket.createdAt)}`);
  if (ticket.closedAt) lines.push(`Closed: ${fmtDate(ticket.closedAt)}${ticket.closedBy ? ` by ${ticket.closedBy}` : ""}`);
  lines.push(`UUID: ${ticket.uuid}`);
  if (ticket.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of ticket.events) lines.push(`[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
  }
  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages) lines.push(`[${fmtDate(m.createdAt)}] ${m.authorTag}${m.isStaff ? " [STAFF]" : ""}: ${m.content || ""}`);
  }
  return lines.join("\n");
}

const ALL_TIERS = ["normal", "community_officer", "admin_officer"] as const;
const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  community_officer: "Community Officer",
  admin_officer: "Admin Officer",
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
  return tiers;
}

export default function TicketsTab({ apiToken }: { apiToken: string }) {
  const { permissions } = usePermissions();
  const visibleTiers = getVisibleTiers(permissions);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Ticket>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});

  async function resolveNames(ids: string[]) {
    const unknown = ids.filter((id) => id && !nameMap[id]);
    if (unknown.length === 0) return;
    const res = await resolveDiscordNames(apiToken, [...new Set(unknown)]);
    if (res.success && res.data) setNameMap((prev) => ({ ...prev, ...res.data }));
  }

  function displayName(id: string | null): string {
    if (!id) return "--";
    return nameMap[id] || id;
  }

  useEffect(() => {
    getTickets(apiToken).then((res) => {
      if (res.success && res.data) {
        setTickets(res.data);
        const ids = res.data.flatMap((t) => [t.userId, t.closedBy].filter(Boolean) as string[]);
        resolveNames(ids);
      } else setError(res.error || "Failed to load tickets");
      setLoading(false);
    });
  }, [apiToken]);

  const refreshTickets = useCallback(async () => {
    try {
      const res = await getTickets(apiToken);
      if (res.success && res.data) {
        setTickets(res.data);
        const ids = res.data.flatMap((t) => [t.userId, t.closedBy].filter(Boolean) as string[]);
        resolveNames(ids);
      }
    } catch { /* silent */ }
  }, [apiToken]);

  useAutoRefresh(refreshTickets);

  async function handleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!details[id]) {
      const res = await getTicket(apiToken, id);
      if (res.success && res.data) {
        setDetails((prev) => ({ ...prev, [id]: res.data! }));
        const ids = (res.data.events || []).map((e) => e.actorId).filter(Boolean);
        resolveNames(ids);
      }
    }
  }

  function handleDownload(ticket: Ticket) {
    const text = exportTicketText(ticket);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ticket-${ticket.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (tierFilter !== "all" && t.tier !== tierFilter) return false;
      if (!q) return true;
      return String(t.id).includes(q) || t.userId.toLowerCase().includes(q) || t.uuid.toLowerCase().includes(q);
    });
  }, [tickets, search, statusFilter, tierFilter]);

  if (loading && tickets.length === 0)
    return (
      <div>
        <div className="mb-6 flex gap-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
        <SkeletonList rows={5} avatar />
      </div>
    );
  if (error) return <div className="text-danger">{error}</div>;

  return (
    <div>
      <div className="mb-6 flex gap-3">
        <div className="relative flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ID, user, UUID..."
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </select>
        {visibleTiers.length > 1 && (
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
            className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
          >
            <option value="all">All Tiers</option>
            {visibleTiers.map((t) => (
              <option key={t} value={t}>{TIER_LABELS[t] || t}</option>
            ))}
          </select>
        )}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
            {tickets.length === 0 ? "No tickets found" : "No tickets match your filters"}
          </div>
        ) : (
          filtered.map((t) => {
            const expanded = expandedId === t.id;
            const detail = details[t.id] || null;
            return (
              <div key={t.id} className="facet-border rounded-sm bg-bg-card transition-all">
                <div className="flex items-center">
                  <button
                    onClick={() => handleExpand(t.id)}
                    className="flex-1 px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-bg-tertiary">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
                            <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 003 3.5v13A1.5 1.5 0 004.5 18h11a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06l-4.12-4.122A1.5 1.5 0 0011.378 2H4.5z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                              Ticket #{t.id}
                            </span>
                            <StatusBadge status={t.status} />
                            <TierBadge tier={t.tier} />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <span>{displayName(t.userId)}</span>
                            <span className="h-1 w-1 rounded-full bg-text-muted" />
                            <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                            {t.closedAt && (
                              <>
                                <span className="h-1 w-1 rounded-full bg-text-muted" />
                                <span>Closed: {new Date(t.closedAt).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"
                        className={`h-5 w-5 text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}>
                        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </button>
                  <a
                    href={`/ticket/${t.uuid}`}
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

                {expanded && detail && (
                  <div className="border-t border-border/50 px-5 pb-5 pt-4">
                    <div className="mb-4 flex items-start justify-between">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">User</span>
                          <div className="text-sm text-text-primary">{displayName(detail.userId)}</div>
                        </div>
                        <div>
                          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Created</span>
                          <div className="text-sm text-text-primary">{fmtDate(detail.createdAt)}</div>
                        </div>
                        {detail.closedAt && (
                          <div>
                            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed</span>
                            <div className="text-sm text-text-primary">{fmtDate(detail.closedAt)}</div>
                          </div>
                        )}
                        {detail.closedBy && (
                          <div>
                            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Closed By</span>
                            <div className="text-sm text-text-primary">{displayName(detail.closedBy)}</div>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(detail); }}
                        className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                      >
                        Download
                      </button>
                    </div>

                    {detail.events && detail.events.length > 0 && (
                      <div className="mb-5">
                        <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Timeline</h4>
                        <div className="space-y-2">
                          {detail.events.map((event) => (
                            <div key={event.id} className="flex items-start gap-3">
                              <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium capitalize text-text-primary">{event.eventType}</span>
                                  <span className="text-xs text-text-muted">by {displayName(event.actorId)}</span>
                                </div>
                                {event.detail && <p className="text-xs text-text-secondary">{event.detail}</p>}
                                <span className="text-xs text-text-muted">{fmtDate(event.createdAt)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {detail.messages && detail.messages.length > 0 && (
                      <div>
                        <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Messages</h4>
                        <div className="space-y-3">
                          {detail.messages.map((msg) => (
                            <div key={msg.id} className={`rounded-sm border p-3 ${msg.isStaff ? "border-accent/20 bg-accent/5" : "border-border/50 bg-bg-tertiary/30"}`}>
                              <div className="mb-1 flex items-center gap-2">
                                <span className="text-sm font-medium text-text-primary">{msg.authorTag}</span>
                                {msg.isStaff && <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">Staff</span>}
                                <span className="text-xs text-text-muted">{fmtDate(msg.createdAt)}</span>
                              </div>
                              {msg.content && <p className="whitespace-pre-wrap text-sm text-text-secondary">{msg.content}</p>}
                              <MessageAttachments attachments={msg.attachments} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!detail.events?.length && !detail.messages?.length && (
                      <p className="py-4 text-center text-sm text-text-muted">No events or messages recorded</p>
                    )}
                  </div>
                )}
                {expanded && !detail && (
                  <div className="border-t border-border/50 px-5 py-6 text-center text-sm text-text-muted">Loading details...</div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
