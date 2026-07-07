"use client";

import { useState } from "react";
import {
  createAdminGroup,
  deleteAdminGroup,
  updateAdminGroup,
} from "@/lib/api-client";
import type { AdminGroup } from "shared";
import { toastError } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { SQUAD_PERMISSIONS } from "./lib";

export interface GroupsApi {
  createAdminGroup: typeof createAdminGroup;
  updateAdminGroup: typeof updateAdminGroup;
  deleteAdminGroup: typeof deleteAdminGroup;
}
export interface GroupsNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: GroupsApi = { createAdminGroup, updateAdminGroup, deleteAdminGroup };
const defaultNotify: GroupsNotify = { error: toastError };

function PermCheckboxes({
  perms,
  setPerms,
  disabled,
}: {
  perms: Set<string>;
  setPerms: (fn: (prev: Set<string>) => Set<string>) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SQUAD_PERMISSIONS.map((p) => {
        const active = perms.has(p);
        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() =>
              setPerms((prev) => {
                const next = new Set(prev);
                if (next.has(p)) next.delete(p);
                else next.add(p);
                return next;
              })
            }
            className={`rounded-sm border px-2 py-0.5 text-[10px] font-medium tracking-wide transition-colors ${
              active
                ? "border-accent/30 bg-accent/10 text-accent"
                : "border-border bg-bg-tertiary text-text-muted hover:border-accent/20"
            } ${disabled ? "cursor-default opacity-60" : ""}`}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}

export default function GroupsTab({
  groups,
  setGroups,
  token,
  canManage,
  api = defaultApi,
  notify = defaultNotify,
}: {
  groups: AdminGroup[];
  setGroups: React.Dispatch<React.SetStateAction<AdminGroup[]>>;
  token: string | null;
  canManage: boolean;
  api?: GroupsApi;
  notify?: GroupsNotify;
}) {
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [newOrder, setNewOrder] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [editOrder, setEditOrder] = useState(0);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await api.createAdminGroup(token, {
      name: newName.trim(),
      permissions: Array.from(newPerms).join(","),
      sortOrder: newOrder,
    });

    if (res.success && res.data) {
      setGroups((prev) => [...prev, res.data!].sort((a, b) => a.sortOrder - b.sortOrder));
      setNewName("");
      setNewPerms(new Set());
      setNewOrder(0);
    } else {
      setAddError(res.error || "Failed to create group");
    }
    setAdding(false);
  }

  function startEdit(g: AdminGroup) {
    setEditingId(g.id);
    setEditName(g.name);
    setEditPerms(new Set(g.permissions.split(",").filter(Boolean)));
    setEditOrder(g.sortOrder);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!token) return;
    setEditError(null);

    const res = await api.updateAdminGroup(token, id, {
      name: editName.trim(),
      permissions: Array.from(editPerms).join(","),
      sortOrder: editOrder,
    });

    if (res.success && res.data) {
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? res.data! : g)).sort((a, b) => a.sortOrder - b.sortOrder),
      );
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update group");
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    const res = await api.deleteAdminGroup(token, id);
    if (res.success) {
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setDeletingId(null);
    } else {
      notify.error(res.error, "Failed to delete group");
    }
  }

  return (
    <>
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 rounded-sm bg-bg-card p-4">
          <div className="mb-3 flex flex-wrap gap-3">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Group name (e.g. Whitelist)"
              className="flex-1"
              required
            />
            <div className="flex items-center gap-1.5">
              <label className="whitespace-nowrap text-xs text-text-muted" htmlFor="wl-group-priority">
                Priority
              </label>
              <Input
                id="wl-group-priority"
                type="number"
                value={newOrder}
                onChange={(e) => setNewOrder(Number(e.target.value))}
                className="w-16 text-center"
                title="Lower number = higher priority in admins.cfg"
              />
            </div>
            <Button type="submit" variant="gold" disabled={adding}>
              {adding ? "Creating..." : "Create Group"}
            </Button>
          </div>
          <PermCheckboxes perms={newPerms} setPerms={setNewPerms} />
          {addError && <div className="mt-2 text-sm text-danger">{addError}</div>}
        </form>
      )}

      {groups.length === 0 ? (
        <div className="facet-border rounded-sm bg-bg-card">
          <EmptyState message="No admin groups defined yet. Create groups like Whitelist, Admin, SuperAdmin to use in the admins.cfg." />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isEditing = editingId === g.id;
            return (
              <div key={g.id} className="facet-border rounded-sm bg-bg-card p-4">
                {isEditing ? (
                  <div>
                    <div className="mb-3 flex flex-wrap gap-3">
                      <Input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1"
                      />
                      <div className="flex items-center gap-1.5">
                        <label className="whitespace-nowrap text-xs text-text-muted">Priority</label>
                        <Input
                          type="number"
                          value={editOrder}
                          onChange={(e) => setEditOrder(Number(e.target.value))}
                          className="w-16 text-center"
                          title="Lower number = higher priority in admins.cfg"
                        />
                      </div>
                      <Button variant="gold" size="sm" onClick={() => saveEdit(g.id)}>
                        Save
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                    <PermCheckboxes perms={editPerms} setPerms={setEditPerms} />
                    {editError && <div className="mt-2 text-sm text-danger">{editError}</div>}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-base font-semibold tracking-wide text-text-primary">
                          {g.name}
                        </h3>
                        <span className="text-xs text-text-muted" title="Priority order in admins.cfg (lower = first)">
                          Priority {g.sortOrder}
                        </span>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(g)} className="text-xs text-text-muted transition-colors hover:text-accent">
                            Edit
                          </button>
                          {deletingId === g.id ? (
                            <>
                              <button onClick={() => handleDelete(g.id)} className="text-xs text-danger transition-colors hover:text-danger/80">
                                Confirm
                              </button>
                              <button onClick={() => setDeletingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setDeletingId(g.id)} className="text-xs text-text-muted transition-colors hover:text-danger">
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.permissions.split(",").filter(Boolean).map((p) => (
                        <span key={p} className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-accent">
                          {p}
                        </span>
                      ))}
                      {!g.permissions && <span className="text-xs text-text-muted">No permissions</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
