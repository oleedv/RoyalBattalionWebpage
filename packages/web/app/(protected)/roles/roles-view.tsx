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
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { DiscordRole, Permission } from "shared";
import { Skeleton, SkeletonList } from "@/components/skeleton";
import {
  hasPendingChanges,
  togglePerm,
  setGroupPerms,
} from "./lib";
import type { PermGroup } from "./lib";
import { RegisterRoleForm } from "./register-role-form";
import { RoleCard } from "./role-card";

// ---------------------------------------------------------------------------
// DI contract
// ---------------------------------------------------------------------------

export type RolesApi = {
  getRoles: typeof getRoles;
  createRole: typeof createRole;
  updateRolePermissions: typeof updateRolePermissions;
  updateRoleWhitelistGrant: typeof updateRoleWhitelistGrant;
  updateRoleMemberRole: typeof updateRoleMemberRole;
  deleteRole: typeof deleteRole;
};

export const defaultApi: RolesApi = {
  getRoles,
  createRole,
  updateRolePermissions,
  updateRoleWhitelistGrant,
  updateRoleMemberRole,
  deleteRole,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RolesView({
  token,
  permissions,
  api = defaultApi,
}: {
  token: string;
  permissions: string[];
  api?: RolesApi;
}) {
  const [roles, setRoles] = useState<DiscordRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Register form
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Permission editing (track pending changes per role)
  const [pendingPerms, setPendingPerms] = useState<Record<string, Permission[]>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Accordion – only one role expanded at a time
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Whitelist grant toggle
  const [togglingWl, setTogglingWl] = useState<string | null>(null);

  // Member role toggle
  const [togglingMember, setTogglingMember] = useState<string | null>(null);

  const canManage =
    permissions.includes("developer") || permissions.includes("manage:roles");

  useEffect(() => {
    async function init() {
      if (!token) return;
      try {
        const res = await api.getRoles(token);
        if (res.success && res.data) {
          setRoles(res.data);
        } else {
          setError((res as { error?: string }).error ?? "Failed to load roles");
        }
      } catch {
        setError("Failed to initialize");
      } finally {
        setLoading(false);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const refreshRoles = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api.getRoles(token);
      if (res.success && res.data) setRoles(res.data);
    } catch { /* silent */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const hasPending = Object.keys(pendingPerms).length > 0;
  useAutoRefresh(refreshRoles, 20_000, !!token && !hasPending && !deletingId);

  async function handleRegister(id: string, name: string): Promise<boolean> {
    setAdding(true);
    try {
      const res = await api.createRole(token, { discordRoleId: id, name });
      if (res.success && res.data) {
        setRoles((prev) => [...prev, res.data!]);
        setAddError(null);
        return true;
      } else {
        setAddError((res as { error?: string }).error ?? "Failed to register role");
        return false;
      }
    } catch {
      setAddError("Failed to register role");
      return false;
    } finally {
      setAdding(false);
    }
  }

  function togglePermission(roleId: string, perm: Permission) {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;
    const current = pendingPerms[roleId] ?? role.permissions;
    const updated = togglePerm(current, perm);
    setPendingPerms((prev) => ({ ...prev, [roleId]: updated }));
  }

  function selectGroupPerms(roleId: string, group: PermGroup, select: boolean) {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;
    const current = pendingPerms[roleId] ?? role.permissions;
    const updated = setGroupPerms(current, group, select);
    setPendingPerms((prev) => ({ ...prev, [roleId]: updated }));
  }

  async function savePermissions(roleId: string) {
    const perms = pendingPerms[roleId];
    if (!perms) return;

    setSavingId(roleId);
    setSaveError(null);

    const res = await api.updateRolePermissions(token, roleId, perms);

    if (res.success && res.data) {
      setRoles((prev) => prev.map((r) => (r.id === roleId ? res.data! : r)));
      setPendingPerms((prev) => {
        const next = { ...prev };
        delete next[roleId];
        return next;
      });
    } else {
      setSaveError((res as { error?: string }).error ?? "Failed to save permissions");
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
    setTogglingWl(role.id);
    const res = await api.updateRoleWhitelistGrant(token, role.id, !role.grantsWhitelist);
    if (res.success) {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === role.id ? { ...r, grantsWhitelist: !r.grantsWhitelist } : r,
        ),
      );
    }
    setTogglingWl(null);
  }

  async function toggleMemberRole(role: DiscordRole) {
    setTogglingMember(role.id);
    const res = await api.updateRoleMemberRole(token, role.id, !role.isMemberRole);
    if (res.success) {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === role.id ? { ...r, isMemberRole: !r.isMemberRole } : r,
        ),
      );
    }
    setTogglingMember(null);
  }

  async function handleDelete(id: string) {
    const res = await api.deleteRole(token, id);
    if (res.success) {
      setRoles((prev) => prev.filter((r) => r.id !== id));
      setDeletingId(null);
    }
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
        <h1 className="font-display text-3xl font-bold tracking-wide">Roles</h1>
        <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
          {roles.length} registered
        </span>
      </div>

      {/* Register role form */}
      {canManage && (
        <RegisterRoleForm
          onRegister={handleRegister}
          adding={adding}
          error={addError}
        />
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
            const effectivePerms = pendingPerms[role.id] ?? role.permissions;
            const changed = hasPendingChanges(pendingPerms[role.id], role.permissions);
            const isExpanded = expandedId === role.id;

            return (
              <RoleCard
                key={role.id}
                role={role}
                effectivePerms={effectivePerms}
                changed={changed}
                isExpanded={isExpanded}
                canManage={canManage}
                saving={savingId === role.id}
                saveError={savingId === null ? saveError : null}
                togglingWl={togglingWl === role.id}
                togglingMember={togglingMember === role.id}
                deleteOpen={deletingId === role.id}
                onToggleExpand={() => setExpandedId(isExpanded ? null : role.id)}
                onTogglePerm={(perm) => togglePermission(role.id, perm)}
                onSelectGroup={(group, select) => selectGroupPerms(role.id, group, select)}
                onSave={() => savePermissions(role.id)}
                onDiscard={() => discardChanges(role.id)}
                onToggleWl={() => toggleWhitelistGrant(role)}
                onToggleMember={() => toggleMemberRole(role)}
                onDeleteOpenChange={(o) => setDeletingId(o ? role.id : null)}
                onConfirmDelete={() => handleDelete(role.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
