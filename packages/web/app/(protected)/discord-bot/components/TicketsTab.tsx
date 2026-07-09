"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import { getTickets, getTicket, resolveDiscordNames } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePermissions } from "@/lib/permission-context";
import { Skeleton, SkeletonList } from "@/components/skeleton";
import { StatusBadge, ticketStatusVariant } from "@/components/status-badge";
import { SearchInput } from "@/components/search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DownloadButton } from "@/components/download-button";
import { CopyableId } from "@/components/copyable-id";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import type { Ticket, Permission } from "shared";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
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
            <img
              src={url}
              alt={`Attachment ${i + 1}`}
              className="max-h-32 max-w-48 rounded-sm border border-border/50 object-cover transition-opacity hover:opacity-80"
              loading="lazy"
            />
          </a>
        ) : (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-accent transition-colors hover:bg-bg-card-hover"
          >
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
  if (ticket.closedAt)
    lines.push(
      `Closed: ${fmtDate(ticket.closedAt)}${ticket.closedBy ? ` by ${ticket.closedBy}` : ""}`,
    );
  lines.push(`UUID: ${ticket.uuid}`);
  if (ticket.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of ticket.events)
      lines.push(
        `[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`,
      );
  }
  if (ticket.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of ticket.messages)
      lines.push(
        `[${fmtDate(m.createdAt)}] ${m.authorTag}${m.isStaff ? " [STAFF]" : ""}: ${m.content || ""}`,
      );
  }
  return lines.join("\n");
}

const ALL_TIERS = ["normal", "community_officer", "admin_officer"] as const;

const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  community_officer: "Community Officer",
  admin_officer: "Admin Officer",
};

const TIER_TONES: Record<string, "neutral" | "accent" | "danger"> = {
  normal: "neutral",
  community_officer: "accent",
  admin_officer: "danger",
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

export type TicketsApi = {
  getTickets: typeof getTickets;
  getTicket: typeof getTicket;
  resolveDiscordNames: typeof resolveDiscordNames;
};

const defaultApi: TicketsApi = {
  getTickets,
  getTicket,
  resolveDiscordNames,
};

export default function TicketsTab({
  apiToken,
  api = defaultApi,
}: {
  apiToken: string;
  api?: TicketsApi;
}) {
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
  const nameMapRef = useRef<Record<string, string>>({});

  async function resolveNames(ids: string[]) {
    const unknown = ids.filter((id) => id && !nameMapRef.current[id]);
    if (unknown.length === 0) return;
    const res = await api.resolveDiscordNames(apiToken, [...new Set(unknown)]);
    if (res.success && res.data) {
      nameMapRef.current = { ...nameMapRef.current, ...res.data };
      setNameMap((prev) => ({ ...prev, ...res.data }));
    }
  }

  function displayName(id: string | null): string {
    if (!id) return "--";
    return nameMap[id] || id;
  }

  useEffect(() => {
    api.getTickets(apiToken).then((res) => {
      if (res.success && res.data) {
        setTickets(res.data);
        const ids = res.data
          .flatMap((t) => [t.userId, t.closedBy].filter(Boolean) as string[]);
        resolveNames(ids);
      } else setError(res.error || "Failed to load tickets");
      setLoading(false);
    });
  }, [apiToken]);

  const refreshTickets = useCallback(async () => {
    try {
      const res = await api.getTickets(apiToken);
      if (res.success && res.data) {
        setTickets(res.data);
        const ids = res.data
          .flatMap((t) => [t.userId, t.closedBy].filter(Boolean) as string[]);
        resolveNames(ids);
      }
    } catch { /* silent */ }
  }, [apiToken]);

  useAutoRefresh(refreshTickets);

  async function handleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (!details[id]) {
      const res = await api.getTicket(apiToken, id);
      if (res.success && res.data) {
        setDetails((prev) => ({ ...prev, [id]: res.data! }));
        const ids = (res.data.events || []).map((e) => e.actorId).filter(Boolean);
        resolveNames(ids);
      }
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (tierFilter !== "all" && t.tier !== tierFilter) return false;
      if (!q) return true;
      return (
        String(t.id).includes(q) ||
        t.userId.toLowerCase().includes(q) ||
        t.uuid.toLowerCase().includes(q)
      );
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
      <div className="mb-6 flex flex-wrap gap-3">
        <SearchInput
          className="min-w-48 flex-1"
          value={search}
          onChange={setSearch}
          placeholder="Search by ID, user, UUID..."
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as string) ?? "all")}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        {visibleTiers.length > 1 && (
          <Select
            value={tierFilter}
            onValueChange={(v) => setTierFilter((v as string) ?? "all")}
          >
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              {visibleTiers.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIER_LABELS[t] || t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <EmptyState
            message={tickets.length === 0 ? "No tickets found" : "No tickets match your filters"}
          />
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
                          <FileText className="h-4 w-4 text-text-muted" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                              Ticket #{t.id}
                            </span>
                            <StatusBadge variant={ticketStatusVariant(t.status)} />
                            <StatusBadge tone={TIER_TONES[t.tier] ?? "neutral"}>
                              {TIER_LABELS[t.tier] || t.tier}
                            </StatusBadge>
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
                      <ChevronDown
                        aria-hidden="true"
                        className={cn(
                          "h-5 w-5 text-text-muted transition-transform duration-200",
                          expanded && "rotate-180",
                        )}
                      />
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
                    <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>

                {expanded && detail && (
                  <div className="border-t border-border/50 px-5 pb-5 pt-4">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <span className="text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                            User
                          </span>
                          <div className="text-sm text-text-primary">{displayName(detail.userId)}</div>
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                            Created
                          </span>
                          <div className="text-sm text-text-primary">{fmtDate(detail.createdAt)}</div>
                        </div>
                        <div>
                          <span className="text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                            UUID
                          </span>
                          <div>
                            <CopyableId value={detail.uuid} />
                          </div>
                        </div>
                        {detail.closedAt && (
                          <div>
                            <span className="text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                              Closed
                            </span>
                            <div className="text-sm text-text-primary">{fmtDate(detail.closedAt)}</div>
                          </div>
                        )}
                        {detail.closedBy && (
                          <div>
                            <span className="text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                              Closed By
                            </span>
                            <div className="text-sm text-text-primary">
                              {displayName(detail.closedBy)}
                            </div>
                          </div>
                        )}
                      </div>
                      <DownloadButton
                        text={exportTicketText(detail)}
                        filename={`ticket-${detail.id}.txt`}
                      />
                    </div>

                    {detail.events && detail.events.length > 0 && (
                      <div className="mb-5">
                        <h4 className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                          Timeline
                        </h4>
                        <div className="space-y-2">
                          {detail.events.map((event) => (
                            <div key={event.id} className="flex items-start gap-3">
                              <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium capitalize text-text-primary">
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
                                  {fmtDate(event.createdAt)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {detail.messages && detail.messages.length > 0 && (
                      <div>
                        <h4 className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                          Messages
                        </h4>
                        <div className="space-y-3">
                          {detail.messages.map((msg) => (
                            <div
                              key={msg.id}
                              className={cn(
                                "rounded-sm border p-3",
                                msg.isStaff
                                  ? "border-accent/20 bg-accent/5"
                                  : "border-border/50 bg-bg-tertiary/30",
                              )}
                            >
                              <div className="mb-1 flex items-center gap-2">
                                <span className="text-sm font-medium text-text-primary">
                                  {msg.authorTag}
                                </span>
                                {msg.isStaff && (
                                  <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
                                    Staff
                                  </span>
                                )}
                                <span className="text-xs text-text-muted">
                                  {fmtDate(msg.createdAt)}
                                </span>
                              </div>
                              {msg.content && (
                                <p className="whitespace-pre-wrap text-sm text-text-secondary">
                                  {msg.content}
                                </p>
                              )}
                              <MessageAttachments attachments={msg.attachments} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {!detail.events?.length && !detail.messages?.length && (
                      <p className="py-4 text-center text-sm text-text-muted">
                        No events or messages recorded
                      </p>
                    )}
                  </div>
                )}
                {expanded && !detail && (
                  <div className="border-t border-border/50 px-5 py-6 text-center text-sm text-text-muted">
                    Loading details...
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
