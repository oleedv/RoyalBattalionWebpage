"use client";

import { useEffect, useState } from "react";
import {
  addWhitelistComment,
  deleteWhitelistComment,
  deleteWhitelistEntry,
  getAuditLogs,
  getPlaytime,
  getWhitelistEntry,
  updateWhitelistEntry,
} from "@/lib/api-client";
import type {
  AdminGroup,
  AuditLogEntry,
  Clan,
  PlaytimeStats,
  WhitelistEntry,
  WhitelistEntryWithComments,
} from "shared";
import { toastError } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DescriptionList, InfoField } from "@/components/description-list";
import { CopyableId } from "@/components/copyable-id";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate, formatRelativeTime } from "@/lib/format";
import { formatExpiry, getActionVerb, wlReadableChanges } from "./lib";

export interface ProfileDialogApi {
  updateWhitelistEntry: typeof updateWhitelistEntry;
  deleteWhitelistEntry: typeof deleteWhitelistEntry;
  getWhitelistEntry: typeof getWhitelistEntry;
  addWhitelistComment: typeof addWhitelistComment;
  deleteWhitelistComment: typeof deleteWhitelistComment;
  getPlaytime: typeof getPlaytime;
  getAuditLogs: typeof getAuditLogs;
}
export interface ProfileDialogNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

// Exported: entries-tab reuses these (table expiry cells + merged api default).
export const defaultApi: ProfileDialogApi = {
  updateWhitelistEntry,
  deleteWhitelistEntry,
  getWhitelistEntry,
  addWhitelistComment,
  deleteWhitelistComment,
  getPlaytime,
  getAuditLogs,
};
const defaultNotify: ProfileDialogNotify = { error: toastError };

export function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  const exp = formatExpiry(expiresAt);
  if (!exp) return <StatusBadge variant="wl-permanent" />;
  if (exp.expired) return <StatusBadge variant="wl-expired" />;
  return <StatusBadge variant="wl-expiring">{exp.label}</StatusBadge>;
}

export default function EntryProfileDialog({
  entry,
  onClose,
  groups,
  clans,
  token,
  canManage,
  onUpdated,
  onDeleted,
  api = defaultApi,
  notify = defaultNotify,
}: {
  entry: WhitelistEntryWithComments | null;
  onClose: () => void;
  groups: AdminGroup[];
  clans: Clan[];
  token: string | null;
  canManage: boolean;
  onUpdated: (entry: WhitelistEntry) => void;
  onDeleted: (id: string) => void;
  api?: ProfileDialogApi;
  notify?: ProfileDialogNotify;
}) {
  const [current, setCurrent] = useState<WhitelistEntryWithComments | null>(entry);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editSteamId, setEditSteamId] = useState("");
  const [editName, setEditName] = useState("");
  const [editClanId, setEditClanId] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [activityLogs, setActivityLogs] = useState<AuditLogEntry[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [expandedActivity, setExpandedActivity] = useState<Set<string>>(new Set());
  const [playtimeStats, setPlaytimeStats] = useState<PlaytimeStats | null>(null);
  const [playtimeLoading, setPlaytimeLoading] = useState(false);

  // Reset the working copy and per-entry state whenever a new entry opens.
  useEffect(() => {
    setCurrent(entry);
    setEditing(false);
    setConfirmingDelete(false);
    setEditError(null);
    setCommentText("");
    setActivityLogs([]);
    setActivityOpen(false);
    setExpandedActivity(new Set());
    setPlaytimeStats(null);
    if (entry && token) {
      setPlaytimeLoading(true);
      api
        .getPlaytime(token, entry.steamId)
        .then((pt) => {
          if (pt.success && pt.data) setPlaytimeStats(pt.data);
        })
        .finally(() => setPlaytimeLoading(false));
    }
  }, [entry, token, api]);

  function startEdit() {
    if (!current) return;
    setEditSteamId(current.steamId);
    setEditName(current.name || "");
    setEditClanId(current.clanId || "");
    setEditGroupId(current.groupId || "");
    setEditReason(current.reason || "");
    setEditExpiresAt(current.expiresAt ? current.expiresAt.slice(0, 16) : "");
    setEditError(null);
    setEditing(true);
    setConfirmingDelete(false);
  }

  async function saveEdit() {
    if (!token || !current) return;
    setEditError(null);

    const selectedClan = clans.find((c) => c.id === editClanId);
    const res = await api.updateWhitelistEntry(token, current.id, {
      steamId: editSteamId.trim(),
      name: editName.trim() || undefined,
      clanId: editClanId || null,
      clan: selectedClan?.tag || undefined,
      groupId: editGroupId || null,
      reason: editReason.trim() || undefined,
      expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
    });

    if (res.success && res.data) {
      onUpdated(res.data);
      // Refresh the working copy (comments + resolved names)
      const refreshed = await api.getWhitelistEntry(token, current.id);
      if (refreshed.success && refreshed.data) setCurrent(refreshed.data);
      setEditing(false);
    } else {
      setEditError(res.error || "Failed to update entry");
    }
  }

  async function handleDelete() {
    if (!token || !current) return;
    const res = await api.deleteWhitelistEntry(token, current.id);
    if (res.success) {
      onDeleted(current.id);
      onClose();
    } else {
      notify.error(res.error, "Failed to delete entry");
    }
  }

  async function handleAddComment() {
    if (!token || !current || !commentText.trim()) return;
    setCommentSaving(true);
    const res = await api.addWhitelistComment(token, current.id, commentText.trim());
    if (res.success && res.data) {
      setCurrent((prev) =>
        prev ? { ...prev, comments: [res.data!, ...prev.comments] } : prev,
      );
      setCommentText("");
    } else {
      notify.error(res.error, "Failed to add comment");
    }
    setCommentSaving(false);
  }

  async function handleDeleteComment(commentId: string) {
    if (!token || !current) return;
    const res = await api.deleteWhitelistComment(token, current.id, commentId);
    if (res.success) {
      setCurrent((prev) =>
        prev
          ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) }
          : prev,
      );
    } else {
      notify.error(res.error, "Failed to delete comment");
    }
  }

  async function loadActivity() {
    if (!token || !current) return;
    setActivityLoading(true);
    const res = await api.getAuditLogs(token, {
      resource: "WhitelistEntry",
      resourceId: current.id,
      limit: 50,
    });
    if (res.success && res.data) setActivityLogs(res.data.items);
    setActivityLoading(false);
  }

  function toggleActivity() {
    if (!activityOpen) {
      setActivityOpen(true);
      loadActivity();
    } else {
      setActivityOpen(false);
    }
  }

  function toggleExpandedActivity(id: string) {
    setExpandedActivity((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getCommentPreview(log: AuditLogEntry): string | null {
    if (log.action !== "whitelist.comment.add") return null;
    const preview = (log.detail as { textPreview?: unknown } | null)?.textPreview;
    return typeof preview === "string" && preview.length > 0 ? preview : null;
  }

  return (
    <Dialog open={entry !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl gap-0 p-0">
        {current && (
          <>
            <DialogHeader className="border-b border-border px-6 py-4">
              <DialogTitle className="font-display text-lg font-semibold tracking-wide">
                {current.name || "Unnamed"}
              </DialogTitle>
            </DialogHeader>

            {/* Info grid */}
            <div className="border-b border-border px-6 py-4">
              <DescriptionList className="gap-4 sm:grid-cols-2 lg:grid-cols-2">
                <InfoField label="Steam ID" mono>
                  <CopyableId value={current.steamId} />
                </InfoField>
                {editing && (
                  <InfoField label="Name">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Name" />
                  </InfoField>
                )}
                <InfoField label="Clan">
                  {editing ? (
                    <select value={editClanId} onChange={(e) => setEditClanId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                      <option value="">No Clan</option>
                      {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
                    </select>
                  ) : (
                    current.clanName || current.clan || <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Group">
                  {editing ? (
                    <select value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                      <option value="">None</option>
                      {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                  ) : current.groupName ? (
                    <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs text-accent">{current.groupName}</span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Reason">
                  {editing ? (
                    <Input value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Reason" />
                  ) : (
                    current.reason || <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Expires">
                  {editing ? (
                    <Input type="datetime-local" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} />
                  ) : (
                    <ExpiryBadge expiresAt={current.expiresAt} />
                  )}
                </InfoField>
                <InfoField label="Added By">{current.addedByName || current.addedBy}</InfoField>
                <InfoField label="Added">{formatDate(current.createdAt)}</InfoField>
                <InfoField label="Playtime (30/90d)">
                  {playtimeLoading ? (
                    <Skeleton className="h-3 w-24" />
                  ) : playtimeStats ? (
                    <span className="text-text-secondary">{playtimeStats.playtime30}h / {playtimeStats.playtime90}h</span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </InfoField>
                <InfoField label="Seed Time (30/90d)">
                  {playtimeLoading ? (
                    <Skeleton className="h-3 w-24" />
                  ) : playtimeStats ? (
                    <span className="text-text-secondary">{playtimeStats.seed30}h / {playtimeStats.seed90}h</span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </InfoField>
              </DescriptionList>
            </div>

            {/* Comments */}
            <div className="border-b border-border px-6 py-4">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                Comments ({current.comments.length})
              </h3>
              {current.comments.length > 0 && (
                <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
                  {current.comments.map((comment) => (
                    <div key={comment.id} className="rounded-sm bg-bg-tertiary px-3 py-2">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-accent">{comment.authorName}</span>
                          <span className="text-[10px] text-text-muted">{formatRelativeTime(comment.createdAt)}</span>
                        </div>
                        {canManage && (
                          <button onClick={() => handleDeleteComment(comment.id)} className="text-[10px] text-text-muted transition-colors hover:text-danger">
                            delete
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-text-secondary">{comment.text}</div>
                    </div>
                  ))}
                </div>
              )}
              {canManage && (
                <div className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddComment(); }}
                  />
                  <Button variant="gold" size="sm" onClick={handleAddComment} disabled={commentSaving || !commentText.trim()}>
                    {commentSaving ? "..." : "Add"}
                  </Button>
                </div>
              )}
            </div>

            {/* Activity (collapsible, lazy-loaded) */}
            <div className="border-b border-border px-6 py-4">
              <button
                onClick={toggleActivity}
                className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-[0.15em] text-text-muted transition-colors hover:text-text-secondary"
              >
                <span>Activity</span>
                <svg className={`h-4 w-4 transition-transform ${activityOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {activityOpen && (
                <div className="mt-3">
                  {activityLoading ? (
                    <Skeleton className="h-3 w-32" />
                  ) : activityLogs.length === 0 ? (
                    <div className="text-xs text-text-muted">No activity recorded.</div>
                  ) : (
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {activityLogs.map((log) => {
                        const changes = wlReadableChanges(
                          (log.detail as { changes?: unknown } | null)?.changes,
                          groups,
                          clans,
                        );
                        const commentPreview = getCommentPreview(log);
                        const isExpanded = expandedActivity.has(log.id);
                        const exactTime = new Date(log.createdAt).toLocaleString();
                        return (
                          <div key={log.id} className="text-xs text-text-secondary">
                            <div className="flex items-baseline">
                              <span className="font-medium text-text-primary">{log.userName}</span>
                              <span className="ml-1">
                                {" "}
                                {changes.length > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpandedActivity(log.id)}
                                    className="text-text-secondary hover:text-text-primary"
                                  >
                                    updated entry ({changes.length} {changes.length === 1 ? "change" : "changes"})
                                    <span className="ml-1 inline-block">{isExpanded ? "▾" : "▸"}</span>
                                  </button>
                                ) : commentPreview ? (
                                  <span title={commentPreview}>
                                    added a comment: &ldquo;{commentPreview.length > 60 ? `${commentPreview.slice(0, 60)}…` : commentPreview}&rdquo;
                                  </span>
                                ) : (
                                  getActionVerb(log.action)
                                )}
                              </span>
                              <span className="ml-1.5 text-text-muted" title={exactTime}>
                                {formatRelativeTime(log.createdAt)}
                              </span>
                            </div>
                            {changes.length > 0 && isExpanded && (
                              <ul className="mt-1 ml-3 space-y-0.5 text-text-muted">
                                {changes.map((c) => (
                                  <li key={c.key}>
                                    <span className="text-text-secondary">{c.label}:</span>{" "}
                                    <span>{c.from}</span>
                                    <span className="mx-1">→</span>
                                    <span className="text-text-primary">{c.to}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions footer */}
            {canManage && (
              <div className="px-6 py-4">
                {editing ? (
                  <div className="flex items-center gap-3">
                    <Button variant="gold" size="sm" onClick={saveEdit}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setEditError(null); }}>
                      Cancel
                    </Button>
                    {editError && <span className="text-xs text-danger">{editError}</span>}
                  </div>
                ) : confirmingDelete ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-danger">Delete this entry?</span>
                    <Button variant="destructive" size="sm" onClick={handleDelete}>Confirm</Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <Button variant="outline" size="sm" onClick={startEdit}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={() => setConfirmingDelete(true)}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
