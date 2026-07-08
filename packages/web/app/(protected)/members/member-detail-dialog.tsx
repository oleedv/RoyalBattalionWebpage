"use client";

import { useEffect, useState } from "react";
import {
  updateUser,
  deleteUser,
  disableUser,
  enableUser,
  addMemberComment,
  deleteMemberComment,
} from "@/lib/api-client";
import type { UserWithRolesAndComments } from "shared";
import { COUNTRIES, validateCountry } from "shared";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CopyableId } from "@/components/copyable-id";
import { DescriptionList, InfoField } from "@/components/description-list";
import { StatusBadge } from "@/components/status-badge";
import { formatDate, formatRelativeTime } from "@/lib/format";

export type MemberDetailApi = {
  updateUser: typeof updateUser;
  deleteUser: typeof deleteUser;
  disableUser: typeof disableUser;
  enableUser: typeof enableUser;
  addMemberComment: typeof addMemberComment;
  deleteMemberComment: typeof deleteMemberComment;
};

export const defaultApi: MemberDetailApi = {
  updateUser,
  deleteUser,
  disableUser,
  enableUser,
  addMemberComment,
  deleteMemberComment,
};

export default function MemberDetailDialog({
  user,
  onClose,
  onChanged,
  onDeleted,
  canManage,
  isDeveloper,
  token,
  api = defaultApi,
}: {
  user: UserWithRolesAndComments | null;
  onClose: () => void;
  onChanged: (updated: UserWithRolesAndComments) => void;
  onDeleted: (id: string) => void;
  canManage: boolean;
  isDeveloper: boolean;
  token: string;
  api?: MemberDetailApi;
}) {
  const [current, setCurrent] = useState<UserWithRolesAndComments | null>(user);
  const [editing, setEditing] = useState(false);
  const [editSteamId, setEditSteamId] = useState("");
  const [editEosId, setEditEosId] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editMembershipDate, setEditMembershipDate] = useState("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [disableReason, setDisableReason] = useState("");
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    setCurrent(user);
    setEditing(false);
    setConfirmingDelete(false);
    setConfirmingDisable(false);
    setDisableReason("");
    setEditError(null);
    setCommentText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function startEdit() {
    if (!current) return;
    setEditing(true);
    setConfirmingDelete(false);
    setConfirmingDisable(false);
    setEditSteamId(current.steamId || "");
    setEditEosId(current.eosId || "");
    setEditCountry(current.country || "");
    setEditMembershipDate(
      current.membershipDate ? current.membershipDate.split("T")[0] : "",
    );
    setEditDateOfBirth(
      current.dateOfBirth ? current.dateOfBirth.split("T")[0] : "",
    );
    setEditError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    if (!token || !current) return;
    setEditError(null);

    if (editCountry.trim()) {
      const result = validateCountry(editCountry);
      if (!result.valid) {
        setEditError("Invalid country name");
        return;
      }
      setEditCountry(result.country);
    }

    const res = await api.updateUser(token, current.id, {
      steamId: editSteamId.trim() || undefined,
      eosId: editEosId.trim() || undefined,
      country: editCountry.trim() || undefined,
      membershipDate: editMembershipDate || null,
      dateOfBirth: editDateOfBirth || null,
    });

    if (res.success && res.data) {
      const updated = res.data as UserWithRolesAndComments;
      setCurrent(updated);
      onChanged(updated);
      setEditing(false);
    } else {
      setEditError(res.error || "Failed to update user");
    }
  }

  async function handleDelete() {
    if (!token || !current) return;
    const res = await api.deleteUser(token, current.id);
    if (res.success) {
      onDeleted(current.id);
      onClose();
    }
  }

  async function handleDisable() {
    if (!token || !current || !disableReason.trim()) return;
    const res = await api.disableUser(token, current.id, disableReason.trim());
    if (res.success) {
      const updated: UserWithRolesAndComments = {
        ...current,
        disabled: true,
        disabledAt: new Date().toISOString(),
        disabledReason: disableReason.trim(),
      };
      setCurrent(updated);
      onChanged(updated);
      setConfirmingDisable(false);
      setDisableReason("");
    }
  }

  async function handleEnable() {
    if (!token || !current) return;
    const res = await api.enableUser(token, current.id);
    if (res.success) {
      const updated: UserWithRolesAndComments = {
        ...current,
        disabled: false,
        disabledAt: null,
        disabledReason: null,
      };
      setCurrent(updated);
      onChanged(updated);
    }
  }

  async function handleAddComment() {
    if (!token || !current || !commentText.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      const res = await api.addMemberComment(token, current.id, commentText.trim());
      if (res.success && res.data) {
        const updated: UserWithRolesAndComments = {
          ...current,
          comments: [res.data, ...current.comments],
        };
        setCurrent(updated);
        onChanged(updated);
        setCommentText("");
      }
    } catch {
      // silent
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!token || !current) return;
    const res = await api.deleteMemberComment(token, current.id, commentId);
    if (res.success) {
      const updated: UserWithRolesAndComments = {
        ...current,
        comments: current.comments.filter((c) => c.id !== commentId),
      };
      setCurrent(updated);
      onChanged(updated);
    }
  }

  return (
    <>
      <Dialog open={user !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent
          showCloseButton={false}
          className="max-w-2xl sm:max-w-2xl bg-bg-secondary p-0"
        >
          {current && (
            <div>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <div className="flex items-center gap-4">
                  {current.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={current.avatarUrl}
                      alt=""
                      className="h-12 w-12 rounded-full"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-lg text-text-muted">
                      {(current.displayName || current.discordName)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <DialogTitle className="font-display text-lg font-semibold tracking-wide text-text-primary">
                        {current.displayName || current.discordName}
                      </DialogTitle>
                      {current.disabled && (
                        <StatusBadge tone="danger">Disabled</StatusBadge>
                      )}
                      {current.hasLoggedIn ? (
                        <StatusBadge tone="success">Logged In</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Discord Only</StatusBadge>
                      )}
                    </div>
                    <div className="text-xs text-text-muted">
                      {current.displayName
                        ? `${current.discordName} · ${current.discordId}`
                        : current.discordId}
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
                    {editing ? (
                      <input
                        type="text"
                        value={editSteamId}
                        onChange={(e) => setEditSteamId(e.target.value)}
                        className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-accent focus:border-accent focus:outline-none"
                        placeholder="Steam64 ID"
                      />
                    ) : current.steamId ? (
                      <CopyableId value={current.steamId} />
                    ) : (
                      <span className="text-text-muted">--</span>
                    )}
                  </InfoField>

                  <InfoField label="EOS ID">
                    {editing ? (
                      <input
                        type="text"
                        value={editEosId}
                        onChange={(e) => setEditEosId(e.target.value)}
                        className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                        placeholder="EOS ID"
                      />
                    ) : current.eosId ? (
                      <CopyableId value={current.eosId} />
                    ) : (
                      <span className="text-text-muted">--</span>
                    )}
                  </InfoField>

                  <InfoField label="Country">
                    {editing ? (
                      <>
                        <input
                          type="text"
                          list="member-detail-country-list"
                          value={editCountry}
                          onChange={(e) => setEditCountry(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                          placeholder="Country"
                        />
                        <datalist id="member-detail-country-list">
                          {COUNTRIES.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <span
                        className={
                          current.country ? "text-text-secondary" : "text-text-muted"
                        }
                      >
                        {current.country || "--"}
                      </span>
                    )}
                  </InfoField>

                  <InfoField label="Date of Birth">
                    {editing ? (
                      <input
                        type="date"
                        value={editDateOfBirth}
                        onChange={(e) => setEditDateOfBirth(e.target.value)}
                        className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                      />
                    ) : (
                      <span
                        className={
                          current.dateOfBirth ? "text-text-secondary" : "text-text-muted"
                        }
                      >
                        {current.dateOfBirth ? formatDate(current.dateOfBirth) : "--"}
                      </span>
                    )}
                  </InfoField>

                  <InfoField label="Membership Date">
                    {editing ? (
                      <input
                        type="date"
                        value={editMembershipDate}
                        onChange={(e) => setEditMembershipDate(e.target.value)}
                        className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                      />
                    ) : (
                      <span
                        className={
                          current.membershipDate
                            ? "text-text-secondary"
                            : "text-text-muted"
                        }
                      >
                        {current.membershipDate
                          ? formatDate(current.membershipDate)
                          : "--"}
                      </span>
                    )}
                  </InfoField>

                  <InfoField label="Joined">
                    <span className="text-text-secondary">
                      {formatDate(current.createdAt)}
                    </span>
                  </InfoField>

                  <InfoField label="Activity (30/90d)">
                    <span className="text-text-secondary">
                      {current.playtime30}h / {current.playtime90}h
                    </span>
                  </InfoField>

                  <InfoField label="Seed Time (30/90d)">
                    <span className="text-text-secondary">
                      {current.seed30}h / {current.seed90}h
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
                  {current.roles.length > 0 ? (
                    current.roles.map((role) => (
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
              <div className="border-b border-border px-6 py-4">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">
                  Comments ({current.comments.length})
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {current.comments.length === 0 ? (
                    <p className="text-sm text-text-muted">No comments yet.</p>
                  ) : (
                    current.comments.map((c) => (
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

              {/* Account Disabled panel (developer only) */}
              {current.disabled && isDeveloper && (
                <div className="border-b border-border px-6 py-4">
                  <div className="rounded-sm border border-danger/30 bg-danger/5 px-4 py-3">
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-danger">
                      Account Disabled
                    </div>
                    {current.disabledAt && (
                      <div className="text-xs text-text-muted">
                        Since {formatDate(current.disabledAt)}
                      </div>
                    )}
                    {current.disabledReason && (
                      <div className="mt-1 text-sm text-text-secondary">
                        {current.disabledReason}
                      </div>
                    )}
                    <button
                      onClick={handleEnable}
                      className="mt-2 rounded-sm bg-success/20 px-4 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/30"
                    >
                      Enable Account
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {canManage && (
                <div className="flex items-center justify-between px-6 py-4">
                  {editing ? (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={saveEdit}
                        className="rounded-sm bg-success/20 px-4 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/30"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="text-xs text-text-muted transition-colors hover:text-text-primary"
                      >
                        Cancel
                      </button>
                      {editError && (
                        <span className="text-xs text-danger">{editError}</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={startEdit}
                        className="rounded-sm border border-border px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setConfirmingDelete(true)}
                        className="rounded-sm border border-border px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-danger/40 hover:text-danger"
                      >
                        Delete
                      </button>
                      {isDeveloper && !current.disabled && (
                        <button
                          onClick={() => setConfirmingDisable(true)}
                          className="rounded-sm border border-border px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-danger/40 hover:text-danger"
                        >
                          Disable Account
                        </button>
                      )}
                    </div>
                  )}
                  <div />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmingDelete(false);
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this member?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDelete}
              className="rounded-sm bg-danger/20 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
            >
              Confirm
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Disable AlertDialog */}
      <AlertDialog
        open={confirmingDisable}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingDisable(false);
            setDisableReason("");
          }
        }}
      >
        <AlertDialogContent className="max-w-md sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Disable this account?</AlertDialogTitle>
            <AlertDialogDescription>
              This also removes their in-game whitelist (restored if re-enabled).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-1">
            <input
              type="text"
              value={disableReason}
              onChange={(e) => setDisableReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && disableReason.trim()) handleDisable();
              }}
              placeholder="Reason for disabling..."
              className="w-full rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-danger focus:outline-none"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <button
              onClick={handleDisable}
              disabled={!disableReason.trim()}
              className="rounded-sm bg-danger/20 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/30 disabled:opacity-40"
            >
              Confirm Disable
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
