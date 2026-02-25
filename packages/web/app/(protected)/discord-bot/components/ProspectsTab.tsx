"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getProspects,
  getProspect,
  resolveDiscordNames,
  pauseProspect,
  unpauseProspect,
  extendProspect,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { Prospect } from "shared";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-accent/15 text-accent border-accent/30",
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

function exportProspectText(prospect: Prospect) {
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
    for (const v of prospect.votes) lines.push(`[${fmtDate(v.createdAt)}] ${v.voterTag || v.voterId}: ${v.vote}${v.reason ? ` -- ${v.reason}` : ""}`);
  }
  if (prospect.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of prospect.events) lines.push(`[${fmtDate(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
  }
  if (prospect.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of prospect.messages) lines.push(`[${fmtDate(m.createdAt)}] ${m.authorTag}${m.isStaff ? " [STAFF]" : ""}: ${m.content || ""}`);
  }
  return lines.join("\n");
}

export default function ProspectsTab({ apiToken, canManage }: { apiToken: string; canManage: boolean }) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Prospect>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [extendDays, setExtendDays] = useState<Record<number, number>>({});

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
    getProspects(apiToken).then((res) => {
      if (res.success && res.data) {
        setProspects(res.data);
        const ids = res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]);
        resolveNames(ids);
      } else setError(res.error || "Failed to load prospects");
      setLoading(false);
    });
  }, [apiToken]);

  const refreshProspects = useCallback(async () => {
    try {
      const res = await getProspects(apiToken);
      if (res.success && res.data) {
        setProspects(res.data);
        const ids = res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]);
        resolveNames(ids);
      }
    } catch { /* silent */ }
  }, [apiToken]);

  useAutoRefresh(refreshProspects, 20_000, !actionLoading);

  async function handleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!details[id]) {
      const res = await getProspect(apiToken, id);
      if (res.success && res.data) {
        setDetails((prev) => ({ ...prev, [id]: res.data! }));
        const ids = [
          ...(res.data.events || []).map((e) => e.actorId),
          ...(res.data.votes || []).map((v) => v.voterId),
        ].filter(Boolean);
        resolveNames(ids);
      }
    }
  }

  async function handlePause(id: number) {
    setActionLoading(true);
    const res = await pauseProspect(apiToken, id);
    if (res.success) {
      // Refresh detail
      const detailRes = await getProspect(apiToken, id);
      if (detailRes.success && detailRes.data) {
        setDetails((prev) => ({ ...prev, [id]: detailRes.data! }));
        // Update list item
        setProspects((prev) => prev.map((p) => p.id === id ? { ...p, pausedAt: new Date().toISOString() } : p));
      }
    }
    setActionLoading(false);
  }

  async function handleUnpause(id: number) {
    setActionLoading(true);
    const res = await unpauseProspect(apiToken, id);
    if (res.success) {
      const detailRes = await getProspect(apiToken, id);
      if (detailRes.success && detailRes.data) {
        setDetails((prev) => ({ ...prev, [id]: detailRes.data! }));
        setProspects((prev) => prev.map((p) => p.id === id ? { ...p, pausedAt: null } : p));
      }
    }
    setActionLoading(false);
  }

  async function handleExtend(id: number) {
    const days = extendDays[id] || 7;
    setActionLoading(true);
    const res = await extendProspect(apiToken, id, days);
    if (res.success) {
      const detailRes = await getProspect(apiToken, id);
      if (detailRes.success && detailRes.data) {
        setDetails((prev) => ({ ...prev, [id]: detailRes.data! }));
      }
    }
    setActionLoading(false);
  }

  function handleDownload(prospect: Prospect) {
    const text = exportProspectText(prospect);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospect-${prospect.alias}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return prospects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.alias.toLowerCase().includes(q) ||
        p.userId.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q) ||
        p.steamId.toLowerCase().includes(q) ||
        p.uuid.toLowerCase().includes(q)
      );
    });
  }, [prospects, search, statusFilter]);

  if (loading) return <div className="text-text-muted">Loading prospects...</div>;
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
            placeholder="Search by alias, nationality, steam ID, UUID..."
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
          <option value="accepted">Accepted</option>
          <option value="denied">Denied</option>
        </select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
            {prospects.length === 0 ? "No prospect applications found" : "No prospects match your filters"}
          </div>
        ) : (
          filtered.map((p) => {
            const expanded = expandedId === p.id;
            const detail = details[p.id] || null;
            return (
              <div key={p.id} className="facet-border rounded-sm bg-bg-card transition-all">
                <div className="flex items-center">
                  <button
                    onClick={() => handleExpand(p.id)}
                    className="flex-1 px-5 py-4 text-left transition-colors hover:bg-bg-card-hover"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-bg-tertiary">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
                            <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                          </svg>
                        </div>
                        <div>
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                              {p.alias}
                            </span>
                            <StatusBadge status={p.status} />
                            {p.pausedAt && (
                              <span className="rounded-sm border border-warning/30 bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                                Paused
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-text-muted">
                            <span>{p.nationality}</span>
                            <span className="h-1 w-1 rounded-full bg-text-muted" />
                            <span>{p.squadHours}h in Squad</span>
                            <span className="h-1 w-1 rounded-full bg-text-muted" />
                            <span>{new Date(p.createdAt).toLocaleDateString()}</span>
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
                    href={`/prospect/${p.uuid}`}
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
                    <div className="mb-4 flex justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(detail); }}
                        className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                      >
                        Download
                      </button>
                    </div>

                    {/* Application info */}
                    <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Alias</span>
                        <div className="text-sm text-text-primary">{detail.alias}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Nationality</span>
                        <div className="text-sm text-text-primary">{detail.nationality}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Date of Birth</span>
                        <div className="text-sm text-text-primary">{detail.dateOfBirth}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Squad Hours</span>
                        <div className="text-sm text-text-primary">{detail.squadHours}h</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Preferred Roles</span>
                        <div className="text-sm text-text-primary">{detail.preferredRoles}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Previous Clan</span>
                        <div className="text-sm text-text-primary">{detail.prevClan || "--"}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Active Hours</span>
                        <div className="text-sm text-text-primary">{detail.activeHours}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Competitive</span>
                        <div className="text-sm text-text-primary">{detail.competitive}</div>
                      </div>
                      <div>
                        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Steam ID</span>
                        <div className="text-sm"><code className="text-accent">{detail.steamId}</code></div>
                      </div>
                      {detail.mentorId && (
                        <div>
                          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Mentor</span>
                          <div className="text-sm text-text-primary">{displayName(detail.mentorId)}</div>
                        </div>
                      )}
                    </div>

                    <div className="mb-5">
                      <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Why Royal Battalion?</span>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{detail.whyRb}</p>
                    </div>

                    {/* Admin actions */}
                    {canManage && detail.status === "open" && (
                      <div className="mb-5 flex flex-wrap items-center gap-3 border-t border-border/50 pt-4">
                        <button
                          onClick={() => detail.pausedAt ? handleUnpause(detail.id) : handlePause(detail.id)}
                          disabled={actionLoading}
                          className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-50"
                        >
                          {detail.pausedAt ? "Unpause Period" : "Pause Period"}
                        </button>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={extendDays[detail.id] || 7}
                            onChange={(e) => setExtendDays((prev) => ({ ...prev, [detail.id]: Number(e.target.value) }))}
                            className="w-16 rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1.5 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
                          />
                          <button
                            onClick={() => handleExtend(detail.id)}
                            disabled={actionLoading}
                            className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-50"
                          >
                            Extend Period
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Votes */}
                    {detail.votes && detail.votes.length > 0 && (
                      <div className="mb-5">
                        <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                          Votes ({detail.votes.length})
                        </h4>
                        <div className="mb-3 flex gap-3">
                          {(() => {
                            const yes = detail.votes.filter((v) => v.vote === "yes").length;
                            const no = detail.votes.filter((v) => v.vote === "no").length;
                            const unsure = detail.votes.filter((v) => v.vote === "unsure").length;
                            return (
                              <>
                                <span className="rounded-sm border border-success/30 bg-success/15 px-2 py-1 text-xs font-medium text-success">Yes: {yes}</span>
                                <span className="rounded-sm border border-danger/30 bg-danger/15 px-2 py-1 text-xs font-medium text-danger">No: {no}</span>
                                <span className="rounded-sm border border-accent/30 bg-accent/15 px-2 py-1 text-xs font-medium text-accent">Unsure: {unsure}</span>
                              </>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {detail.votes.map((v) => {
                            const color = v.vote === "yes" ? "text-success border-success/30 bg-success/10"
                              : v.vote === "no" ? "text-danger border-danger/30 bg-danger/10"
                              : "text-accent border-accent/30 bg-accent/10";
                            return (
                              <div key={v.id} className={`rounded-sm border px-3 py-1.5 ${color}`}>
                                <div className="text-xs font-medium">{v.voterTag || v.voterId}</div>
                                <div className="text-[10px] font-semibold uppercase">{v.vote}</div>
                                {v.reason && <div className="mt-0.5 text-[10px] opacity-80">{v.reason}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Events */}
                    {detail.events && detail.events.length > 0 && (
                      <div className="mb-5">
                        <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Timeline</h4>
                        <div className="space-y-2">
                          {detail.events.map((event) => (
                            <div key={event.id} className="flex items-start gap-3">
                              <div className="mt-1.5 h-2 w-2 rounded-full bg-accent/50" />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium capitalize text-text-primary">{event.eventType.replace(/_/g, " ")}</span>
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

                    {/* Messages */}
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
