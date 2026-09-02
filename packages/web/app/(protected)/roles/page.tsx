"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getRoles,
  createRole,
  updateRolePermissions,
  updateRoleWhitelistGrant,
  updateRoleMemberRole,
  deleteRole,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { DiscordRole, Permission } from "shared";
import { PERMISSIONS } from "shared";
import { Skeleton, SkeletonList } from "@/components/skeleton";
import { RoleMembersPanel } from "./RoleMembersPanel";

// ---------------------------------------------------------------------------
// Permission group metadata
// ---------------------------------------------------------------------------

type PermissionKey = Exclude<Permission, "developer">;

interface PermEntry {
  perm: PermissionKey;
  label: string;
  description: string;
}

interface PermSubGroup {
  label: string;
  description: string;
  entries: PermEntry[];
}

interface PermGroup {
  id: string;
  label: string;
  description: string;
  entries: PermEntry[];
  subGroups?: PermSubGroup[];
}

const PERMISSION_GROUPS: PermGroup[] = [
  {
    id: "whitelist",
    label: "Whitelist",
    description: "Server whitelist and SFTP sync",
    entries: [
      {
        perm: "view:whitelist",
        label: "View Whitelist",
        description: "Read whitelist entries and pending requests",
      },
      {
        perm: "manage:whitelist",
        label: "Manage Whitelist",
        description: "Add, edit, and remove whitelist entries",
      },
      {
        perm: "manage:whitelist-sync",
        label: "Manage Whitelist Sync",
        description: "Toggle SFTP sync per server",
      },
    ],
  },
  {
    id: "members",
    label: "Members",
    description: "Registered Discord member accounts",
    entries: [
      {
        perm: "view:members",
        label: "View Members",
        description: "Browse member profiles and linked game IDs",
      },
      {
        perm: "manage:members",
        label: "Manage Members",
        description: "Edit Steam/EOS IDs and sync roles",
      },
    ],
  },
  {
    id: "tickets",
    label: "Tickets",
    description: "Support ticket system",
    entries: [
      {
        perm: "view:tickets",
        label: "View All Tickets",
        description: "View tickets across all tiers",
      },
      {
        perm: "manage:tickets",
        label: "Manage Tickets",
        description: "Close tickets and take administrative actions",
      },
    ],
    subGroups: [
      {
        label: "Ticket Tier Access",
        description: "Grants read access to a specific tier only",
        entries: [
          {
            perm: "view:tickets:normal",
            label: "Normal Tier",
            description: "Standard player-submitted tickets",
          },
          {
            perm: "view:tickets:community_officer",
            label: "Community Officer Tier",
            description: "Tickets escalated to Community Officers",
          },
          {
            perm: "view:tickets:admin_officer",
            label: "Admin Officer Tier",
            description: "Sensitive admin-only tickets",
          },
          {
            perm: "view:tickets:comp_team",
            label: "Comp Team Tier",
            description: "Competitive team related tickets",
          },
          {
            perm: "view:tickets:whitelist",
            label: "Whitelist Tier",
            description: "Whitelist request tickets",
          },
        ],
      },
    ],
  },
  {
    id: "prospects",
    label: "Prospects",
    description: "Prospect applications, mentors, and settings",
    entries: [
      {
        perm: "view:prospects",
        label: "View Prospects",
        description: "Applications, mentors, and settings (read-only)",
      },
      {
        perm: "view:prospect-settings",
        label: "View Prospect Settings",
        description: "Settings and cooldown list only (read-only)",
      },
      {
        perm: "manage:prospects",
        label: "Manage Prospects",
        description: "Edit settings, cooldowns, and mentor assignments",
      },
    ],
  },
  {
    id: "roles",
    label: "Roles",
    description: "Discord role and permission assignment",
    entries: [
      {
        perm: "manage:roles",
        label: "Manage Roles",
        description: "Register roles and assign permissions",
      },
    ],
  },
  {
    id: "matches",
    label: "Matches",
    description: "Match history and scoreboard data",
    entries: [
      {
        perm: "manage:matches",
        label: "Manage Matches",
        description: "Review and edit match records",
      },
    ],
  },
  {
    id: "squadjs",
    label: "SquadJS",
    description: "Game server plugin configuration",
    entries: [
      {
        perm: "view:squadjs",
        label: "View SquadJS Config",
        description: "Read plugin configuration",
      },
      {
        perm: "manage:squadjs",
        label: "Manage SquadJS Config",
        description: "Edit and apply plugin settings",
      },
    ],
  },
  {
    id: "live-server",
    label: "Live Server",
    description: "Real-time server monitor and RCON",
    entries: [
      {
        perm: "view:live-server",
        label: "View Live Server",
        description: "Watch live player list, chat, and teams",
      },
      {
        perm: "manage:live-server",
        label: "Manage Live Server",
        description: "Issue RCON commands (kicks, map changes, etc.)",
      },
      {
        perm: "manage:clan-move",
        label: "Clan Move",
        description: "Move or queue entire clans between teams",
      },
      {
        perm: "manage:randomize",
        label: "Randomize Teams",
        description: "Queue or run team randomization",
      },
      {
        perm: "manage:balance-teams",
        label: "Balance Teams",
        description: "Queue a skill-weighted team balance for round end",
      },
      {
        perm: "manage:rcon-console",
        label: "RCON Console",
        description: "Run arbitrary RCON commands via the live console",
      },
    ],
  },
  {
    id: "discord-bot",
    label: "Discord Bot",
    description: "Bot configuration and automated systems",
    entries: [
      {
        perm: "view:discord-bot",
        label: "View Discord Bot",
        description: "View bot status, prospects, and logs",
      },
      {
        perm: "manage:discord-bot",
        label: "Manage Discord Bot",
        description: "Configure messages, seeding, and tickets",
      },
    ],
  },
  {
    id: "audit-logs",
    label: "Audit Logs",
    description: "Activity and change history",
    entries: [
      {
        perm: "view:audit-logs",
        label: "View Audit Logs",
        description: "Browse audit trail of all system actions",
      },
    ],
  },
  {
    id: "seeding-tracker",
    label: "Seeding Tracker",
    description: "Seeding session analytics and leaderboards",
    entries: [
      {
        perm: "view:seeding-tracker",
        label: "View Seeding Tracker",
        description: "Browse seeding leaderboard, player stats, and session history",
      },
    ],
  },
  {
    id: "giveaway",
    label: "Giveaway",
    description: "Monthly Discord game giveaway",
    entries: [
      {
        perm: "view:giveaway",
        label: "View Giveaway",
        description: "See status, leaderboard, history, and copy Discord posts",
      },
      {
        perm: "manage:giveaway",
        label: "Manage Giveaway",
        description: "Start, draw, cancel, add entries, and edit giveaway settings",
      },
    ],
  },
  {
    id: "api-docs",
    label: "API Docs",
    description: "Interactive OpenAPI / Swagger documentation",
    entries: [
      {
        perm: "view:api-docs",
        label: "View API Docs",
        description: "Access the Swagger UI at /api-docs",
      },
    ],
  },
];

// Compile-time coverage: ensure every assignable permission is in a group
const _allGroupedPerms = PERMISSION_GROUPS.flatMap((g) => [
  ...g.entries.map((e) => e.perm),
  ...(g.subGroups?.flatMap((sg) => sg.entries.map((e) => e.perm)) ?? []),
]);
if (typeof window === "undefined") {
  const assignable = PERMISSIONS.filter((p) => p !== "developer");
  const missing = assignable.filter(
    (p) => !_allGroupedPerms.includes(p as PermissionKey)
  );
  if (missing.length > 0) {
    console.warn("[roles] Permissions missing from PERMISSION_GROUPS:", missing);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAllGroupPerms(group: PermGroup): PermissionKey[] {
  return [
    ...group.entries.map((e) => e.perm),
    ...(group.subGroups?.flatMap((sg) => sg.entries.map((e) => e.perm)) ?? []),
  ];
}

function getGroupActiveCount(
  group: PermGroup,
  effectivePerms: Permission[]
): { active: number; total: number } {
  const all = getAllGroupPerms(group);
  return {
    active: all.filter((p) => effectivePerms.includes(p)).length,
    total: all.length,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RolesPage() {
  const { apiToken, hasPermission } = usePermissions();
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Register form
  const [newRoleId, setNewRoleId] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Permission editing (track pending changes per role)
  const [pendingPerms, setPendingPerms] = useState<
    Record<string, Permission[]>
  >({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Accordion – only one role expanded at a time
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<"members" | "permissions">("members");

  // Whitelist grant toggle
  const [togglingWl, setTogglingWl] = useState<string | null>(null);

  // Member role toggle
  const [togglingMember, setTogglingMember] = useState<string | null>(null);

  const canManage = hasPermission("manage:roles");

  useEffect(() => {
    async function init() {
      if (!apiToken) return;
      try {
        const res = await getRoles(apiToken);
        if (res.success && res.data) {
          setRoles(res.data);
        } else {
          setError(res.error || "Failed to load roles");
        }
      } catch {
        setError("Failed to initialize");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [apiToken]);

  const refreshRoles = useCallback(async () => {
    if (!apiToken) return;
    try {
      const res = await getRoles(apiToken);
      if (res.success && res.data) setRoles(res.data);
    } catch { /* silent */ }
  }, [apiToken]);

  const hasPending = Object.keys(pendingPerms).length > 0;
  useAutoRefresh(refreshRoles, 20_000, !!apiToken && !hasPending && !deletingId);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!apiToken || !newRoleId.trim() || !newRoleName.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await createRole(apiToken, {
      discordRoleId: newRoleId.trim(),
      name: newRoleName.trim(),
    });

    if (res.success && res.data) {
      setRoles((prev) => [...prev, res.data!]);
      setNewRoleId("");
      setNewRoleName("");
    } else {
      setAddError(res.error || "Failed to register role");
    }
    setAdding(false);
  }

  function togglePermission(roleId: string, perm: Permission) {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;

    const current = pendingPerms[roleId] ?? role.permissions;
    const updated = current.includes(perm)
      ? current.filter((p) => p !== perm)
      : [...current, perm];

    setPendingPerms((prev) => ({ ...prev, [roleId]: updated }));
  }

  function selectGroupPerms(
    roleId: string,
    group: PermGroup,
    select: boolean
  ) {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;

    const groupPerms = getAllGroupPerms(group);
    const current = pendingPerms[roleId] ?? role.permissions;
    const updated = select
      ? [...new Set([...current, ...groupPerms])]
      : current.filter((p) => !groupPerms.includes(p as PermissionKey));

    setPendingPerms((prev) => ({ ...prev, [roleId]: updated as Permission[] }));
  }

  function getEffectivePerms(role: DiscordRole): Permission[] {
    return pendingPerms[role.id] ?? role.permissions;
  }

  function hasPendingChanges(role: DiscordRole): boolean {
    const pending = pendingPerms[role.id];
    if (!pending) return false;
    if (pending.length !== role.permissions.length) return true;
    return !pending.every((p) => role.permissions.includes(p));
  }

  async function savePermissions(roleId: string) {
    if (!apiToken) return;
    const perms = pendingPerms[roleId];
    if (!perms) return;

    setSavingId(roleId);
    setSaveError(null);

    const res = await updateRolePermissions(apiToken, roleId, perms);

    if (res.success && res.data) {
      setRoles((prev) =>
        prev.map((r) => (r.id === roleId ? res.data! : r))
      );
      setPendingPerms((prev) => {
        const next = { ...prev };
        delete next[roleId];
        return next;
      });
    } else {
      setSaveError(res.error || "Failed to save permissions");
    }
    setSavingId(null);
  }

  function discardChanges(roleId: string) {
    setPendingPerms((prev) => {
      const next = { ...prev };
      delete next[roleId];
      return next;
    });
  }

  async function toggleWhitelistGrant(role: DiscordRole) {
    if (!apiToken) return;
    setTogglingWl(role.id);
    const res = await updateRoleWhitelistGrant(
      apiToken,
      role.id,
      !role.grantsWhitelist
    );
    if (res.success) {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === role.id
            ? { ...r, grantsWhitelist: !r.grantsWhitelist }
            : r
        )
      );
    }
    setTogglingWl(null);
  }

  async function toggleMemberRole(role: DiscordRole) {
    if (!apiToken) return;
    setTogglingMember(role.id);
    const res = await updateRoleMemberRole(
      apiToken,
      role.id,
      !role.isMemberRole
    );
    if (res.success) {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === role.id
            ? { ...r, isMemberRole: !r.isMemberRole }
            : r
        )
      );
    }
    setTogglingMember(null);
  }

  async function handleDelete(id: string) {
    if (!apiToken) return;

    const res = await deleteRole(apiToken, id);
    if (res.success) {
      setRoles((prev) => prev.filter((r) => r.id !== id));
      setDeletingId(null);
    }
  }

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  function renderCheckbox(
    roleId: string,
    entry: PermEntry,
    effectivePerms: Permission[]
  ) {
    const active = effectivePerms.includes(entry.perm);
    return (
      <label
        key={entry.perm}
        className={`flex cursor-pointer items-start gap-2.5 rounded-sm border px-3 py-2.5 text-xs transition-colors ${
          active
            ? "border-accent/30 bg-accent/10"
            : "border-border bg-bg-tertiary"
        } ${canManage ? "hover:border-accent/40" : "cursor-default"}`}
      >
        <input
          type="checkbox"
          checked={active}
          onChange={() => canManage && togglePermission(roleId, entry.perm)}
          disabled={!canManage}
          className="sr-only"
        />
        <div
          className={`mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${
            active ? "border-accent bg-accent" : "border-text-muted"
          }`}
        >
          {active && (
            <svg
              className="h-2.5 w-2.5 text-bg-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div
            className={`font-medium tracking-wide ${
              active ? "text-accent" : "text-text-secondary"
            }`}
          >
            {entry.label}
          </div>
          <div className="mt-0.5 text-[10px] leading-tight text-text-muted">
            {entry.description}
          </div>
        </div>
      </label>
    );
  }

  function renderGroup(
    roleId: string,
    group: PermGroup,
    effectivePerms: Permission[]
  ) {
    const { active, total } = getGroupActiveCount(group, effectivePerms);
    const allSelected = active === total;

    return (
      <div key={group.id} className="rounded-sm border border-border/50 bg-bg-tertiary/30">
        {/* Group header */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                active > 0 ? "bg-accent" : "bg-text-muted/30"
              }`}
            />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
              {group.label}
            </span>
            <span className="text-[10px] text-text-muted/60">
              {group.description}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums text-text-muted/60">
              {active}/{total}
            </span>
            {canManage && total > 1 && (
              <button
                type="button"
                onClick={() => selectGroupPerms(roleId, group, !allSelected)}
                className="text-[10px] font-medium text-text-muted transition-colors hover:text-accent"
              >
                {allSelected ? "None" : "All"}
              </button>
            )}
          </div>
        </div>

        {/* Main entries */}
        <div className="grid gap-1.5 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-3">
          {group.entries.map((entry) =>
            renderCheckbox(roleId, entry, effectivePerms)
          )}
        </div>

        {/* Sub-groups */}
        {group.subGroups?.map((sg, i) => (
          <div key={i} className="mx-2 mb-2 border-t border-border/40 pt-2">
            <div className="mb-1.5 flex items-center gap-2 px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60">
                {sg.label}
              </span>
              <span className="text-[10px] text-text-muted/40">
                {sg.description}
              </span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {sg.entries.map((entry) =>
                renderCheckbox(roleId, entry, effectivePerms)
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  if (loading && roles.length === 0) {
    return (
      <div>
        <div className="mb-8 flex items-center justify-between">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-7 w-28 rounded-sm" />
        </div>
        <SkeletonList rows={4} />
      </div>
    );
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">
          Roles
        </h1>
        <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
          {roles.length} registered
        </span>
      </div>

      {/* Register role form */}
      {canManage && (
        <form
          onSubmit={handleRegister}
          className="facet-border mb-8 flex flex-wrap gap-3 rounded-sm bg-bg-card p-4"
        >
          <input
            type="text"
            value={newRoleId}
            onChange={(e) => setNewRoleId(e.target.value)}
            placeholder="Discord Role ID"
            className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            required
          />
          <input
            type="text"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            placeholder="Display Name"
            className="w-48 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
          >
            {adding ? "Registering..." : "Register Role"}
          </button>
          {addError && (
            <div className="w-full text-sm text-danger">{addError}</div>
          )}
        </form>
      )}

      {/* Roles list */}
      {roles.length === 0 ? (
        <div className="facet-border rounded-sm bg-bg-card px-6 py-12 text-center text-text-muted">
          No Discord roles registered yet.
          {canManage && " Use the form above to register one."}
        </div>
      ) : (
        <div className="space-y-4">
          {roles.map((role) => {
            const effectivePerms = getEffectivePerms(role);
            const changed = hasPendingChanges(role);
            const isExpanded = expandedId === role.id;
            const permCount = effectivePerms.length;

            return (
              <div
                key={role.id}
                className="facet-border rounded-sm bg-bg-card"
              >
                {/* Role header - clickable to expand/collapse */}
                <div
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedId(null);
                    } else {
                      setExpandedId(role.id);
                      setExpandedTab("members");
                    }
                  }}
                  className="flex cursor-pointer items-center justify-between p-5 pb-4 transition-colors hover:bg-bg-tertiary/30"
                >
                  <div className="flex items-center gap-3">
                    {/* Chevron */}
                    <svg
                      className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${isExpanded ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-lg font-semibold tracking-wide text-text-primary">
                          {role.name}
                        </h3>
                        {changed && (
                          <span className="rounded-sm bg-warning/15 px-2 py-0.5 text-[10px] font-medium tracking-wide text-warning">
                            unsaved
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-text-muted">
                        <span>
                          ID: <code className="text-text-secondary">{role.discordRoleId}</code>
                        </span>
                        <span className="text-text-muted/40">|</span>
                        <span>
                          {permCount > 0
                            ? `${permCount} permission${permCount !== 1 ? "s" : ""}`
                            : "No permissions"}
                        </span>
                        <span className="text-text-muted/40">|</span>
                        <span>
                          {role.memberCount} member{role.memberCount !== 1 ? "s" : ""}
                        </span>
                        {role.grantsWhitelist && (
                          <>
                            <span className="text-text-muted/40">|</span>
                            <span className="text-success">Grants Whitelist</span>
                          </>
                        )}
                        {role.isMemberRole && (
                          <>
                            <span className="text-text-muted/40">|</span>
                            <span className="text-accent">Member Role</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {deletingId === role.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelete(role.id)}
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
                        <button
                          onClick={() => setDeletingId(role.id)}
                          className="text-xs text-text-muted transition-colors hover:text-danger"
                        >
                          Unregister
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Expanded: roster + permissions */}
                {isExpanded && (
                  <>
                    <div
                      role="tablist"
                      className="mx-5 mt-1 mb-2 flex gap-1 rounded-sm border border-border bg-bg-tertiary/50 p-1"
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={expandedTab === "members"}
                        onClick={() => setExpandedTab("members")}
                        className={`flex-1 rounded-sm px-4 py-1.5 text-center text-xs font-medium tracking-wide transition-colors ${
                          expandedTab === "members"
                            ? "bg-bg-card text-accent"
                            : "text-text-muted hover:text-text-secondary"
                        }`}
                      >
                        Members ({role.memberCount})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={expandedTab === "permissions"}
                        onClick={() => setExpandedTab("permissions")}
                        className={`flex-1 rounded-sm px-4 py-1.5 text-center text-xs font-medium tracking-wide transition-colors ${
                          expandedTab === "permissions"
                            ? "bg-bg-card text-accent"
                            : "text-text-muted hover:text-text-secondary"
                        }`}
                      >
                        Permissions ({permCount})
                      </button>
                    </div>

                    <div className={expandedTab === "members" ? "" : "hidden"}>
                      {apiToken && (
                        <RoleMembersPanel
                          apiToken={apiToken}
                          roleId={role.id}
                          memberCount={role.memberCount}
                        />
                      )}
                    </div>

                    {/* Role toggles + Save/Discard */}
                    {expandedTab === "permissions" && canManage && (
                      <div className="flex items-center justify-between border-t border-border/50 px-5 py-3">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => toggleWhitelistGrant(role)}
                            disabled={togglingWl === role.id}
                            className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide transition-all"
                          >
                            <span
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                                role.grantsWhitelist
                                  ? "bg-success"
                                  : "bg-text-muted/30"
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                  role.grantsWhitelist
                                    ? "translate-x-[18px]"
                                    : "translate-x-[3px]"
                                }`}
                              />
                            </span>
                            <span
                              className={
                                role.grantsWhitelist
                                  ? "text-success"
                                  : "text-text-muted"
                              }
                            >
                              {role.grantsWhitelist
                                ? "Grants Whitelist"
                                : "No Whitelist"}
                            </span>
                          </button>
                          <button
                            onClick={() => toggleMemberRole(role)}
                            disabled={togglingMember === role.id}
                            className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide transition-all"
                          >
                            <span
                              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                                role.isMemberRole
                                  ? "bg-accent"
                                  : "bg-text-muted/30"
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                  role.isMemberRole
                                    ? "translate-x-[18px]"
                                    : "translate-x-[3px]"
                                }`}
                              />
                            </span>
                            <span
                              className={
                                role.isMemberRole
                                  ? "text-accent"
                                  : "text-text-muted"
                              }
                            >
                              {role.isMemberRole
                                ? "Member Role"
                                : "Not Member"}
                            </span>
                          </button>
                        </div>
                        {changed && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => savePermissions(role.id)}
                              disabled={savingId === role.id}
                              className="rounded-sm bg-accent px-4 py-1.5 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
                            >
                              {savingId === role.id
                                ? "Saving..."
                                : "Save Permissions"}
                            </button>
                            <button
                              onClick={() => discardChanges(role.id)}
                              className="text-xs text-text-muted transition-colors hover:text-text-primary"
                            >
                              Discard
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {expandedTab === "permissions" && saveError && savingId === null && (
                      <div className="mx-5 mb-3 text-sm text-danger">
                        {saveError}
                      </div>
                    )}

                    {expandedTab === "permissions" && (
                      <div
                        className={`space-y-2 px-5 pb-5 ${
                          !canManage ? "pointer-events-none opacity-70" : ""
                        }`}
                      >
                        {PERMISSION_GROUPS.map((group) =>
                          renderGroup(role.id, group, effectivePerms)
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
