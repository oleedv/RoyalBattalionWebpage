"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
  getAllUsers,
  getRoles,
  addMemberComment,
  deleteMemberComment,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table-v2";
import { SearchInput } from "@/components/search-input-v2";
import { StatusBadge } from "@/components/status-badge";
import { CopyableId } from "@/components/copyable-id";
import { EmptyState } from "@/components/empty-state";
import { formatDate } from "@/lib/format";
import { filterDiscordUsers } from "./lib";
import DiscordUserDetailDialog from "./discord-user-detail-dialog";
import type { UserWithRolesAndComments, DiscordRole } from "shared";

export type DiscordUsersApi = {
  getAllUsers: typeof getAllUsers;
  getRoles: typeof getRoles;
  addMemberComment: typeof addMemberComment;
  deleteMemberComment: typeof deleteMemberComment;
};

export const defaultApi: DiscordUsersApi = {
  getAllUsers,
  getRoles,
  addMemberComment,
  deleteMemberComment,
};

export function DiscordUsersView({
  token,
  permissions,
  api,
}: {
  token: string;
  permissions: string[];
  api: DiscordUsersApi;
}) {
  const [users, setUsers] = useState<UserWithRolesAndComments[]>([]);
  const [allRoles, setAllRoles] = useState<DiscordRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithRolesAndComments | null>(null);

  const isDeveloper = permissions.includes("developer");
  const canManage = isDeveloper || permissions.includes("manage:members");

  useEffect(() => {
    async function init() {
      if (!token) return;
      try {
        const [usersRes, rolesRes] = await Promise.all([
          api.getAllUsers(token),
          api.getRoles(token).catch(() => null),
        ]);
        if (usersRes.success && usersRes.data) {
          setUsers(usersRes.data);
        } else {
          setError(usersRes.error ?? "Failed to load users");
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
  }, [token, api]);

  const refreshUsers = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getAllUsers(token);
      if (res.success && res.data) {
        setUsers(res.data);
        setSelectedUser((prev) => {
          if (!prev) return prev;
          const updated = res.data!.find((u) => u.id === prev.id);
          return updated ?? prev;
        });
      }
    } catch { /* silent */ }
  }, [token, api]);

  useAutoRefresh(refreshUsers, 20_000, !!token);

  const memberRoleIds = useMemo(
    () => new Set(allRoles.filter((r) => r.isMemberRole).map((r) => r.id)),
    [allRoles],
  );

  const data = useMemo(
    () => filterDiscordUsers(users, memberRoleIds, search),
    [users, memberRoleIds, search],
  );

  function openDetail(user: UserWithRolesAndComments) {
    setSelectedUser(user);
  }

  function closeDetail() {
    setSelectedUser(null);
  }

  const columns = useMemo<ColumnDef<UserWithRolesAndComments, unknown>[]>(
    () => [
      {
        id: "name",
        header: "Member",
        accessorFn: (u) => u.displayName || u.discordName,
        sortingFn: (a, b) =>
          (a.original.displayName || a.original.discordName).localeCompare(
            b.original.displayName || b.original.discordName,
          ),
        cell: ({ row }) => {
          const u = row.original;
          return (
            <div className="flex items-center gap-3">
              <div className="relative">
                {u.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={u.avatarUrl} alt="" className="h-8 w-8 rounded-full" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-tertiary text-xs text-text-muted">
                    {(u.displayName || u.discordName).charAt(0).toUpperCase()}
                  </div>
                )}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-bg-card ${
                    u.hasLoggedIn ? "bg-success" : "bg-text-muted/40"
                  }`}
                  title={u.hasLoggedIn ? "Logged in" : "Discord only"}
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">
                    {u.displayName || u.discordName}
                  </span>
                  {!u.hasLoggedIn && (
                    <StatusBadge tone="neutral">Discord only</StatusBadge>
                  )}
                </div>
                <div className="text-xs text-text-muted">
                  {u.displayName
                    ? `${u.discordName} · ${u.discordId}`
                    : u.discordId}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        id: "steamId",
        header: "Steam ID",
        accessorFn: (u) => u.steamId ?? undefined,
        sortUndefined: "last",
        sortingFn: (a, b) =>
          (a.original.steamId ?? "").localeCompare(b.original.steamId ?? ""),
        cell: ({ row }) =>
          row.original.steamId ? (
            <CopyableId value={row.original.steamId} />
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        id: "roles",
        header: "Roles",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.length > 0 ? (
              row.original.roles.map((role) => (
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
        ),
      },
      {
        id: "joined",
        header: "Joined",
        accessorFn: (u) => new Date(u.createdAt).getTime(),
        cell: ({ row }) => (
          <span className="text-text-secondary">{formatDate(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  if (loading) {
    return <div className="text-text-secondary">Loading discord users...</div>;
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">Discord Users</h1>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, Steam ID, Discord ID..."
          className="w-full max-w-md"
        />
        <span className="text-xs text-text-muted">{data.length} users</span>
      </div>

      <DataTable
        columns={columns}
        data={data}
        getRowId={(u) => u.id}
        onRowClick={openDetail}
        initialSorting={[{ id: "name", desc: false }]}
        emptyState={
          <EmptyState
            message={search ? "No users match your search" : "No discord users found"}
          />
        }
      />

      <DiscordUserDetailDialog
        user={selectedUser}
        onClose={closeDetail}
        onChanged={refreshUsers}
        canManage={canManage}
        isDeveloper={isDeveloper}
        token={token}
      />
    </div>
  );
}
