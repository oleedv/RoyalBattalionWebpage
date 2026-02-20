"use client";

import { useState, useEffect } from "react";
import { getUsers, updateUser, deleteUser } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { UserWithRoles } from "shared";

export default function MembersPage() {
  const { apiToken, hasPermission } = usePermissions();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteamId, setEditSteamId] = useState("");
  const [editEosId, setEditEosId] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  function startEdit(user: UserWithRoles) {
    setEditingId(user.id);
    setEditSteamId(user.steamId || "");
    setEditEosId(user.eosId || "");
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
    });

    if (res.success && res.data) {
      setUsers((prev) => prev.map((u) => (u.id === id ? res.data! : u)));
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update user");
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

  const filtered = search
    ? users.filter(
        (u) =>
          u.discordName.toLowerCase().includes(search.toLowerCase()) ||
          u.steamId?.includes(search) ||
          u.eosId?.includes(search) ||
          u.discordId.includes(search)
      )
    : users;

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
        <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
          {users.length} members
        </span>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, Steam ID, EOS ID, or Discord ID..."
          className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      </div>

      {/* Members table */}
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Member
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Steam ID
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  EOS ID
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Roles
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Joined
                </th>
                {canManage && (
                  <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={canManage ? 6 : 5}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    {search
                      ? "No members match your search"
                      : "No members found"}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-border/50 transition-colors hover:bg-bg-tertiary/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatarUrl ? (
                          <img
                            src={user.avatarUrl}
                            alt=""
                            className="h-8 w-8 rounded-full"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tertiary text-xs text-text-muted">
                            {user.discordName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-text-primary">
                            {user.discordName}
                          </div>
                          <div className="text-xs text-text-muted">
                            {user.discordId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === user.id ? (
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
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === user.id ? (
                        <input
                          type="text"
                          value={editEosId}
                          onChange={(e) => setEditEosId(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                          placeholder="EOS ID"
                        />
                      ) : user.eosId ? (
                        <code className="text-text-secondary">{user.eosId}</code>
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
                              className="rounded-sm border border-accent/15 bg-accent/5 px-2 py-0.5 text-xs text-accent/80"
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
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {editingId === user.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveEdit(user.id)}
                              className="text-xs text-success transition-colors hover:text-success/80"
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
                              <span className="text-xs text-danger">
                                {editError}
                              </span>
                            )}
                          </div>
                        ) : deletingId === user.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDelete(user.id)}
                              className="text-xs text-danger transition-colors hover:text-danger/80"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="text-xs text-text-muted transition-colors hover:text-text-primary"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(user)}
                              className="text-xs text-text-muted transition-colors hover:text-accent"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeletingId(user.id)}
                              className="text-xs text-text-muted transition-colors hover:text-danger"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
