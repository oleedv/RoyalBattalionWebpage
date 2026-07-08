"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { UserWithRolesAndComments, DiscordRole } from "shared";
import { COUNTRIES } from "shared";
import {
  getAllUsers,
  getRoles,
  syncUserRoles,
  bulkUpdateMembers,
  bulkDeleteMembers,
  bulkCommentMembers,
  bulkDisableMembers,
  bulkEnableMembers,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { DataTable } from "@/components/data-table-v2";
import { SearchInput } from "@/components/search-input-v2";
import { Skeleton, SkeletonTableRows } from "@/components/skeleton";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CopyableId } from "@/components/copyable-id";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/format";
import { filterMembers, activeFilterCount, type MemberFilters } from "./lib";
import { MembersFilterPanel } from "./filter-panel";
import MemberDetailDialog from "./member-detail-dialog";

// ─── DI seam ─────────────────────────────────────────────────────────────────

export type MembersApi = {
  getAllUsers: typeof getAllUsers;
  getRoles: typeof getRoles;
  syncUserRoles: typeof syncUserRoles;
  bulkUpdateMembers: typeof bulkUpdateMembers;
  bulkDeleteMembers: typeof bulkDeleteMembers;
  bulkCommentMembers: typeof bulkCommentMembers;
  bulkDisableMembers: typeof bulkDisableMembers;
  bulkEnableMembers: typeof bulkEnableMembers;
};

export const defaultApi: MembersApi = {
  getAllUsers,
  getRoles,
  syncUserRoles,
  bulkUpdateMembers,
  bulkDeleteMembers,
  bulkCommentMembers,
  bulkDisableMembers,
  bulkEnableMembers,
};

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: MemberFilters = {
  search: "",
  roleIds: [],
  country: "",
  loggedIn: "all",
  playtime30: ["", ""],
  playtime90: ["", ""],
  seed30: ["", ""],
  seed90: ["", ""],
  joinFrom: "",
  joinTo: "",
  memberFrom: "",
  memberTo: "",
};

type BulkAction =
  | "country"
  | "membershipDate"
  | "comment"
  | "delete"
  | "disable"
  | "enable";

// ─── View ────────────────────────────────────────────────────────────────────

export function MembersView({
  token,
  permissions,
  api = defaultApi,
}: {
  token: string;
  permissions: string[];
  api?: MembersApi;
}) {
  const [users, setUsers] = useState<UserWithRolesAndComments[]>([]);
  const [allRoles, setAllRoles] = useState<DiscordRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<MemberFilters>(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRolesAndComments | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Bulk dialog state
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkCountry, setBulkCountry] = useState("");
  const [bulkMembershipDate, setBulkMembershipDate] = useState("");
  const [bulkCommentText, setBulkCommentText] = useState("");
  const [bulkDisableReason, setBulkDisableReason] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const bulkClearRef = useRef<(() => void) | null>(null);

  const canManage =
    permissions.includes("manage:members") || permissions.includes("developer");
  const isDeveloper = permissions.includes("developer");

  // ─── Data loading ────────────────────────────────────────────────────────

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
          setError(usersRes.error || "Failed to load members");
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
      }
    } catch {
      /* silent */
    }
  }, [token, api]);

  // Auto-refresh every 20 s (editing guard dropped — detail dialog owns its own state)
  useAutoRefresh(refreshUsers, 20_000, !!token);

  // ─── Filter helpers ──────────────────────────────────────────────────────

  function setFilters(patch: Partial<MemberFilters>) {
    setFiltersState((prev) => ({ ...prev, ...patch }));
  }

  function clearFilters() {
    setFiltersState(DEFAULT_FILTERS);
  }

  const memberRoleIds = useMemo(
    () => new Set(allRoles.filter((r) => r.isMemberRole).map((r) => r.id)),
    [allRoles],
  );

  const filteredData = useMemo(
    () => filterMembers(users, memberRoleIds, filters),
    [users, memberRoleIds, filters],
  );

  const filterCount = useMemo(() => activeFilterCount(filters), [filters]);

  // ─── Detail dialog ───────────────────────────────────────────────────────

  function openDetail(user: UserWithRolesAndComments) {
    setSelectedUser(user);
  }

  function closeDetail() {
    setSelectedUser(null);
  }

  // ─── Role sync ───────────────────────────────────────────────────────────

  async function handleSyncRoles() {
    if (!token || syncing) return;
    setSyncing(true);
    try {
      const syncRes = await api.syncUserRoles(token);
      if (syncRes.success) {
        const res = await api.getAllUsers(token);
        if (res.success && res.data) {
          setUsers(res.data);
        }
      }
    } catch {
      /* silent */
    } finally {
      setSyncing(false);
    }
  }

  // ─── Bulk actions ────────────────────────────────────────────────────────

  function openBulkAction(
    action: BulkAction,
    rows: UserWithRolesAndComments[],
    clear: () => void,
  ) {
    setBulkSelectedIds(rows.map((r) => r.id));
    bulkClearRef.current = clear;
    setBulkAction(action);
    if (action === "country") setBulkCountry("");
    if (action === "membershipDate") setBulkMembershipDate("");
    if (action === "comment") setBulkCommentText("");
    if (action === "disable") setBulkDisableReason("");
  }

  async function executeBulkAction() {
    if (!token || bulkSelectedIds.length === 0) return;
    const ids = bulkSelectedIds;
    const clearFn = bulkClearRef.current ?? (() => {});
    setBulkProcessing(true);
    try {
      if (bulkAction === "delete") {
        const res = await api.bulkDeleteMembers(token, ids);
        if (res.success) {
          const idSet = new Set(ids);
          setUsers((prev) => prev.filter((u) => !idSet.has(u.id)));
          clearFn();
          setBulkAction(null);
        }
      } else if (bulkAction === "country") {
        const res = await api.bulkUpdateMembers(token, ids, {
          country: bulkCountry || undefined,
        });
        if (res.success) {
          await refreshUsers();
          clearFn();
          setBulkAction(null);
        }
      } else if (bulkAction === "membershipDate") {
        const res = await api.bulkUpdateMembers(token, ids, {
          membershipDate: bulkMembershipDate || null,
        });
        if (res.success) {
          await refreshUsers();
          clearFn();
          setBulkAction(null);
        }
      } else if (bulkAction === "comment") {
        const res = await api.bulkCommentMembers(token, ids, bulkCommentText);
        if (res.success) {
          await refreshUsers();
          clearFn();
          setBulkAction(null);
          setBulkCommentText("");
        }
      } else if (bulkAction === "disable") {
        const res = await api.bulkDisableMembers(token, ids, bulkDisableReason);
        if (res.success) {
          await refreshUsers();
          clearFn();
          setBulkAction(null);
          setBulkDisableReason("");
        }
      } else if (bulkAction === "enable") {
        const res = await api.bulkEnableMembers(token, ids);
        if (res.success) {
          await refreshUsers();
          clearFn();
          setBulkAction(null);
        }
      }
    } catch {
      /* silent */
    } finally {
      setBulkProcessing(false);
    }
  }

  // ─── Columns ─────────────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<UserWithRolesAndComments, unknown>[]>(
    () => [
      {
        id: "loggedIn",
        header: "Member",
        accessorFn: (u) => Number(u.hasLoggedIn),
        sortingFn: (a, b) =>
          Number(a.original.hasLoggedIn) - Number(b.original.hasLoggedIn),
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
                  <span
                    className={`font-medium ${
                      u.disabled
                        ? "line-through text-text-muted"
                        : "text-text-primary"
                    }`}
                  >
                    {u.displayName || u.discordName}
                  </span>
                  {u.disabled && (
                    <StatusBadge tone="danger">Disabled</StatusBadge>
                  )}
                  {!u.hasLoggedIn && !u.disabled && (
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
        id: "joined",
        header: "Joined",
        accessorFn: (u) => u.createdAt,
        sortingFn: (a, b) =>
          new Date(a.original.createdAt).getTime() -
          new Date(b.original.createdAt).getTime(),
        cell: ({ row }) => (
          <span className="text-text-secondary">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: "country",
        header: "Country",
        accessorFn: (u) => u.country ?? undefined,
        sortUndefined: "last",
        sortingFn: (a, b) =>
          (a.original.country ?? "").localeCompare(b.original.country ?? ""),
        cell: ({ row }) =>
          row.original.country ? (
            <span className="text-text-secondary">{row.original.country}</span>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
    ],
    [],
  );

  // ─── Loading skeleton ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div>
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-9 w-40" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-28 rounded-sm" />
            <Skeleton className="h-8 w-20 rounded-sm" />
            <Skeleton className="h-8 w-24 rounded-sm" />
          </div>
        </div>
        <Skeleton className="mb-4 h-10 w-full max-w-md rounded-sm" />
        <div className="facet-border overflow-hidden rounded-sm bg-bg-card" aria-busy="true">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Member", "Steam ID", "Roles", "Joined", "Country"].map((label) => (
                    <th
                      key={label}
                      className="px-4 py-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <SkeletonTableRows
                  rows={8}
                  columns={[
                    { key: "name" },
                    { key: "steamId" },
                    { key: "roles" },
                    { key: "joined" },
                    { key: "country" },
                  ]}
                />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">Members</h1>
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
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`rounded-sm border px-4 py-1.5 text-xs font-medium tracking-wide transition-colors ${
              filterOpen || filterCount > 0
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border text-text-secondary hover:border-accent/40 hover:text-accent"
            }`}
          >
            Filters{filterCount > 0 ? ` (${filterCount})` : ""}
          </button>
          <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
            {filteredData.length}
            {filteredData.length !== users.length ? ` / ${users.length}` : ""}{" "}
            members
          </span>
        </div>
      </div>

      {/* Search */}
      <SearchInput
        value={filters.search}
        onChange={(v) => setFilters({ search: v })}
        placeholder="Search by name, Steam ID, EOS ID, or Discord ID..."
        className="mb-4 w-full max-w-md"
      />

      {/* Filter panel */}
      {filterOpen && (
        <MembersFilterPanel
          filters={filters}
          setFilters={setFilters}
          allRoles={allRoles}
          onClearAll={clearFilters}
        />
      )}

      {/* Members table */}
      <DataTable
        data={filteredData}
        columns={columns}
        getRowId={(u) => u.id}
        onRowClick={openDetail}
        rowClassName={(u) => (u.disabled ? "opacity-60" : undefined)}
        enableSelection={canManage}
        pageSize={20}
        initialSorting={[{ id: "loggedIn", desc: true }]}
        emptyState={
          <p className="text-center text-sm text-text-muted">
            {filters.search || filterCount > 0
              ? "No members match your filters"
              : "No members found"}
          </p>
        }
        bulkActions={
          canManage
            ? (rows, clear) => (
                <>
                  <span className="text-sm font-medium text-text-primary">
                    {rows.length} selected
                  </span>
                  <button
                    onClick={() => openBulkAction("country", rows, clear)}
                    className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
                  >
                    Change Country
                  </button>
                  <button
                    onClick={() => openBulkAction("membershipDate", rows, clear)}
                    className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
                  >
                    Set Membership Date
                  </button>
                  <button
                    onClick={() => openBulkAction("comment", rows, clear)}
                    className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
                  >
                    Add Comment
                  </button>
                  <button
                    onClick={() => openBulkAction("delete", rows, clear)}
                    className="rounded-sm border border-danger/30 bg-danger/10 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
                  >
                    Delete
                  </button>
                  {isDeveloper && (
                    <>
                      <button
                        onClick={() => openBulkAction("disable", rows, clear)}
                        className="rounded-sm border border-danger/30 bg-danger/10 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
                      >
                        Disable
                      </button>
                      <button
                        onClick={() => openBulkAction("enable", rows, clear)}
                        className="rounded-sm border border-success/30 bg-success/10 px-4 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20"
                      >
                        Enable
                      </button>
                    </>
                  )}
                </>
              )
            : undefined
        }
      />

      {/* Bulk action Dialog */}
      <Dialog
        open={bulkAction !== null}
        onOpenChange={(open) => {
          if (!open) setBulkAction(null);
        }}
      >
        <DialogContent className="max-w-md sm:max-w-md bg-bg-secondary p-6">
          <DialogTitle className="font-display text-lg font-semibold tracking-wide">
            {bulkAction === "country" && "Change Country"}
            {bulkAction === "membershipDate" && "Set Membership Date"}
            {bulkAction === "comment" && "Add Comment"}
            {bulkAction === "delete" && "Delete Members"}
            {bulkAction === "disable" && "Disable Accounts"}
            {bulkAction === "enable" && "Enable Accounts"}
          </DialogTitle>

          <p className="text-sm text-text-secondary">
            This will affect {bulkSelectedIds.length} selected{" "}
            {bulkSelectedIds.length === 1 ? "member" : "members"}.
          </p>

          {bulkAction === "country" && (
            <>
              <input
                type="text"
                list="bulk-country-list"
                value={bulkCountry}
                onChange={(e) => setBulkCountry(e.target.value)}
                placeholder="Country name"
                className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <datalist id="bulk-country-list">
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </>
          )}

          {bulkAction === "membershipDate" && (
            <input
              type="date"
              value={bulkMembershipDate}
              onChange={(e) => setBulkMembershipDate(e.target.value)}
              className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            />
          )}

          {bulkAction === "comment" && (
            <textarea
              value={bulkCommentText}
              onChange={(e) => setBulkCommentText(e.target.value)}
              placeholder="Comment text..."
              rows={3}
              className="w-full resize-none rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          )}

          {bulkAction === "delete" && (
            <p className="text-sm text-danger">
              Are you sure you want to permanently delete {bulkSelectedIds.length}{" "}
              {bulkSelectedIds.length === 1 ? "member" : "members"}? This cannot
              be undone.
            </p>
          )}

          {bulkAction === "disable" && (
            <>
              <input
                type="text"
                value={bulkDisableReason}
                onChange={(e) => setBulkDisableReason(e.target.value)}
                placeholder="Reason for disabling..."
                className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-danger focus:outline-none"
              />
              <p className="text-sm text-danger">
                This will disable {bulkSelectedIds.length}{" "}
                {bulkSelectedIds.length === 1 ? "account" : "accounts"}. Disabled
                users cannot access the website.
              </p>
              <p className="text-sm text-danger">
                This also removes their in-game whitelist (restored if
                re-enabled).
              </p>
            </>
          )}

          {bulkAction === "enable" && (
            <p className="text-sm text-text-secondary">
              This will re-enable {bulkSelectedIds.length}{" "}
              {bulkSelectedIds.length === 1 ? "account" : "accounts"}, restoring
              their access.
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setBulkAction(null)}
              className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={executeBulkAction}
              disabled={
                bulkProcessing ||
                (bulkAction === "comment" && !bulkCommentText.trim()) ||
                (bulkAction === "disable" && !bulkDisableReason.trim())
              }
              className={`rounded-sm px-5 py-2 text-sm font-semibold tracking-wide transition-colors disabled:opacity-50 ${
                bulkAction === "delete" || bulkAction === "disable"
                  ? "bg-danger text-white hover:bg-danger/80"
                  : "bg-accent text-bg-primary hover:bg-accent-muted"
              }`}
            >
              {bulkProcessing ? "Processing..." : "Confirm"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Member detail dialog */}
      <MemberDetailDialog
        user={selectedUser}
        onClose={closeDetail}
        onChanged={(u) => {
          setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));
          setSelectedUser(u);
        }}
        onDeleted={(id) => {
          setUsers((prev) => prev.filter((x) => x.id !== id));
          closeDetail();
        }}
        canManage={canManage}
        isDeveloper={isDeveloper}
        token={token}
      />
    </div>
  );
}
