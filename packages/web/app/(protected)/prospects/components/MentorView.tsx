"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getMentorGroups,
  pauseProspect,
  unpauseProspect,
  extendProspect,
  reassignMentor,
  resolveDiscordNames,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { SkeletonList } from "@/components/skeleton";
import { formatDate } from "@/lib/format";
import type { MentorGroup } from "shared";

export function MentorView({ apiToken, canManage }: { apiToken: string; canManage: boolean }) {
  const [mentorGroups, setMentorGroups] = useState<MentorGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [extendDays, setExtendDays] = useState<Record<number, number>>({});
  const [reassigning, setReassigning] = useState<number | null>(null);
  const [selectedMentor, setSelectedMentor] = useState("");

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

  const refresh = useCallback(async () => {
    const res = await getMentorGroups(apiToken);
    if (res.success && res.data) {
      setMentorGroups(res.data);
      const ids = res.data.flatMap((g) => [g.mentorId, ...g.prospects.map((p) => p.userId)].filter(Boolean) as string[]);
      resolveNames(ids);
    }
    setLoading(false);
  }, [apiToken]);

  useEffect(() => { refresh(); }, [refresh]);
  useAutoRefresh(refresh, 20_000, !actionLoading);

  async function handlePause(id: number, paused: boolean) {
    setActionLoading(true);
    const res = paused ? await unpauseProspect(apiToken, id) : await pauseProspect(apiToken, id);
    if (res.success) await refresh();
    setActionLoading(false);
  }

  async function handleExtend(id: number) {
    setActionLoading(true);
    const res = await extendProspect(apiToken, id, extendDays[id] || 7);
    if (res.success) await refresh();
    setActionLoading(false);
  }

  async function handleReassign(prospectId: number, newMentorId: string) {
    setActionLoading(true);
    const res = await reassignMentor(apiToken, prospectId, newMentorId);
    if (res.success) {
      setReassigning(null);
      setSelectedMentor("");
      await refresh();
    }
    setActionLoading(false);
  }

  const allMentorIds = useMemo(
    () => [...new Set(mentorGroups.map((g) => g.mentorId).filter(Boolean) as string[])],
    [mentorGroups],
  );

  if (loading && mentorGroups.length === 0) return <SkeletonList rows={3} avatar />;

  if (mentorGroups.length === 0) {
    return <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">No open prospects</div>;
  }

  return (
    <div className="space-y-6">
      {mentorGroups.map((group) => (
        <div key={group.mentorId || "unclaimed"} className="facet-border rounded-sm bg-bg-card">
          <div className="flex items-center gap-3 border-b border-border/50 px-5 py-3">
            <div className={`flex h-8 w-8 items-center justify-center rounded-sm border ${group.mentorId ? "border-accent/30 bg-accent/10" : "border-warning/30 bg-warning/10"}`}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${group.mentorId ? "text-accent" : "text-warning"}`}>
                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
              </svg>
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
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-primary">{p.alias}</span>
                    {p.pausedAt && (
                      <span className="rounded-sm border border-warning/30 bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">Paused</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span>{p.nationality}</span>
                    <span className="h-1 w-1 rounded-full bg-text-muted" />
                    <span>{p.squadHours}h</span>
                    <span className="h-1 w-1 rounded-full bg-text-muted" />
                    <span>{formatDate(p.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {canManage && (
                    <>
                      <button
                        onClick={() => handlePause(p.id, !!p.pausedAt)}
                        disabled={actionLoading}
                        className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-50"
                      >
                        {p.pausedAt ? "Unpause" : "Pause"}
                      </button>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          value={extendDays[p.id] || 7}
                          onChange={(e) => setExtendDays((prev) => ({ ...prev, [p.id]: Number(e.target.value) }))}
                          className="w-12 rounded-sm border border-border bg-bg-tertiary/50 px-1.5 py-1 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
                        />
                        <button
                          onClick={() => handleExtend(p.id)}
                          disabled={actionLoading}
                          className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-50"
                        >
                          Extend
                        </button>
                      </div>
                    </>
                  )}
                  <a
                    href={`/prospect/${p.uuid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-bg-tertiary hover:text-accent"
                    title="Open detail"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                      <path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
                    </svg>
                  </a>
                  {canManage && (
                    reassigning === p.id ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={selectedMentor}
                          onChange={(e) => setSelectedMentor(e.target.value)}
                          className="rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1 text-xs text-text-primary focus:border-accent/50 focus:outline-none"
                        >
                          <option value="">Select mentor...</option>
                          {allMentorIds.filter((id) => id !== p.mentorId).map((id) => (
                            <option key={id} value={id}>{displayName(id)}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => selectedMentor && handleReassign(p.id, selectedMentor)}
                          disabled={!selectedMentor || actionLoading}
                          className="rounded-sm bg-accent/15 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/25 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => { setReassigning(null); setSelectedMentor(""); }}
                          className="rounded-sm px-2 py-1 text-xs text-text-muted transition-colors hover:text-text-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setReassigning(p.id); setSelectedMentor(""); }}
                        disabled={actionLoading}
                        className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary disabled:opacity-50"
                      >
                        Reassign
                      </button>
                    )
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
