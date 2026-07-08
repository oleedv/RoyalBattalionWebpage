"use client";

import { useEffect, useState } from "react";
import { addMemberComment, deleteMemberComment } from "@/lib/api-client";
import type { UserWithRolesAndComments } from "shared";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CopyableId } from "@/components/copyable-id";
import { DescriptionList, InfoField } from "@/components/description-list";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatRelativeTime } from "@/lib/format";

export type DiscordUserCommentApi = {
  addMemberComment: typeof addMemberComment;
  deleteMemberComment: typeof deleteMemberComment;
};

export const defaultApi: DiscordUserCommentApi = {
  addMemberComment,
  deleteMemberComment,
};

export default function DiscordUserDetailDialog({
  user,
  onClose,
  onChanged,
  canManage,
  isDeveloper,
  token,
  api = defaultApi,
}: {
  user: UserWithRolesAndComments | null;
  onClose: () => void;
  onChanged: () => void;
  canManage: boolean;
  isDeveloper: boolean;
  token: string;
  api?: DiscordUserCommentApi;
}) {
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    setCommentText("");
  }, [userId]);

  async function handleAddComment() {
    if (!token || !user || !commentText.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      const res = await api.addMemberComment(token, user.id, commentText.trim());
      if (res.success) {
        setCommentText("");
        onChanged();
      }
    } catch {
      // silent
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!token || !user) return;
    try {
      const res = await api.deleteMemberComment(token, user.id, commentId);
      if (res.success) {
        onChanged();
      }
    } catch { /* silent */ }
  }

  return (
    <Dialog open={user !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl sm:max-w-2xl bg-bg-secondary p-0"
      >
        {user && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-4">
                {user.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={user.avatarUrl} alt="" className="h-12 w-12 rounded-full" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-lg text-text-muted">
                    {(user.displayName || user.discordName).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="font-display text-lg font-semibold tracking-wide text-text-primary">
                      {user.displayName || user.discordName}
                    </DialogTitle>
                    {user.hasLoggedIn ? (
                      <StatusBadge tone="success">Logged In</StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">Discord Only</StatusBadge>
                    )}
                  </div>
                  <div className="text-xs text-text-muted">
                    {user.displayName
                      ? `${user.discordName} · ${user.discordId}`
                      : user.discordId}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-text-muted transition-colors hover:text-text-primary"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            {/* Info grid */}
            <div className="border-b border-border px-6 py-4">
              <DescriptionList className="grid-cols-2 lg:grid-cols-2">
                <InfoField label="Steam ID">
                  {user.steamId ? (
                    <CopyableId value={user.steamId} />
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </InfoField>

                <InfoField label="EOS ID">
                  {user.eosId ? (
                    <CopyableId value={user.eosId} />
                  ) : (
                    <span className="text-text-muted">--</span>
                  )}
                </InfoField>

                <InfoField label="Country">
                  <span className={user.country ? "text-text-secondary" : "text-text-muted"}>
                    {user.country || "--"}
                  </span>
                </InfoField>

                <InfoField label="Joined">
                  <span className="text-text-secondary">{formatDate(user.createdAt)}</span>
                </InfoField>

                <InfoField label="Activity (30/90d)">
                  <span className="text-text-secondary">
                    {user.playtime30}h / {user.playtime90}h
                  </span>
                </InfoField>

                <InfoField label="Seed Time (30/90d)">
                  <span className="text-text-secondary">
                    {user.seed30}h / {user.seed90}h
                  </span>
                </InfoField>
              </DescriptionList>
            </div>

            {/* Roles */}
            <div className="border-b border-border px-6 py-4">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Roles
              </div>
              <div className="flex flex-wrap gap-1.5">
                {user.roles.length > 0 ? (
                  user.roles.map((role) => (
                    <span
                      key={role.id}
                      className="rounded-sm border border-accent/15 bg-accent/5 px-2.5 py-1 text-xs text-accent/80"
                    >
                      {role.name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-text-muted">No roles assigned</span>
                )}
              </div>
            </div>

            {/* Comments */}
            <div className="px-6 py-4">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Comments ({user.comments.length})
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {user.comments.length === 0 ? (
                  <p className="text-sm text-text-muted">No comments yet.</p>
                ) : (
                  user.comments.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-sm border border-border bg-bg-tertiary px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-accent">
                          {c.authorName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted">
                            {formatRelativeTime(c.createdAt)}
                          </span>
                          {isDeveloper && (
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              className="text-[10px] text-text-muted transition-colors hover:text-danger"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1 text-sm text-text-primary">{c.text}</p>
                    </div>
                  ))
                )}
              </div>
              {canManage && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddComment();
                    }}
                    placeholder="Add a comment..."
                    className="flex-1 rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!commentText.trim() || commentSaving}
                    className="rounded-sm bg-accent px-4 py-2 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
