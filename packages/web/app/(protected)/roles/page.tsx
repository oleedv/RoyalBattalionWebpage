"use client";

import { useState, useEffect } from "react";
import {
  getRoles,
  createRole,
  updateRolePermissions,
  updateRoleWhitelistGrant,
  deleteRole,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { DiscordRole, Permission } from "shared";
import { PERMISSIONS } from "shared";

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

  // Whitelist grant toggle
  const [togglingWl, setTogglingWl] = useState<string | null>(null);

  const canManage = hasPermission("manage:roles");

  // Assignable permissions (exclude "admin" from toggles)
  const assignablePerms = PERMISSIONS.filter((p) => p !== "admin");

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
    const res = await updateRoleWhitelistGrant(apiToken, role.id, !role.grantsWhitelist);
    if (res.success) {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === role.id ? { ...r, grantsWhitelist: !r.grantsWhitelist } : r
        )
      );
    }
    setTogglingWl(null);
  }

  async function handleDelete(id: string) {
    if (!apiToken) return;

    const res = await deleteRole(apiToken, id);
    if (res.success) {
      setRoles((prev) => prev.filter((r) => r.id !== id));
      setDeletingId(null);
    }
  }

  if (loading) {
    return <div className="text-text-secondary">Loading roles...</div>;
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

            return (
              <div
                key={role.id}
                className="facet-border rounded-sm bg-bg-card p-5"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg font-semibold tracking-wide text-text-primary">
                      {role.name}
                    </h3>
                    <div className="text-xs text-text-muted">
                      Discord Role ID:{" "}
                      <code className="text-text-secondary">
                        {role.discordRoleId}
                      </code>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => toggleWhitelistGrant(role)}
                        disabled={togglingWl === role.id}
                        className="mt-1.5 inline-flex items-center gap-2 text-[10px] font-semibold tracking-wide uppercase transition-all"
                      >
                        <span
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                            role.grantsWhitelist ? "bg-success" : "bg-text-muted/30"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                              role.grantsWhitelist ? "translate-x-[18px]" : "translate-x-[3px]"
                            }`}
                          />
                        </span>
                        <span className={role.grantsWhitelist ? "text-success" : "text-text-muted"}>
                          {role.grantsWhitelist ? "Grants Whitelist" : "No Whitelist"}
                        </span>
                      </button>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      {changed && (
                        <>
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
                        </>
                      )}
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

                {saveError && savingId === null && (
                  <div className="mb-3 text-sm text-danger">{saveError}</div>
                )}

                {/* Permission toggles */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {assignablePerms.map((perm) => {
                    const active = effectivePerms.includes(perm);
                    return (
                      <label
                        key={perm}
                        className={`flex cursor-pointer items-center gap-2 rounded-sm border px-3 py-2 text-xs transition-colors ${
                          active
                            ? "border-accent/30 bg-accent/10 text-accent"
                            : "border-border bg-bg-tertiary text-text-muted"
                        } ${canManage ? "hover:border-accent/40" : "cursor-default"}`}
                      >
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() =>
                            canManage && togglePermission(role.id, perm)
                          }
                          disabled={!canManage}
                          className="sr-only"
                        />
                        <div
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${
                            active
                              ? "border-accent bg-accent"
                              : "border-text-muted"
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
                        <span className="tracking-wide">{perm}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
