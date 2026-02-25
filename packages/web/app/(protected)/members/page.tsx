"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { getUsers, updateUser, deleteUser, syncUserRoles, addMemberComment, deleteMemberComment } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable, type Column } from "@/components/data-table";
import { SearchInput } from "@/components/search-input";
import { Modal } from "@/components/modal";
import { formatDate, formatRelativeTime } from "@/lib/format";
import type { UserWithRolesAndComments } from "shared";

function CopyableId({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      title={value}
      className="group flex items-center gap-1.5 text-left"
    >
      <code className="text-text-secondary">{label ?? value}</code>
      <span className="text-[10px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className="text-sm text-text-primary">{children}</div>
    </div>
  );
}

export default function MembersPage() {
  const { apiToken, hasPermission } = usePermissions();
  const [users, setUsers] = useState<UserWithRolesAndComments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");

  // Detail modal
  const [selectedUser, setSelectedUser] = useState<UserWithRolesAndComments | null>(null);

  // Edit state (within modal)
  const [editing, setEditing] = useState(false);
  const [editSteamId, setEditSteamId] = useState("");
  const [editEosId, setEditEosId] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editMembershipDate, setEditMembershipDate] = useState("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Role sync
  const [syncing, setSyncing] = useState(false);

  // Comment state
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const canManage = hasPermission("manage:members");

  useEffect(() => {
    async function init() {
      if (!apiToken) return;
      try {
        const res = await getUsers(apiToken);
        if (res.success && res.data) {
          setUsers(res.data);
        } else {
          setError(res.error || "Failed to load members");
        }
      } catch {
        setError("Failed to initialize");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [apiToken]);

  const refreshUsers = useCallback(async () => {
    if (!apiToken) return;
    try {
      const res = await getUsers(apiToken);
      if (res.success && res.data) {
        setUsers(res.data);
        // Keep selectedUser in sync
        if (selectedUser) {
          const updated = res.data.find((u) => u.id === selectedUser.id);
          if (updated) setSelectedUser(updated);
        }
      }
    } catch { /* silent */ }
  }, [apiToken, selectedUser]);

  useAutoRefresh(refreshUsers, 20_000, !!apiToken && !editing && !confirmingDelete);

  function openDetail(user: UserWithRolesAndComments) {
    setSelectedUser(user);
    setEditing(false);
    setConfirmingDelete(false);
    setEditError(null);
    setCommentText("");
  }

  function closeDetail() {
    setSelectedUser(null);
    setEditing(false);
    setConfirmingDelete(false);
    setEditError(null);
    setCommentText("");
  }

  function startEdit() {
    if (!selectedUser) return;
    setEditing(true);
    setConfirmingDelete(false);
    setEditSteamId(selectedUser.steamId || "");
    setEditEosId(selectedUser.eosId || "");
    setEditCountry(selectedUser.country || "");
    setEditMembershipDate(selectedUser.membershipDate ? selectedUser.membershipDate.split("T")[0] : "");
    setEditDateOfBirth(selectedUser.dateOfBirth ? selectedUser.dateOfBirth.split("T")[0] : "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditing(false);
    setEditError(null);
  }

  async function saveEdit() {
    if (!apiToken || !selectedUser) return;
    setEditError(null);

    const res = await updateUser(apiToken, selectedUser.id, {
      steamId: editSteamId.trim() || undefined,
      eosId: editEosId.trim() || undefined,
      country: editCountry.trim() || undefined,
      membershipDate: editMembershipDate || null,
      dateOfBirth: editDateOfBirth || null,
    });

    if (res.success && res.data) {
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? res.data! : u)));
      setSelectedUser(res.data);
      setEditing(false);
    } else {
      setEditError(res.error || "Failed to update user");
    }
  }

  async function handleSyncRoles() {
    if (!apiToken || syncing) return;
    setSyncing(true);
    try {
      const syncRes = await syncUserRoles(apiToken);
      if (syncRes.success) {
        const res = await getUsers(apiToken);
        if (res.success && res.data) {
          setUsers(res.data);
        }
      }
    } catch {
      // silent
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    if (!apiToken || !selectedUser) return;

    const res = await deleteUser(apiToken, selectedUser.id);
    if (res.success) {
      setUsers((prev) => prev.filter((u) => u.id !== selectedUser.id));
      closeDetail();
    }
  }

  async function handleAddComment() {
    if (!apiToken || !selectedUser || !commentText.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      const res = await addMemberComment(apiToken, selectedUser.id, commentText.trim());
      if (res.success && res.data) {
        const updated = { ...selectedUser, comments: [res.data, ...selectedUser.comments] };
        setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? updated : u)));
        setSelectedUser(updated);
        setCommentText("");
      }
    } catch {
      // silent
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!apiToken || !selectedUser) return;
    const res = await deleteMemberComment(apiToken, selectedUser.id, commentId);
    if (res.success) {
      const updated = { ...selectedUser, comments: selectedUser.comments.filter((c) => c.id !== commentId) };
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? updated : u)));
      setSelectedUser(updated);
    }
  }

  const filtered = search
    ? users.filter(
        (u) =>
          u.discordName.toLowerCase().includes(search.toLowerCase()) ||
          u.steamId?.includes(search) ||
          u.eosId?.includes(search) ||
          u.discordId.includes(search),
      )
    : users;

  const memberColumns = useMemo<Column<UserWithRolesAndComments>[]>(() => [
    {
      key: "member",
      header: "Member",
      render: (user) => (
        <div className="flex items-center gap-3">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tertiary text-xs text-text-muted">
              {user.discordName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="font-medium text-text-primary">{user.discordName}</div>
            <div className="text-xs text-text-muted">{user.discordId}</div>
          </div>
        </div>
      ),
    },
    {
      key: "steamId",
      header: "Steam ID",
      render: (user) =>
        user.steamId ? (
          <code className="text-accent">{user.steamId}</code>
        ) : (
          <span className="text-text-muted">--</span>
        ),
    },
    {
      key: "roles",
      header: "Roles",
      render: (user) => (
        <div className="flex flex-wrap gap-1">
          {user.roles.length > 0 ? (
            user.roles.map((role) => (
              <span
                key={role.id}
                className="rounded-sm border border-accent/15 bg-accent/5 px-2 py-0.5 text-xs text-accent/80"
              >
                {role.name}
              </span>
            ))
          ) : (
            <span className="text-text-muted">--</span>
          )}
        </div>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      render: (user) => (
        <span className="text-text-secondary">{formatDate(user.createdAt)}</span>
      ),
    },
    {
      key: "country",
      header: "Country",
      render: (user) =>
        user.country ? (
          <span className="text-text-secondary">{user.country}</span>
        ) : (
          <span className="text-text-muted">--</span>
        ),
    },
  ], []);

  if (loading) {
    return <div className="text-text-secondary">Loading members...</div>;
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">
          Members
        </h1>
        <div className="flex items-center gap-3">
          {canManage && (
            <button
              onClick={handleSyncRoles}
              disabled={syncing}
              className="rounded-sm border border-border px-4 py-1.5 text-xs font-medium tracking-wide text-text-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-40"
            >
              {syncing ? "Syncing..." : "Refresh Roles"}
            </button>
          )}
          <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
            {users.length} members
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, Steam ID, EOS ID, or Discord ID..."
          className="w-full"
        />
      </div>

      {/* Members table */}
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        <DataTable<UserWithRolesAndComments>
          columns={memberColumns}
          data={filtered}
          keyExtractor={(user) => user.id}
          emptyMessage={search ? "No members match your search" : "No members found"}
          onRowClick={openDetail}
        />
      </div>

      {/* Member detail modal */}
      <Modal
        open={!!selectedUser}
        onClose={closeDetail}
        className="max-w-2xl bg-bg-secondary p-0"
      >
        {selectedUser && (
          <div>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-4">
                {selectedUser.avatarUrl ? (
                  <img src={selectedUser.avatarUrl} alt="" className="h-12 w-12 rounded-full" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-lg text-text-muted">
                    {selectedUser.discordName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="font-display text-lg font-semibold tracking-wide text-text-primary">
                    {selectedUser.discordName}
                  </h2>
                  <div className="text-xs text-text-muted">{selectedUser.discordId}</div>
                </div>
              </div>
              <button
                onClick={closeDetail}
                className="text-text-muted transition-colors hover:text-text-primary"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4 border-b border-border px-6 py-4">
              <InfoField label="Steam ID">
                {editing ? (
                  <input
                    type="text"
                    value={editSteamId}
                    onChange={(e) => setEditSteamId(e.target.value)}
                    className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-accent focus:border-accent focus:outline-none"
                    placeholder="Steam64 ID"
                  />
                ) : selectedUser.steamId ? (
                  <CopyableId value={selectedUser.steamId} />
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
                ) : selectedUser.eosId ? (
                  <CopyableId value={selectedUser.eosId} />
                ) : (
                  <span className="text-text-muted">--</span>
                )}
              </InfoField>

              <InfoField label="Country">
                {editing ? (
                  <input
                    type="text"
                    value={editCountry}
                    onChange={(e) => setEditCountry(e.target.value)}
                    className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                    placeholder="Country"
                  />
                ) : (
                  <span className={selectedUser.country ? "text-text-secondary" : "text-text-muted"}>
                    {selectedUser.country || "--"}
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
                  <span className={selectedUser.dateOfBirth ? "text-text-secondary" : "text-text-muted"}>
                    {selectedUser.dateOfBirth ? formatDate(selectedUser.dateOfBirth) : "--"}
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
                  <span className={selectedUser.membershipDate ? "text-text-secondary" : "text-text-muted"}>
                    {selectedUser.membershipDate ? formatDate(selectedUser.membershipDate) : "--"}
                  </span>
                )}
              </InfoField>

              <InfoField label="Joined">
                <span className="text-text-secondary">{formatDate(selectedUser.createdAt)}</span>
              </InfoField>

              <InfoField label="Activity (30d)">
                <span className={selectedUser.activity30 > 0 ? "text-success" : "text-text-muted"}>
                  {selectedUser.activity30} matches
                </span>
              </InfoField>

              <InfoField label="Activity (90d)">
                <span className={selectedUser.activity90 > 0 ? "text-text-secondary" : "text-text-muted"}>
                  {selectedUser.activity90} matches
                </span>
              </InfoField>
            </div>

            {/* Roles */}
            <div className="border-b border-border px-6 py-4">
              <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-text-muted">Roles</div>
              <div className="flex flex-wrap gap-1.5">
                {selectedUser.roles.length > 0 ? (
                  selectedUser.roles.map((role) => (
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
                Comments ({selectedUser.comments.length})
              </div>
              <div className="max-h-48 space-y-2 overflow-y-auto">
                {selectedUser.comments.length === 0 ? (
                  <p className="text-sm text-text-muted">No comments yet.</p>
                ) : (
                  selectedUser.comments.map((c) => (
                    <div key={c.id} className="rounded-sm border border-border bg-bg-tertiary px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-accent">{c.authorName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-text-muted">
                            {formatRelativeTime(c.createdAt)}
                          </span>
                          {canManage && (
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
                    {editError && <span className="text-xs text-danger">{editError}</span>}
                  </div>
                ) : confirmingDelete ? (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-danger">Delete this member?</span>
                    <button
                      onClick={handleDelete}
                      className="rounded-sm bg-danger/20 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/30"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(false)}
                      className="text-xs text-text-muted transition-colors hover:text-text-primary"
                    >
                      Cancel
                    </button>
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
                  </div>
                )}
                <div />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
