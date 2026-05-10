"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  getUsers,
  updateUser,
  deleteUser,
  syncUserRoles,
  addMemberComment,
  deleteMemberComment,
  bulkUpdateMembers,
  bulkDeleteMembers,
  bulkCommentMembers,
  getRoles,
  disableUser,
  enableUser,
  bulkDisableMembers,
  bulkEnableMembers,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Modal } from "@/components/modal";
import { formatDate, formatRelativeTime } from "@/lib/format";
import type { UserWithRolesAndComments } from "shared";
import type { DiscordRole } from "shared";
import { COUNTRIES, validateCountry } from "shared";

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

function RangeFilter({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  unit,
}: {
  label: string;
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  unit?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder="Min"
          className="w-20 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
        />
        <span className="text-text-muted text-xs">-</span>
        <input
          type="number"
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder="Max"
          className="w-20 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
        />
        {unit && <span className="text-[10px] text-text-muted">{unit}</span>}
      </div>
    </div>
  );
}

export default function MembersPage() {
  const { apiToken, hasPermission, permissions } = usePermissions();
  const [users, setUsers] = useState<UserWithRolesAndComments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search
  const [search, setSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sorting
  type SortKey = "name" | "steamId" | "joined" | "country" | "loggedIn";
  type SortDir = "asc" | "desc";
  const [sortKey, setSortKey] = useState<SortKey>("loggedIn");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "country" ? "asc" : "desc");
    }
  }

  // Filter panel
  const [filterOpen, setFilterOpen] = useState(false);
  const [allRoles, setAllRoles] = useState<DiscordRole[]>([]);
  const [filterRoles, setFilterRoles] = useState<string[]>([]);
  const [filterCountry, setFilterCountry] = useState("");
  const [filterLoggedIn, setFilterLoggedIn] = useState<"all" | "yes" | "no">("all");
  const [filterPlaytimeMin30, setFilterPlaytimeMin30] = useState("");
  const [filterPlaytimeMax30, setFilterPlaytimeMax30] = useState("");
  const [filterPlaytimeMin90, setFilterPlaytimeMin90] = useState("");
  const [filterPlaytimeMax90, setFilterPlaytimeMax90] = useState("");
  const [filterSeedMin30, setFilterSeedMin30] = useState("");
  const [filterSeedMax30, setFilterSeedMax30] = useState("");
  const [filterSeedMin90, setFilterSeedMin90] = useState("");
  const [filterSeedMax90, setFilterSeedMax90] = useState("");
  const [filterJoinFrom, setFilterJoinFrom] = useState("");
  const [filterJoinTo, setFilterJoinTo] = useState("");
  const [filterMemberFrom, setFilterMemberFrom] = useState("");
  const [filterMemberTo, setFilterMemberTo] = useState("");

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

  // Disable confirmation
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [disableReason, setDisableReason] = useState("");

  // Role sync
  const [syncing, setSyncing] = useState(false);

  // Comment state
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);

  // Bulk selection
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"country" | "membershipDate" | "comment" | "delete" | "disable" | "enable" | null>(null);
  const [bulkCountry, setBulkCountry] = useState("");
  const [bulkMembershipDate, setBulkMembershipDate] = useState("");
  const [bulkCommentText, setBulkCommentText] = useState("");
  const [bulkDisableReason, setBulkDisableReason] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

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

  useAutoRefresh(refreshUsers, 20_000, !!apiToken && !editing && !confirmingDelete);

  // --- Filtering ---

  function clearFilters() {
    setFilterRoles([]);
    setFilterCountry("");
    setFilterLoggedIn("all");
    setFilterPlaytimeMin30(""); setFilterPlaytimeMax30("");
    setFilterPlaytimeMin90(""); setFilterPlaytimeMax90("");
    setFilterSeedMin30(""); setFilterSeedMax30("");
    setFilterSeedMin90(""); setFilterSeedMax90("");
    setFilterJoinFrom(""); setFilterJoinTo("");
    setFilterMemberFrom(""); setFilterMemberTo("");
  }

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterRoles.length) count++;
    if (filterCountry) count++;
    if (filterLoggedIn !== "all") count++;
    if (filterPlaytimeMin30 || filterPlaytimeMax30) count++;
    if (filterPlaytimeMin90 || filterPlaytimeMax90) count++;
    if (filterSeedMin30 || filterSeedMax30) count++;
    if (filterSeedMin90 || filterSeedMax90) count++;
    if (filterJoinFrom || filterJoinTo) count++;
    if (filterMemberFrom || filterMemberTo) count++;
    return count;
  }, [filterRoles, filterCountry, filterLoggedIn, filterPlaytimeMin30, filterPlaytimeMax30, filterPlaytimeMin90, filterPlaytimeMax90, filterSeedMin30, filterSeedMax30, filterSeedMin90, filterSeedMax90, filterJoinFrom, filterJoinTo, filterMemberFrom, filterMemberTo]);

  const memberRoleIds = useMemo(
    () => new Set(allRoles.filter((r) => r.isMemberRole).map((r) => r.id)),
    [allRoles],
  );

  const filtered = useMemo(() => {
    let result = users;

    // Members-only filter
    if (memberRoleIds.size > 0) {
      result = result.filter((u) => u.roles.some((r) => memberRoleIds.has(r.id)));
    }

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

    if (filterRoles.length > 0) {
      result = result.filter((u) =>
        filterRoles.every((roleId) => u.roles.some((r) => r.id === roleId))
      );
    }

    if (filterCountry.trim()) {
      const fc = filterCountry.toLowerCase();
      result = result.filter((u) => u.country?.toLowerCase().includes(fc));
    }

    if (filterLoggedIn === "yes") {
      result = result.filter((u) => u.hasLoggedIn);
    } else if (filterLoggedIn === "no") {
      result = result.filter((u) => !u.hasLoggedIn);
    }

    const inRange = (val: number, min: string, max: string) => {
      if (min && val < Number(min)) return false;
      if (max && val > Number(max)) return false;
      return true;
    };

    if (filterPlaytimeMin30 || filterPlaytimeMax30) {
      result = result.filter((u) => inRange(u.playtime30, filterPlaytimeMin30, filterPlaytimeMax30));
    }
    if (filterPlaytimeMin90 || filterPlaytimeMax90) {
      result = result.filter((u) => inRange(u.playtime90, filterPlaytimeMin90, filterPlaytimeMax90));
    }
    if (filterSeedMin30 || filterSeedMax30) {
      result = result.filter((u) => inRange(u.seed30, filterSeedMin30, filterSeedMax30));
    }
    if (filterSeedMin90 || filterSeedMax90) {
      result = result.filter((u) => inRange(u.seed90, filterSeedMin90, filterSeedMax90));
    }

    if (filterJoinFrom) {
      result = result.filter((u) => u.createdAt >= filterJoinFrom);
    }
    if (filterJoinTo) {
      result = result.filter((u) => u.createdAt <= filterJoinTo + "T23:59:59");
    }
    if (filterMemberFrom) {
      result = result.filter((u) => u.membershipDate && u.membershipDate >= filterMemberFrom);
    }
    if (filterMemberTo) {
      result = result.filter((u) => u.membershipDate && u.membershipDate <= filterMemberTo + "T23:59:59");
    }

    // Sort
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
        case "country": {
          if (!a.country && !b.country) return 0;
          if (!a.country) return 1;
          if (!b.country) return -1;
          return dir * a.country.localeCompare(b.country);
        }
        case "loggedIn":
          return dir * (Number(a.hasLoggedIn) - Number(b.hasLoggedIn));
        default:
          return 0;
      }
    });

    return result;
  }, [users, search, memberRoleIds, sortKey, sortDir, filterRoles, filterCountry, filterLoggedIn, filterPlaytimeMin30, filterPlaytimeMax30, filterPlaytimeMin90, filterPlaytimeMax90, filterSeedMin30, filterSeedMax30, filterSeedMin90, filterSeedMax90, filterJoinFrom, filterJoinTo, filterMemberFrom, filterMemberTo]);

  // --- Detail modal ---

  function openDetail(user: UserWithRolesAndComments) {
    setSelectedUser(user);
    setEditing(false);
    setConfirmingDelete(false);
    setConfirmingDisable(false);
    setDisableReason("");
    setEditError(null);
    setCommentText("");
  }

  function closeDetail() {
    setSelectedUser(null);
    setEditing(false);
    setConfirmingDelete(false);
    setConfirmingDisable(false);
    setDisableReason("");
    setEditError(null);
    setCommentText("");
  }

  function startEdit() {
    if (!selectedUser) return;
    setEditing(true);
    setConfirmingDelete(false);
    setConfirmingDisable(false);
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

    if (editCountry.trim()) {
      const result = validateCountry(editCountry);
      if (!result.valid) {
        setEditError("Invalid country name");
        return;
      }
      setEditCountry(result.country);
    }

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

  async function handleDisable() {
    if (!apiToken || !selectedUser || !disableReason.trim()) return;
    const res = await disableUser(apiToken, selectedUser.id, disableReason.trim());
    if (res.success) {
      const updated = { ...selectedUser, disabled: true, disabledAt: new Date().toISOString(), disabledReason: disableReason.trim() };
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? updated : u)));
      setSelectedUser(updated);
      setConfirmingDisable(false);
      setDisableReason("");
    }
  }

  async function handleEnable() {
    if (!apiToken || !selectedUser) return;
    const res = await enableUser(apiToken, selectedUser.id);
    if (res.success) {
      const updated = { ...selectedUser, disabled: false, disabledAt: null, disabledReason: null };
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? updated : u)));
      setSelectedUser(updated);
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

  // --- Bulk selection ---

  function toggleBulkMode() {
    setBulkMode((prev) => !prev);
    setSelectedIds(new Set());
    setBulkAction(null);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.id)));
    }
  }

  function toggleRole(roleId: string) {
    setFilterRoles((prev) =>
      prev.includes(roleId)
        ? prev.filter((id) => id !== roleId)
        : [...prev, roleId]
    );
  }

  async function executeBulkAction() {
    if (!apiToken || selectedIds.size === 0) return;
    setBulkProcessing(true);
    const ids = Array.from(selectedIds);

    try {
      if (bulkAction === "delete") {
        const res = await bulkDeleteMembers(apiToken, ids);
        if (res.success) {
          setUsers((prev) => prev.filter((u) => !selectedIds.has(u.id)));
          setSelectedIds(new Set());
          setBulkAction(null);
        }
      } else if (bulkAction === "country") {
        const res = await bulkUpdateMembers(apiToken, ids, { country: bulkCountry || undefined });
        if (res.success) {
          await refreshUsers();
          setSelectedIds(new Set());
          setBulkAction(null);
        }
      } else if (bulkAction === "membershipDate") {
        const res = await bulkUpdateMembers(apiToken, ids, {
          membershipDate: bulkMembershipDate || null,
        });
        if (res.success) {
          await refreshUsers();
          setSelectedIds(new Set());
          setBulkAction(null);
        }
      } else if (bulkAction === "comment") {
        const res = await bulkCommentMembers(apiToken, ids, bulkCommentText);
        if (res.success) {
          await refreshUsers();
          setSelectedIds(new Set());
          setBulkAction(null);
          setBulkCommentText("");
        }
      } else if (bulkAction === "disable") {
        const res = await bulkDisableMembers(apiToken, ids, bulkDisableReason);
        if (res.success) {
          await refreshUsers();
          setSelectedIds(new Set());
          setBulkAction(null);
          setBulkDisableReason("");
        }
      } else if (bulkAction === "enable") {
        const res = await bulkEnableMembers(apiToken, ids);
        if (res.success) {
          await refreshUsers();
          setSelectedIds(new Set());
          setBulkAction(null);
        }
      }
    } catch {
      // silent
    } finally {
      setBulkProcessing(false);
    }
  }

  if (loading) {
    return <div className="text-text-secondary">Loading members...</div>;
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

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
              filterOpen || activeFilterCount > 0
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border text-text-secondary hover:border-accent/40 hover:text-accent"
            }`}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          {canManage && (
            <button
              onClick={toggleBulkMode}
              className={`rounded-sm border px-4 py-1.5 text-xs font-medium tracking-wide transition-colors ${
                bulkMode
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border text-text-secondary hover:border-accent/40 hover:text-accent"
              }`}
            >
              {bulkMode ? "Cancel Select" : "Select"}
            </button>
          )}
          <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
            {filtered.length}{filtered.length !== users.length ? ` / ${users.length}` : ""} members
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4 relative w-full max-w-md">
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, Steam ID, EOS ID, or Discord ID..."
          className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              searchInputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-text-muted transition-colors hover:text-text-primary"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="facet-border mb-4 rounded-sm bg-bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Advanced Filters</span>
            <button
              onClick={clearFilters}
              className="text-xs text-text-muted transition-colors hover:text-text-primary"
            >
              Clear All
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {/* Logged-in status */}
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Logged In</div>
              <select
                value={filterLoggedIn}
                onChange={(e) => setFilterLoggedIn(e.target.value as "all" | "yes" | "no")}
                className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
              >
                <option value="all">All</option>
                <option value="yes">Logged In</option>
                <option value="no">Discord Only</option>
              </select>
            </div>

            {/* Country */}
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Country</div>
              <input
                type="text"
                list="filter-country-list"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                placeholder="Country..."
                className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
              />
              <datalist id="filter-country-list">
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            {/* Roles */}
            <div className="col-span-2">
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Roles</div>
              <div className="flex flex-wrap gap-1.5">
                {allRoles.map((role) => (
                  <button
                    key={role.id}
                    onClick={() => toggleRole(role.id)}
                    className={`rounded-sm border px-2 py-0.5 text-xs transition-colors ${
                      filterRoles.includes(role.id)
                        ? "border-accent/40 bg-accent/10 text-accent"
                        : "border-border text-text-muted hover:border-accent/20 hover:text-text-secondary"
                    }`}
                  >
                    {role.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity (hours played) ranges */}
            <RangeFilter label="Activity 30d" min={filterPlaytimeMin30} max={filterPlaytimeMax30} onMinChange={setFilterPlaytimeMin30} onMaxChange={setFilterPlaytimeMax30} unit="hrs" />
            <RangeFilter label="Activity 90d" min={filterPlaytimeMin90} max={filterPlaytimeMax90} onMinChange={setFilterPlaytimeMin90} onMaxChange={setFilterPlaytimeMax90} unit="hrs" />
            <RangeFilter label="Seed Time 30d" min={filterSeedMin30} max={filterSeedMax30} onMinChange={setFilterSeedMin30} onMaxChange={setFilterSeedMax30} unit="hrs" />
            <RangeFilter label="Seed Time 90d" min={filterSeedMin90} max={filterSeedMax90} onMinChange={setFilterSeedMin90} onMaxChange={setFilterSeedMax90} unit="hrs" />

            {/* Date ranges */}
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Joined (from - to)</div>
              <div className="flex items-center gap-1">
                <input type="date" value={filterJoinFrom} onChange={(e) => setFilterJoinFrom(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none" />
                <input type="date" value={filterJoinTo} onChange={(e) => setFilterJoinTo(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none" />
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Membership (from - to)</div>
              <div className="flex items-center gap-1">
                <input type="date" value={filterMemberFrom} onChange={(e) => setFilterMemberFrom(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none" />
                <input type="date" value={filterMemberTo} onChange={(e) => setFilterMemberTo(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Members table */}
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                {bulkMode && (
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll}
                      className="accent-accent"
                    />
                  </th>
                )}
                {(
                  [
                    { key: "name" as SortKey, label: "Member" },
                    { key: "steamId" as SortKey, label: "Steam ID" },
                    { key: null, label: "Roles" },
                    { key: "joined" as SortKey, label: "Joined" },
                    { key: "country" as SortKey, label: "Country" },
                  ] as const
                ).map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={key ? () => toggleSort(key) : undefined}
                    className={`px-4 py-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted select-none ${key ? "cursor-pointer hover:text-text-primary" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {key && sortKey === key && (
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                          {sortDir === "asc" ? (
                            <path d="M6 2l4 5H2z" />
                          ) : (
                            <path d="M6 10l4-5H2z" />
                          )}
                        </svg>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={bulkMode ? 7 : 6} className="px-4 py-8 text-center text-text-muted">
                    {search || activeFilterCount > 0 ? "No members match your filters" : "No members found"}
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    onClick={() => {
                      if (bulkMode) {
                        toggleSelect(user.id);
                      } else {
                        openDetail(user);
                      }
                    }}
                    className={`cursor-pointer border-b border-border/50 transition-colors hover:bg-bg-tertiary/50 ${
                      bulkMode && selectedIds.has(user.id) ? "bg-accent/5" : ""
                    }`}
                  >
                    {bulkMode && (
                      <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(user.id)}
                          onChange={() => toggleSelect(user.id)}
                          className="accent-accent"
                        />
                      </td>
                    )}
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
                            <span className={`font-medium ${user.disabled ? "text-text-muted line-through" : "text-text-primary"}`}>{user.displayName || user.discordName}</span>
                            {user.disabled && (
                              <span className="rounded-sm bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                                Disabled
                              </span>
                            )}
                            {!user.hasLoggedIn && !user.disabled && (
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
                    <td className="px-4 py-3">
                      <span className="text-text-secondary">{formatDate(user.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {user.country ? (
                        <span className="text-text-secondary">{user.country}</span>
                      ) : (
                        <span className="text-text-muted">--</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk floating action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-bg-card px-6 py-3 shadow-lg">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <span className="text-sm font-medium text-text-primary">{selectedIds.size} selected</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setBulkAction("country"); setBulkCountry(""); }}
                className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                Change Country
              </button>
              <button
                onClick={() => { setBulkAction("membershipDate"); setBulkMembershipDate(""); }}
                className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                Set Membership Date
              </button>
              <button
                onClick={() => { setBulkAction("comment"); setBulkCommentText(""); }}
                className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                Add Comment
              </button>
              <button
                onClick={() => setBulkAction("delete")}
                className="rounded-sm border border-danger/30 bg-danger/10 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
              >
                Delete
              </button>
              {permissions.includes("developer") && (
                <>
                  <button
                    onClick={() => { setBulkAction("disable"); setBulkDisableReason(""); }}
                    className="rounded-sm border border-danger/30 bg-danger/10 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
                  >
                    Disable
                  </button>
                  <button
                    onClick={() => setBulkAction("enable")}
                    className="rounded-sm border border-success/30 bg-success/10 px-4 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/20"
                  >
                    Enable
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk action modal */}
      <Modal
        open={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        className="max-w-md bg-bg-secondary p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-wide">
            {bulkAction === "country" && "Change Country"}
            {bulkAction === "membershipDate" && "Set Membership Date"}
            {bulkAction === "comment" && "Add Comment"}
            {bulkAction === "delete" && "Delete Members"}
            {bulkAction === "disable" && "Disable Accounts"}
            {bulkAction === "enable" && "Enable Accounts"}
          </h2>
          <button onClick={() => setBulkAction(null)} className="text-text-muted transition-colors hover:text-text-primary">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-text-secondary">
          This will affect {selectedIds.size} selected {selectedIds.size === 1 ? "member" : "members"}.
        </p>

        {bulkAction === "country" && (
          <>
            <input
              type="text"
              list="bulk-country-list"
              value={bulkCountry}
              onChange={(e) => setBulkCountry(e.target.value)}
              placeholder="Country name"
              className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
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
            className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        )}

        {bulkAction === "comment" && (
          <textarea
            value={bulkCommentText}
            onChange={(e) => setBulkCommentText(e.target.value)}
            placeholder="Comment text..."
            rows={3}
            className="mb-4 w-full resize-none rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        )}

        {bulkAction === "delete" && (
          <p className="mb-4 text-sm text-danger">
            Are you sure you want to permanently delete {selectedIds.size} {selectedIds.size === 1 ? "member" : "members"}? This cannot be undone.
          </p>
        )}

        {bulkAction === "disable" && (
          <>
            <input
              type="text"
              value={bulkDisableReason}
              onChange={(e) => setBulkDisableReason(e.target.value)}
              placeholder="Reason for disabling..."
              className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-danger focus:outline-none"
            />
            <p className="mb-4 text-sm text-danger">
              This will disable {selectedIds.size} {selectedIds.size === 1 ? "account" : "accounts"}. Disabled users cannot access the website.
            </p>
          </>
        )}

        {bulkAction === "enable" && (
          <p className="mb-4 text-sm text-text-secondary">
            This will re-enable {selectedIds.size} {selectedIds.size === 1 ? "account" : "accounts"}, restoring their access.
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
            disabled={bulkProcessing || (bulkAction === "comment" && !bulkCommentText.trim()) || (bulkAction === "disable" && !bulkDisableReason.trim())}
            className={`rounded-sm px-5 py-2 text-sm font-semibold tracking-wide transition-colors disabled:opacity-50 ${
              bulkAction === "delete" || bulkAction === "disable"
                ? "bg-danger text-white hover:bg-danger/80"
                : "bg-accent text-bg-primary hover:bg-accent-muted"
            }`}
          >
            {bulkProcessing ? "Processing..." : "Confirm"}
          </button>
        </div>
      </Modal>

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
                    {(selectedUser.displayName || selectedUser.discordName).charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-lg font-semibold tracking-wide text-text-primary">
                      {selectedUser.displayName || selectedUser.discordName}
                    </h2>
                    {selectedUser.disabled && (
                      <span className="rounded-sm bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
                        Disabled
                      </span>
                    )}
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
                  <>
                    <input
                      type="text"
                      list="country-list"
                      value={editCountry}
                      onChange={(e) => setEditCountry(e.target.value)}
                      className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                      placeholder="Country"
                    />
                    <datalist id="country-list">
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </>
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

              <InfoField label="Activity (30/90d)">
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

            {/* Disable info (developer only) */}
            {selectedUser.disabled && permissions.includes("developer") && (
              <div className="border-b border-border px-6 py-4">
                <div className="rounded-sm border border-danger/30 bg-danger/5 px-4 py-3">
                  <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-danger">Account Disabled</div>
                  {selectedUser.disabledAt && (
                    <div className="text-xs text-text-muted">
                      Since {formatDate(selectedUser.disabledAt)}
                    </div>
                  )}
                  {selectedUser.disabledReason && (
                    <div className="mt-1 text-sm text-text-secondary">
                      {selectedUser.disabledReason}
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
                ) : confirmingDisable ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-danger">Disable this account?</span>
                    <input
                      type="text"
                      value={disableReason}
                      onChange={(e) => setDisableReason(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && disableReason.trim()) handleDisable(); }}
                      placeholder="Reason for disabling..."
                      className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-danger focus:outline-none"
                    />
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleDisable}
                        disabled={!disableReason.trim()}
                        className="rounded-sm bg-danger/20 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/30 disabled:opacity-40"
                      >
                        Confirm Disable
                      </button>
                      <button
                        onClick={() => { setConfirmingDisable(false); setDisableReason(""); }}
                        className="text-xs text-text-muted transition-colors hover:text-text-primary"
                      >
                        Cancel
                      </button>
                    </div>
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
                    {permissions.includes("developer") && !selectedUser.disabled && (
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
      </Modal>
    </div>
  );
}
