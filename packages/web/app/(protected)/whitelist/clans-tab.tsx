"use client";

import { useState } from "react";
import { createClan, deleteClan, updateClan } from "@/lib/api-client";
import type { Clan } from "shared";
import { toastError } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";

export interface ClansApi {
  createClan: typeof createClan;
  updateClan: typeof updateClan;
  deleteClan: typeof deleteClan;
}
export interface ClansNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: ClansApi = { createClan, updateClan, deleteClan };
const defaultNotify: ClansNotify = { error: toastError };

export default function ClansTab({
  clans,
  setClans,
  token,
  canManage,
  api = defaultApi,
  notify = defaultNotify,
}: {
  clans: Clan[];
  setClans: React.Dispatch<React.SetStateAction<Clan[]>>;
  token: string | null;
  canManage: boolean;
  api?: ClansApi;
  notify?: ClansNotify;
}) {
  const [newName, setNewName] = useState("");
  const [newTag, setNewTag] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTag, setEditTag] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim() || !newTag.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await api.createClan(token, { name: newName.trim(), tag: newTag.trim() });
    if (res.success && res.data) {
      setClans((prev) => [...prev, res.data!].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName("");
      setNewTag("");
    } else {
      setAddError(res.error || "Failed to create clan");
    }
    setAdding(false);
  }

  function startEdit(c: Clan) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditTag(c.tag);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!token) return;
    setEditError(null);

    const res = await api.updateClan(token, id, { name: editName.trim(), tag: editTag.trim() });
    if (res.success && res.data) {
      setClans((prev) =>
        prev.map((c) => (c.id === id ? res.data! : c)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update clan");
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    const res = await api.deleteClan(token, id);
    if (res.success) {
      setClans((prev) => prev.filter((c) => c.id !== id));
      setDeletingId(null);
    } else {
      notify.error(res.error, "Failed to delete clan");
    }
  }

  return (
    <>
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 rounded-sm bg-bg-card p-4">
          <div className="flex flex-wrap gap-3">
            <Input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Clan name (e.g. Royal Battalion)"
              className="flex-1"
              required
            />
            <Input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="Tag (e.g. RB)"
              className="w-24"
              required
            />
            <Button type="submit" variant="gold" disabled={adding}>
              {adding ? "Creating..." : "Create Clan"}
            </Button>
          </div>
          {addError && <div className="mt-2 text-sm text-danger">{addError}</div>}
        </form>
      )}

      {clans.length === 0 ? (
        <div className="facet-border rounded-sm bg-bg-card">
          <EmptyState message="No clans defined yet. Create clans to organize whitelist entries and manage team switching." />
        </div>
      ) : (
        <div className="space-y-3">
          {clans.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} className="facet-border rounded-sm bg-bg-card p-4">
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                    />
                    <Input
                      type="text"
                      value={editTag}
                      onChange={(e) => setEditTag(e.target.value)}
                      className="w-24"
                    />
                    <Button variant="gold" size="sm" onClick={() => saveEdit(c.id)}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                    {editError && <span className="text-sm text-danger">{editError}</span>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs font-medium tracking-wide text-accent">
                        [{c.tag}]
                      </span>
                      <h3 className="font-display text-base font-semibold tracking-wide text-text-primary">
                        {c.name}
                      </h3>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(c)} className="text-xs text-text-muted transition-colors hover:text-accent">
                          Edit
                        </button>
                        {deletingId === c.id ? (
                          <>
                            <button onClick={() => handleDelete(c.id)} className="text-xs text-danger transition-colors hover:text-danger/80">
                              Confirm
                            </button>
                            <button onClick={() => setDeletingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setDeletingId(c.id)} className="text-xs text-text-muted transition-colors hover:text-danger">
                            Delete
                          </button>
                        )}
                      </div>
                    )}
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
