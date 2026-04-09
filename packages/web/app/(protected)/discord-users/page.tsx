"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getUsers,
  getRoles,
  addMemberComment,
  deleteMemberComment,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Modal } from "@/components/modal";
import { formatDate, formatRelativeTime } from "@/lib/format";
import type { UserWithRolesAndComments } from "shared";
import type { DiscordRole } from "shared";

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

export default function DiscordUsersPage() {
  const { apiToken, hasPermission, permissions } = usePermissions();
  const [users, setUsers] = useState<UserWithRolesAndComments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [allRoles, setAllRoles] = useState<DiscordRole[]>([]);

  type SortKey = "name" | "steamId" | "joined";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  // Detail modal
  const [selectedUser, setSelectedUser] = useState<UserWithRolesAndComments | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  const canManage = hasPermission("manage:members");

  useEffect(() => {
    async function init() {
      if (!apiToken) return;
      try {
        const [usersRes, rolesRes] = await Promise.all([
          getUsers(apiToken),
          getRoles(apiToken).catch(() => null),
        ]);
        if (usersRes.success && usersRes.data) {
          setUsers(usersRes.data);
        } else {
          setError(usersRes.error || "Failed to load users");
        }
        if (rolesRes?.success && rolesRes.data) {
          setAllRoles(rolesRes.data);
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
        if (selectedUser) {
          const updated = res.data.find((u) => u.id === selectedUser.id);
          if (updated) setSelectedUser(updated);
        }
      }
    } catch { /* silent */ }
  }, [apiToken, selectedUser]);

  useAutoRefresh(refreshUsers, 20_000, !!apiToken);

  const memberRoleIds = useMemo(
    () => new Set(allRoles.filter((r) => r.isMemberRole).map((r) => r.id)),
    [allRoles],
  );

  const filtered = useMemo(() => {
    // Non-members only
    let result = memberRoleIds.size > 0
      ? users.filter((u) => !u.roles.some((r) => memberRoleIds.has(r.id)))
      : users;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((u) =>
        u.discordName.toLowerCase().includes(s) ||
        (u.displayName && u.displayName.toLowerCase().includes(s)) ||
        u.steamId?.includes(search) ||
        u.eosId?.includes(search) ||
        u.discordId.includes(search)
      );
    }

    const dir = sortDir === "desc" ? -1 : 1;
    result = [...result].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return dir * (a.displayName || a.discordName).localeCompare(b.displayName || b.discordName);
        case "steamId": {
          if (!a.steamId && !b.steamId) return 0;
          if (!a.steamId) return 1;
          if (!b.steamId) return -1;
          return dir * a.steamId.localeCompare(b.steamId);
        }
        case "joined":
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        default:
          return 0;
      }
    });

    return result;
  }, [users, search, memberRoleIds, sortKey, sortDir]);

  function openDetail(user: UserWithRolesAndComments) {
    setSelectedUser(user);
    setCommentText("");
  }

  function closeDetail() {
    setSelectedUser(null);
    setCommentText("");
  }

  async function handleAddComment() {
    if (!apiToken || !selectedUser || !commentText.trim() || commentSaving) return;
    setCommentSaving(true);
    try {
      const res = await addMemberComment(apiToken, selectedUser.id, commentText.trim());
      if (res.success) {
        setCommentText("");
        await refreshUsers();
      }
    } catch { /* silent */ } finally {
      setCommentSaving(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    if (!apiToken || !selectedUser) return;
    try {
      const res = await deleteMemberComment(apiToken, selectedUser.id, commentId);
      if (res.success) {
        await refreshUsers();
      }
    } catch { /* silent */ }
  }

  function SortIndicator({ columnKey }: { columnKey: SortKey }) {
    if (sortKey !== columnKey) return null;
    return <span className="ml-1 text-accent">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
  }

  if (loading) {
    return <div className="text-text-secondary">Loading discord users...</div>;
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">Discord Users</h1>
      </div>

      {/* Search */}
      <div className="mb-4 flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, Steam ID, Discord ID..."
          className="w-full max-w-md rounded-sm border border-border bg-bg-card px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <span className="text-xs text-text-muted">{filtered.length} users</span>
      </div>

      {/* Table */}
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {(
                  [
                    { key: "name" as SortKey, label: "User" },
                    { key: "steamId" as SortKey, label: "Steam ID" },
                    { key: null, label: "Roles" },
                    { key: "joined" as SortKey, label: "Joined" },
                  ] as { key: SortKey | null; label: string }[]
                ).map(({ key, label }) => (
                  <th
                    key={label}
                    className={`px-4 py-3 text-[10px] font-medium uppercase tracking-wider text-text-muted ${
                      key ? "cursor-pointer select-none hover:text-accent" : ""
                    }`}
                    onClick={() => key && toggleSort(key)}
                  >
                    {label}
                    {key && <SortIndicator columnKey={key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted">
                    {search ? "No users match your search" : "No discord users found"}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => openDetail(user)}
                    className="cursor-pointer border-b border-border/50 transition-colors hover:bg-bg-tertiary/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tertiary text-xs text-text-muted">
                              {(user.displayName || user.discordName).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-card ${
                              user.hasLoggedIn ? "bg-emerald-500" : "bg-text-muted/40"
                            }`}
                            title={user.hasLoggedIn ? "Logged in" : "Discord only"}
                          />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-text-primary">{user.displayName || user.discordName}</span>
                            {!user.hasLoggedIn && (
                              <span className="rounded-sm bg-text-muted/10 px-1.5 py-0.5 text-[10px] text-text-muted">
                                Discord only
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted">{user.displayName ? `${user.discordName} \u00b7 ${user.discordId}` : user.discordId}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.steamId ? (
                        <code className="text-accent">{user.steamId}</code>
                      ) : (
                        <span className="text-text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map((role) => (
                            <span
                              key={role.id}
                              className="inline-block rounded-sm border border-accent/15 bg-accent/5 px-2 py-0.5 text-[10px] text-accent/80"
                            >
                              {role.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-text-muted">--</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDate(user.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail modal */}
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
                    {(selectedUser.displayName || selectedUser.discordName).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-semibold tracking-wide text-text-primary">
                      {selectedUser.displayName || selectedUser.discordName}
                    </h2>
                    {selectedUser.hasLoggedIn ? (
                      <span className="rounded-sm bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
                        Logged In
                      </span>
                    ) : (
                      <span className="rounded-sm bg-text-muted/10 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                        Discord Only
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-text-muted">{selectedUser.displayName ? `${selectedUser.discordName} \u00b7 ${selectedUser.discordId}` : selectedUser.discordId}</div>
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
                {selectedUser.steamId ? (
                  <CopyableId value={selectedUser.steamId} />
                ) : (
                  <span className="text-text-muted">--</span>
                )}
              </InfoField>

              <InfoField label="EOS ID">
                {selectedUser.eosId ? (
                  <CopyableId value={selectedUser.eosId} />
                ) : (
                  <span className="text-text-muted">--</span>
                )}
              </InfoField>

              <InfoField label="Country">
                <span className={selectedUser.country ? "text-text-secondary" : "text-text-muted"}>
                  {selectedUser.country || "--"}
                </span>
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

              <InfoField label="Playtime (30/90d)">
                <span className="text-text-secondary">{selectedUser.playtime30}h / {selectedUser.playtime90}h</span>
              </InfoField>
              <InfoField label="Seed Time (30/90d)">
                <span className="text-text-secondary">{selectedUser.seed30}h / {selectedUser.seed90}h</span>
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
            <div className="px-6 py-4">
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
                          {permissions.includes("developer") && (
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
      </Modal>
    </div>
  );
}
