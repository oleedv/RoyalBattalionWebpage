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

function CopyableId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = value.length > 12 ? value.slice(0, 8) + "..." : value;

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      onClick={handleCopy}
      title={value}
      className="group flex items-center gap-1 text-left"
    >
      <code className="text-text-secondary">{truncated}</code>
      <span className="text-[10px] text-text-muted opacity-0 transition-opacity group-hover:opacity-100">
        {copied ? "Copied!" : "Copy"}
      </span>
    </button>
  );
}

export default function MembersPage() {
  const { apiToken, hasPermission } = usePermissions();
  const [users, setUsers] = useState<UserWithRolesAndComments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteamId, setEditSteamId] = useState("");
  const [editEosId, setEditEosId] = useState("");
  const [editCountry, setEditCountry] = useState("");
  const [editMembershipDate, setEditMembershipDate] = useState("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Role sync
  const [syncing, setSyncing] = useState(false);

  // Comment modal
  const [commentUserId, setCommentUserId] = useState<string | null>(null);
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
      if (res.success && res.data) setUsers(res.data);
    } catch { /* silent */ }
  }, [apiToken]);

  useAutoRefresh(refreshUsers, 20_000, !!apiToken && !editingId && !deletingId);

  function startEdit(user: UserWithRolesAndComments) {
    setEditingId(user.id);
    setEditSteamId(user.steamId || "");
    setEditEosId(user.eosId || "");
    setEditCountry(user.country || "");
    setEditMembershipDate(user.membershipDate ? user.membershipDate.split("T")[0] : "");
    setEditDateOfBirth(user.dateOfBirth ? user.dateOfBirth.split("T")[0] : "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!apiToken) return;
    setEditError(null);

    const res = await updateUser(apiToken, id, {
      steamId: editSteamId.trim() || undefined,
      eosId: editEosId.trim() || undefined,
      country: editCountry.trim() || undefined,
      membershipDate: editMembershipDate || null,
      dateOfBirth: editDateOfBirth || null,
    });

    if (res.success && res.data) {
      setUsers((prev) => prev.map((u) => (u.id === id ? res.data! : u)));
      setEditingId(null);
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

  async function handleDelete(id: string) {
    if (!apiToken) return;

    const res = await deleteUser(apiToken, id);
    if (res.success) {
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setDeletingId(null);
    }
  }

  async function handleAddComment(userId: string) {
    if (!apiToken || !commentText.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      const res = await addMemberComment(apiToken, userId, commentText.trim());
      if (res.success && res.data) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? { ...u, comments: [res.data!, ...u.comments] }
              : u,
          ),
        );
        setCommentText("");
      }
    } catch {
      // silent
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleDeleteComment(userId: string, commentId: string) {
    if (!apiToken) return;
    const res = await deleteMemberComment(apiToken, userId, commentId);
    if (res.success) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, comments: u.comments.filter((c) => c.id !== commentId) }
            : u,
        ),
      );
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

  const memberColumns = useMemo(() => {
    const cols: Column<UserWithRolesAndComments>[] = [
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
          editingId === user.id ? (
            <input
              type="text"
              value={editSteamId}
              onChange={(e) => setEditSteamId(e.target.value)}
              className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-accent focus:border-accent focus:outline-none"
              placeholder="Steam64 ID"
            />
          ) : user.steamId ? (
            <code className="text-accent">{user.steamId}</code>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        key: "eosId",
        header: "EOS ID",
        render: (user) =>
          editingId === user.id ? (
            <input
              type="text"
              value={editEosId}
              onChange={(e) => setEditEosId(e.target.value)}
              className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
              placeholder="EOS ID"
            />
          ) : user.eosId ? (
            <CopyableId value={user.eosId} />
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        key: "country",
        header: "Country",
        render: (user) =>
          editingId === user.id ? (
            <input
              type="text"
              value={editCountry}
              onChange={(e) => setEditCountry(e.target.value)}
              className="w-24 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
              placeholder="Country"
            />
          ) : user.country ? (
            <span className="text-text-secondary">{user.country}</span>
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
        key: "membershipDate",
        header: "Membership",
        render: (user) =>
          editingId === user.id ? (
            <input
              type="date"
              value={editMembershipDate}
              onChange={(e) => setEditMembershipDate(e.target.value)}
              className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          ) : user.membershipDate ? (
            <span className="text-text-secondary">{formatDate(user.membershipDate)}</span>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        key: "dateOfBirth",
        header: "DOB",
        render: (user) =>
          editingId === user.id ? (
            <input
              type="date"
              value={editDateOfBirth}
              onChange={(e) => setEditDateOfBirth(e.target.value)}
              className="rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          ) : user.dateOfBirth ? (
            <span className="text-text-secondary">{formatDate(user.dateOfBirth)}</span>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        key: "activity",
        header: "Activity",
        render: (user) => (
          <span className="whitespace-nowrap text-xs" title="Matches played in last 30d / 90d">
            <span className={user.activity30 > 0 ? "text-success" : "text-text-muted"}>{user.activity30}</span>
            <span className="text-text-muted"> / </span>
            <span className={user.activity90 > 0 ? "text-text-secondary" : "text-text-muted"}>{user.activity90}</span>
          </span>
        ),
      },
      {
        key: "comments",
        header: "Comments",
        render: (user) => (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCommentUserId(user.id);
            }}
            className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent"
          >
            {user.comments.length > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent/15 px-1 text-[10px] font-bold text-accent">
                {user.comments.length}
              </span>
            ) : (
              <span className="text-text-muted hover:text-accent">+</span>
            )}
          </button>
        ),
      },
      {
        key: "joined",
        header: "Joined",
        render: (user) => (
          <span className="text-text-secondary">{formatDate(user.createdAt)}</span>
        ),
      },
    ];
    if (canManage) {
      cols.push({
        key: "actions",
        header: "Actions",
        render: (user) =>
          editingId === user.id ? (
            <div className="flex items-center gap-2">
              <button onClick={() => saveEdit(user.id)} className="text-xs text-success transition-colors hover:text-success/80">Save</button>
              <button onClick={cancelEdit} className="text-xs text-text-muted transition-colors hover:text-text-primary">Cancel</button>
              {editError && <span className="text-xs text-danger">{editError}</span>}
            </div>
          ) : deletingId === user.id ? (
            <div className="flex items-center gap-2">
              <button onClick={() => handleDelete(user.id)} className="text-xs text-danger transition-colors hover:text-danger/80">Confirm</button>
              <button onClick={() => setDeletingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">Cancel</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={() => startEdit(user)} className="text-xs text-text-muted transition-colors hover:text-accent">Edit</button>
              <button onClick={() => setDeletingId(user.id)} className="text-xs text-text-muted transition-colors hover:text-danger">Delete</button>
            </div>
          ),
      });
    }
    return cols;
  }, [canManage, editingId, deletingId, editSteamId, editEosId, editCountry, editMembershipDate, editDateOfBirth, editError]);

  if (loading) {
    return <div className="text-text-secondary">Loading members...</div>;
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  const commentUser = users.find((u) => u.id === commentUserId);

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
        />
      </div>

      {/* Comment modal */}
      <Modal
        open={!!commentUserId}
        onClose={() => {
          setCommentUserId(null);
          setCommentText("");
        }}
        className="max-w-lg bg-bg-secondary p-6"
      >
        {commentUser && (
          <>
            <h3 className="font-display mb-4 text-base font-semibold tracking-wide">
              Comments - {commentUser.discordName}
            </h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {commentUser.comments.length === 0 ? (
                <p className="text-sm text-text-muted">No comments yet.</p>
              ) : (
                commentUser.comments.map((c) => (
                  <div key={c.id} className="rounded-sm border border-border bg-bg-tertiary px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-accent">{c.authorName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-muted">
                          {formatRelativeTime(c.createdAt)}
                        </span>
                        {canManage && (
                          <button
                            onClick={() => handleDeleteComment(commentUser.id, c.id)}
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
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddComment(commentUser.id);
                  }}
                  placeholder="Add a comment..."
                  className="flex-1 rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  autoFocus
                />
                <button
                  onClick={() => handleAddComment(commentUser.id)}
                  disabled={!commentText.trim() || commentSaving}
                  className="rounded-sm bg-accent px-4 py-2 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
