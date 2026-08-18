"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { getProspects, getProspect } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useDiscordNameMap } from "@/hooks/use-discord-names";
import { Skeleton, SkeletonList, SkeletonRegion } from "@/components/skeleton";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Prospect } from "shared";

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
  lines.push(`Created: ${formatDateTime(prospect.createdAt)}`);
  if (prospect.closedAt) lines.push(`Closed: ${formatDateTime(prospect.closedAt)}${prospect.closedBy ? ` by ${prospect.closedBy}` : ""}`);
  lines.push(`UUID: ${prospect.uuid}`);
  lines.push("", `--- Why Royal Battalion? ---`, prospect.whyRb);
  if (prospect.votes?.length) {
    lines.push("", "--- Votes ---");
    for (const v of prospect.votes) {
      lines.push(`[${formatDateTime(v.createdAt)}] ${v.voterTag || v.voterId}: ${v.vote}${v.reason ? ` -- ${v.reason}` : ""}`);
    }
  }
  if (prospect.events?.length) {
    lines.push("", "--- Timeline ---");
    for (const e of prospect.events) {
      lines.push(`[${formatDateTime(e.createdAt)}] ${e.eventType} by ${e.actorId}${e.detail ? ` -- ${e.detail}` : ""}`);
    }
  }
  if (prospect.messages?.length) {
    lines.push("", "--- Messages ---");
    for (const m of prospect.messages) {
      const staff = m.isStaff ? " [STAFF]" : "";
      lines.push(`[${formatDateTime(m.createdAt)}] ${m.authorTag}${staff}: ${m.content || ""}`);
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

function getDenialEvent(prospect: Prospect) {
  const events = prospect.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].eventType === "denied") return events[i];
  }
  return null;
}

function ProspectDenialBanner({
  prospect,
  displayName,
}: {
  prospect: Prospect;
  displayName: (id: string | null) => string;
}) {
  if (prospect.status !== "denied") return null;
  const deniedEvent = getDenialEvent(prospect);
  const reason = deniedEvent?.detail?.trim() || null;
  const actorId = deniedEvent?.actorId || prospect.closedBy;
  const deniedBy =
    prospect.closedByName?.trim()
    || deniedEvent?.actorName?.trim()
    || (actorId ? displayName(actorId) : null)
    || "Unknown staff member";
  const deniedAt = deniedEvent?.createdAt || prospect.closedAt;

  return (
    <div role="status" className="mb-5 rounded-sm border border-danger/40 bg-danger/10 p-4">
      <div className="mb-2 text-[10px] font-semibold tracking-[0.15em] text-danger uppercase">Denial reason</div>
      <p className="whitespace-pre-wrap text-sm font-medium text-text-primary">
        {reason ?? "No reason was recorded."}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[10px] font-semibold tracking-[0.15em] text-danger/80 uppercase">Denied by</div>
          <div className="mt-0.5 text-sm font-semibold text-text-primary">{deniedBy}</div>
        </div>
        {deniedAt && (
          <div>
            <div className="text-[10px] font-semibold tracking-[0.15em] text-danger/80 uppercase">Date</div>
            <div className="mt-0.5 text-sm text-text-primary">{formatDateTime(deniedAt)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProspectDetail({ prospect, displayName }: { prospect: Prospect; displayName: (id: string | null) => string }) {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      <div className="mb-4 flex justify-end">
        <DownloadButton text={exportProspectText(prospect)} filename={`prospect-${prospect.alias}.txt`} />
      </div>
      <ProspectDenialBanner prospect={prospect} displayName={displayName} />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Alias</span>
          <div className="text-sm text-text-primary">{prospect.alias}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Nationality</span>
          <div className="text-sm text-text-primary">{prospect.nationality}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Date of Birth</span>
          <div className="text-sm text-text-primary">{prospect.dateOfBirth}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Squad Hours</span>
          <div className="text-sm text-text-primary">{prospect.squadHours}h</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Preferred Roles</span>
          <div className="text-sm text-text-primary">{prospect.preferredRoles}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Previous Clan</span>
          <div className="text-sm text-text-primary">{prospect.prevClan || "--"}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Active Hours</span>
          <div className="text-sm text-text-primary">{prospect.activeHours}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Competitive</span>
          <div className="text-sm text-text-primary">{prospect.competitive}</div>
        </div>
        <div>
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Steam ID</span>
          <div className="text-sm"><code className="text-accent">{prospect.steamId}</code></div>
        </div>
        {prospect.mentorId && (
          <div>
            <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Mentor</span>
            <div className="text-sm text-text-primary">{displayName(prospect.mentorId)}</div>
          </div>
        )}
      </div>
      <div className="mb-5">
        <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Why Royal Battalion?</span>
        <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{prospect.whyRb}</p>
      </div>
      {prospect.votes && prospect.votes.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Votes ({prospect.votes.length})</h4>
          <div className="flex flex-wrap gap-2">
            {prospect.votes.map((v) => {
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
      {prospect.events && prospect.events.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Timeline</h4>
          <div className="space-y-2">
            {prospect.events.map((event) => {
              const isDenied = event.eventType === "denied";
              return (
                <div key={event.id} className="flex items-start gap-3">
                  <div className={`mt-1.5 h-2 w-2 rounded-full ${isDenied ? "bg-danger" : "bg-accent/50"}`} />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium capitalize ${isDenied ? "text-danger" : "text-text-primary"}`}>
                        {event.eventType.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-text-muted">by {event.actorName || displayName(event.actorId)}</span>
                    </div>
                    {event.detail && (
                      <p className={isDenied ? "text-sm font-medium text-text-primary" : "text-xs text-text-secondary"}>{event.detail}</p>
                    )}
                    <span className="text-xs text-text-muted">{formatDateTime(event.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {prospect.messages && prospect.messages.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Messages</h4>
          <div className="space-y-3">
            {prospect.messages.map((msg) => (
              <div key={msg.id} className={`rounded-sm border p-3 ${msg.isStaff ? "border-accent/20 bg-accent/5" : "border-border/50 bg-bg-tertiary/30"}`}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{msg.authorTag}</span>
                  {msg.isStaff && <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent uppercase">Staff</span>}
                  <span className="text-xs text-text-muted">{formatDateTime(msg.createdAt)}</span>
                </div>
                {msg.content && <p className="whitespace-pre-wrap text-sm text-text-secondary">{msg.content}</p>}
                <MessageAttachments attachments={msg.attachments} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="border-t border-border/50 px-5 pb-5 pt-4">
      <SkeletonRegion label="Loading details…" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-28" />
            </div>
          ))}
        </div>
      </SkeletonRegion>
    </div>
  );
}

const PAGE_SIZE_KEY = "rb-prospects-page-size";
const PAGE_SIZES = [10, 20, 50, 100, 500] as const;

function getStoredPageSize(): number {
  if (typeof window === "undefined") return 20;
  const stored = localStorage.getItem(PAGE_SIZE_KEY);
  const n = Number(stored);
  return PAGE_SIZES.includes(n as (typeof PAGE_SIZES)[number]) ? n : 20;
}

export function ApplicationsList({ apiToken }: { apiToken: string }) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [pageSize, setPageSize] = useState(getStoredPageSize);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Prospect>>({});
  const { resolveNames, displayName } = useDiscordNameMap(apiToken);
  const hasRowsRef = useRef(false);

  const load = useCallback(async () => {
    const res = await getProspects(apiToken);
    if (res.success && res.data) {
      setError(null);
      setProspects(res.data);
      hasRowsRef.current = res.data.length > 0;
      const ids = res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]);
      void resolveNames(ids);
    } else if (!hasRowsRef.current) {
      setError(res.error || "Failed to load prospects");
    }
    setLoaded(true);
  }, [apiToken, resolveNames]);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 20_000, !!apiToken);

  async function handleExpand(id: number) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return prospects.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.alias.toLowerCase().includes(q) ||
        p.userId.toLowerCase().includes(q) ||
        p.nationality.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q) ||
        p.steamId.toLowerCase().includes(q) ||
        p.uuid.toLowerCase().includes(q)
      );
    });
  }, [prospects, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const rangeStart = filtered.length === 0 ? 0 : safePage * pageSize + 1;
  const rangeEnd = Math.min((safePage + 1) * pageSize, filtered.length);

  if (error && prospects.length === 0) return <div className="text-danger">{error}</div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by alias, nationality, steam ID, UUID..."
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
        >
          {["all", "open", "closed", "accepted", "denied"].map((s) => (
            <option key={s} value={s}>{s === "all" ? "All Status" : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {!loaded ? (
          <SkeletonList rows={6} avatar />
        ) : pageRows.length === 0 ? (
          <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
            {prospects.length === 0 ? "No prospect applications found" : "No prospects match your search"}
          </div>
        ) : (
          pageRows.map((p) => (
            <div key={p.id} className="facet-border rounded-sm bg-bg-card transition-all">
              <div className="flex items-center">
                <button onClick={() => handleExpand(p.id)} className="flex-1 px-5 py-4 text-left transition-colors hover:bg-bg-card-hover">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-border bg-bg-tertiary">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-text-muted">
                          <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
                        </svg>
                      </div>
                      <div>
                        <div className="mb-0.5 flex items-center gap-2">
                          <span className="font-display text-sm font-semibold tracking-wide text-text-primary">{p.alias}</span>
                          <StatusBadge status={p.status} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-muted">
                          <span>{p.nationality}</span>
                          <span className="h-1 w-1 rounded-full bg-text-muted" />
                          <span>{p.squadHours}h in Squad</span>
                          <span className="h-1 w-1 rounded-full bg-text-muted" />
                          <span>{formatDate(p.createdAt)}</span>
                          {p.closedAt && (
                            <>
                              <span className="h-1 w-1 rounded-full bg-text-muted" />
                              <span>Closed: {formatDate(p.closedAt)}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-5 w-5 text-text-muted transition-transform duration-200 ${expanded === p.id ? "rotate-180" : ""}`}>
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
              {expanded === p.id && details[p.id] && <ProspectDetail prospect={details[p.id]} displayName={displayName} />}
              {expanded === p.id && !details[p.id] && <DetailSkeleton />}
            </div>
          ))
        )}
      </div>

      {filtered.length > 0 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>{rangeStart}–{rangeEnd} of {filtered.length.toLocaleString()}</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const size = Number(e.target.value);
                setPageSize(size);
                localStorage.setItem(PAGE_SIZE_KEY, String(size));
                setPage(0);
              }}
              className="rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s} per page</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(0)} disabled={safePage === 0} className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:pointer-events-none disabled:opacity-30">First</button>
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:pointer-events-none disabled:opacity-30">Prev</button>
            <span className="px-3 text-xs text-text-muted">{safePage + 1} / {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={safePage >= totalPages - 1} className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:pointer-events-none disabled:opacity-30">Next</button>
            <button onClick={() => setPage(totalPages - 1)} disabled={safePage >= totalPages - 1} className="rounded-sm border border-border px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-card-hover disabled:pointer-events-none disabled:opacity-30">Last</button>
          </div>
        </div>
      )}
    </div>
  );
}
