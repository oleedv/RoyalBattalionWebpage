"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, User, Users } from "lucide-react";
import {
  getProspects,
  getProspect,
  resolveDiscordNames,
  pauseProspect,
  unpauseProspect,
  extendProspect,
  getMentorGroups,
  reassignMentor,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Skeleton, SkeletonList } from "@/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SearchInput } from "@/components/search-input-v2";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DownloadButton } from "@/components/download-button";
import { StatusBadge, ticketStatusVariant } from "@/components/status-badge";
import { CopyableId } from "@/components/copyable-id";
import { cn } from "@/lib/utils";
import type { Prospect } from "shared";
import type { MentorGroup } from "shared";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function extractUrls(arr: unknown[]): string[] {
  return arr
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "url" in item) return (item as { url: string }).url;
      return null;
    })
    .filter(Boolean) as string[];
}

function parseAttachments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return extractUrls(raw);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return extractUrls(parsed);
  } catch { /* not JSON */ }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function isImageUrl(url: string): boolean {
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(url) || url.includes("cdn.discordapp.com");
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-accent underline break-all hover:text-accent-bright">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
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

export type ProspectsApi = {
  getProspects: typeof getProspects;
  getProspect: typeof getProspect;
  resolveDiscordNames: typeof resolveDiscordNames;
  pauseProspect: typeof pauseProspect;
  unpauseProspect: typeof unpauseProspect;
  extendProspect: typeof extendProspect;
  getMentorGroups: typeof getMentorGroups;
  reassignMentor: typeof reassignMentor;
};

const defaultApi: ProspectsApi = {
  getProspects,
  getProspect,
  resolveDiscordNames,
  pauseProspect,
  unpauseProspect,
  extendProspect,
  getMentorGroups,
  reassignMentor,
};

export default function ProspectsTab({
  apiToken,
  canManage,
  api = defaultApi,
}: {
  apiToken: string;
  canManage: boolean;
  api?: ProspectsApi;
}) {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, Prospect>>({});
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const nameMapRef = useRef<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [extendDays, setExtendDays] = useState<Record<number, number>>({});
  const [viewMode, setViewMode] = useState<"list" | "mentor">("list");
  const [mentorGroups, setMentorGroups] = useState<MentorGroup[]>([]);
  const [mentorLoading, setMentorLoading] = useState(false);
  const [reassigning, setReassigning] = useState<number | null>(null);
  const [selectedMentor, setSelectedMentor] = useState<string>("");

  const resolveNames = useCallback(
    async (ids: string[]) => {
      const unknown = ids.filter((id) => id && !nameMapRef.current[id]);
      if (unknown.length === 0) return;
      const res = await api.resolveDiscordNames(apiToken, [...new Set(unknown)]);
      if (res.success && res.data && Object.keys(res.data).length > 0) {
        setNameMap((prev) => {
          const next = { ...prev, ...res.data };
          nameMapRef.current = next;
          return next;
        });
      }
    },
    [apiToken, api],
  );

  function displayName(id: string | null): string {
    if (!id) return "--";
    return nameMap[id] || id;
  }

  useEffect(() => {
    api.getProspects(apiToken).then((res) => {
      if (res.success && res.data) {
        setProspects(res.data);
        const ids = res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]);
        resolveNames(ids);
      } else setError(res.error || "Failed to load prospects");
      setLoading(false);
    });
  }, [apiToken, api, resolveNames]);

  const refreshProspects = useCallback(async () => {
    try {
      const res = await api.getProspects(apiToken);
      if (res.success && res.data) {
        setProspects(res.data);
        const ids = res.data.flatMap((p) => [p.userId, p.closedBy, p.mentorId].filter(Boolean) as string[]);
        resolveNames(ids);
      }
    } catch { /* silent */ }
  }, [apiToken, api, resolveNames]);

  const refreshMentorGroups = useCallback(async () => {
    try {
      const res = await api.getMentorGroups(apiToken);
      if (res.success && res.data) {
        setMentorGroups(res.data);
        const ids = res.data.flatMap((g) => [g.mentorId, ...g.prospects.map((p) => p.userId)].filter(Boolean) as string[]);
        resolveNames(ids);
      }
    } catch { /* silent */ }
  }, [apiToken, api, resolveNames]);

  useEffect(() => {
    if (viewMode === "mentor") {
      setMentorLoading(true);
      refreshMentorGroups().finally(() => setMentorLoading(false));
    }
  }, [viewMode, refreshMentorGroups]);

  useAutoRefresh(viewMode === "list" ? refreshProspects : refreshMentorGroups, 20_000, !actionLoading);

  async function handleExpand(id: number) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!details[id]) {
      const res = await api.getProspect(apiToken, id);
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
    const res = await api.pauseProspect(apiToken, id);
    if (res.success) {
      // Refresh detail
      const detailRes = await api.getProspect(apiToken, id);
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
    const res = await api.unpauseProspect(apiToken, id);
    if (res.success) {
      const detailRes = await api.getProspect(apiToken, id);
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
    const res = await api.extendProspect(apiToken, id, days);
    if (res.success) {
      const detailRes = await api.getProspect(apiToken, id);
      if (detailRes.success && detailRes.data) {
        setDetails((prev) => ({ ...prev, [id]: detailRes.data! }));
      }
    }
    setActionLoading(false);
  }

  async function handleReassign(prospectId: number, newMentorId: string) {
    setActionLoading(true);
    const res = await api.reassignMentor(apiToken, prospectId, newMentorId);
    if (res.success) {
      setReassigning(null);
      setSelectedMentor("");
      await refreshMentorGroups();
    }
    setActionLoading(false);
  }

  const allMentorIds = useMemo(() => {
    return [...new Set(mentorGroups.map((g) => g.mentorId).filter(Boolean) as string[])];
  }, [mentorGroups]);

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

  if (loading && prospects.length === 0)
    return (
      <div>
        <div className="mb-6 flex flex-wrap gap-3">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-32" />
        </div>
        <SkeletonList rows={5} avatar />
      </div>
    );
  if (error) return <div className="text-danger">{error}</div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <Tabs value={viewMode}>
          <TabsList variant="default">
            <TabsTrigger value="list" onClick={() => setViewMode("list")}>
              List View
            </TabsTrigger>
            <TabsTrigger value="mentor" onClick={() => setViewMode("mentor")}>
              Mentor View
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {viewMode === "list" && (
          <>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by alias, nationality, steam ID, UUID..."
              className="min-w-64 flex-1"
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter((v as string) ?? "all")}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="accepted">Accepted</SelectItem>
                <SelectItem value="denied">Denied</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {viewMode === "mentor" ? (
        mentorLoading && mentorGroups.length === 0 ? (
          <SkeletonList rows={3} avatar />
        ) : (
          <div className="space-y-6">
            {mentorGroups.length === 0 ? (
              <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">No open prospects</div>
            ) : (
              mentorGroups.map((group) => (
                <div key={group.mentorId || "unclaimed"} className="facet-border rounded-sm bg-bg-card">
                  <div className="flex items-center gap-3 border-b border-border/50 px-5 py-3">
                    <div className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-sm border",
                      group.mentorId ? "border-accent/30 bg-accent/10" : "border-warning/30 bg-warning/10",
                    )}>
                      <Users className={cn("size-4", group.mentorId ? "text-accent" : "text-warning")} />
                    </div>
                    <div>
                      <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                        {group.mentorId ? displayName(group.mentorId) : "Unclaimed"}
                      </span>
                      <span className="ml-2 text-xs text-text-muted">{group.prospects.length} prospect{group.prospects.length !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                  <div className="divide-y divide-border/30">
                    {group.prospects.map((p) => (
                      <div key={p.id} className="flex items-center justify-between px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-text-primary">{p.alias}</span>
                              {p.pausedAt && <StatusBadge tone="warning">Paused</StatusBadge>}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-text-muted">
                              <span>{p.nationality}</span>
                              <span className="h-1 w-1 rounded-full bg-text-muted" />
                              <span>{p.squadHours}h</span>
                              <span className="h-1 w-1 rounded-full bg-text-muted" />
                              <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {canManage && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => p.pausedAt ? handleUnpause(p.id) : handlePause(p.id)}
                                disabled={actionLoading}
                              >
                                {p.pausedAt ? "Unpause" : "Pause"}
                              </Button>
                              <div className="flex items-center gap-1">
                                <Input
                                  type="number"
                                  min={1}
                                  max={30}
                                  value={extendDays[p.id] || 7}
                                  onChange={(e) => setExtendDays((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                                  className="h-7 w-14 px-1.5 text-xs"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleExtend(p.id)}
                                  disabled={actionLoading}
                                >
                                  Extend
                                </Button>
                              </div>
                            </>
                          )}
                          <Link
                            href={`/prospect/${p.uuid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex size-7 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
                            title="Open detail"
                          >
                            <ExternalLink className="size-3.5" />
                          </Link>
                          {canManage && (
                            reassigning === p.id ? (
                              <div className="flex items-center gap-1">
                                <Select
                                  value={selectedMentor || null}
                                  onValueChange={(v) => setSelectedMentor((v as string) ?? "")}
                                >
                                  <SelectTrigger size="sm" className="w-40">
                                    <SelectValue placeholder="Select mentor..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {allMentorIds
                                      .filter((id) => id !== p.mentorId)
                                      .map((id) => (
                                        <SelectItem key={id} value={id}>{displayName(id)}</SelectItem>
                                      ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  variant="outlineGold"
                                  size="sm"
                                  onClick={() => selectedMentor && handleReassign(p.id, selectedMentor)}
                                  disabled={!selectedMentor || actionLoading}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => { setReassigning(null); setSelectedMentor(""); }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => { setReassigning(p.id); setSelectedMentor(""); }}
                                disabled={actionLoading}
                              >
                                Reassign
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )
      ) : (
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
                          <User className="size-4 text-text-muted" />
                        </div>
                        <div>
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                              {p.alias}
                            </span>
                            <StatusBadge variant={ticketStatusVariant(p.status)} />
                            {p.pausedAt && <StatusBadge tone="warning">Paused</StatusBadge>}
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
                      <ChevronDown className={cn("size-5 text-text-muted transition-transform duration-200", expanded && "rotate-180")} />
                    </div>
                  </button>
                  <Link
                    href={`/prospect/${p.uuid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
                    title="Open in new tab"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                </div>

                {expanded && detail && (
                  <div className="border-t border-border/50 px-5 pb-5 pt-4">
                    <div className="mb-4 flex justify-end">
                      <DownloadButton text={exportProspectText(detail)} filename={`prospect-${detail.alias}.txt`} />
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
                        <div className="text-sm"><CopyableId value={detail.steamId} className="text-accent" /></div>
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
                                <StatusBadge tone="success">Yes: {yes}</StatusBadge>
                                <StatusBadge tone="danger">No: {no}</StatusBadge>
                                <StatusBadge tone="accent">Unsure: {unsure}</StatusBadge>
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
                              {msg.content && <p className="whitespace-pre-wrap text-sm text-text-secondary"><Linkify text={msg.content} /></p>}
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
      )}
    </div>
  );
}
