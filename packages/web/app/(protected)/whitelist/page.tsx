"use client";

import { useState, useEffect, useRef } from "react";
import {
  getWhitelist,
  addWhitelistEntry,
  updateWhitelistEntry,
  deleteWhitelistEntry,
  bulkAddWhitelist,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { WhitelistEntry } from "shared";

export default function WhitelistPage() {
  const { apiToken, hasPermission } = usePermissions();
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [newSteamId, setNewSteamId] = useState("");
  const [newReason, setNewReason] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteamId, setEditSteamId] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Import
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search
  const [search, setSearch] = useState("");

  const canManage = hasPermission("manage:whitelist");

  useEffect(() => {
    async function init() {
      if (!apiToken) return;
      try {
        const wlRes = await getWhitelist(apiToken);
        if (wlRes.success && wlRes.data) {
          setEntries(wlRes.data);
        } else {
          setError(wlRes.error || "Failed to load whitelist");
        }
      } catch {
        setError("Failed to initialize");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [apiToken]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!apiToken || !newSteamId.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await addWhitelistEntry(
      apiToken,
      newSteamId.trim(),
      newReason.trim() || undefined
    );

    if (res.success && res.data) {
      setEntries((prev) => [res.data!, ...prev]);
      setNewSteamId("");
      setNewReason("");
    } else {
      setAddError(res.error || "Failed to add entry");
    }
    setAdding(false);
  }

  function startEdit(entry: WhitelistEntry) {
    setEditingId(entry.id);
    setEditSteamId(entry.steamId);
    setEditReason(entry.reason || "");
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!apiToken) return;
    setEditError(null);

    const res = await updateWhitelistEntry(apiToken, id, {
      steamId: editSteamId.trim(),
      reason: editReason.trim() || undefined,
    });

    if (res.success && res.data) {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? res.data! : e))
      );
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update entry");
    }
  }

  async function handleDelete(id: string) {
    if (!apiToken) return;

    const res = await deleteWhitelistEntry(apiToken, id);
    if (res.success) {
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  }

  function handleExport() {
    const header = "Steam ID,Added By,Reason,Date Added";
    const rows = entries.map(
      (e) =>
        `${e.steamId},${e.addedBy},"${(e.reason || "").replace(/"/g, '""')}",${e.createdAt}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `whitelist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !apiToken) return;

    setImportStatus("Importing...");

    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());

    const start = lines[0]?.toLowerCase().includes("steam") ? 1 : 0;

    const importEntries: { steamId: string; reason?: string }[] = [];
    for (let i = start; i < lines.length; i++) {
      const parts = lines[i].split(",");
      const steamId = parts[0]?.trim();
      if (steamId) {
        const reason = parts[2]?.trim().replace(/^"|"$/g, "") || undefined;
        importEntries.push({ steamId, reason });
      }
    }

    if (importEntries.length === 0) {
      setImportStatus("No valid entries found in CSV");
      return;
    }

    const res = await bulkAddWhitelist(apiToken, importEntries);
    if (res.success && res.data) {
      setImportStatus(
        `Imported ${res.data.created} entries, ${res.data.skipped} skipped (duplicates)`
      );
      const wlRes = await getWhitelist(apiToken);
      if (wlRes.success && wlRes.data) {
        setEntries(wlRes.data);
      }
    } else {
      setImportStatus(res.error || "Import failed");
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const filtered = search
    ? entries.filter(
        (e) =>
          e.steamId.includes(search) ||
          e.addedBy.toLowerCase().includes(search.toLowerCase()) ||
          e.reason?.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  if (loading) {
    return <div className="text-text-secondary">Loading whitelist...</div>;
  }

  if (error) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">
          Whitelist
        </h1>
        <div className="flex items-center gap-3">
          <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
            {entries.length} entries
          </span>
        </div>
      </div>

      {/* Actions bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Steam ID, added by, or reason..."
          className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleExport}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
        >
          Export CSV
        </button>
        {canManage && (
          <label className="cursor-pointer rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary">
            Import CSV
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleImport}
              className="hidden"
            />
          </label>
        )}
      </div>

      {importStatus && (
        <div className="mb-4 rounded-sm border border-accent/20 bg-accent/5 px-4 py-2.5 text-sm text-accent">
          {importStatus}
          <button
            onClick={() => setImportStatus(null)}
            className="ml-3 text-text-muted hover:text-text-primary"
          >
            x
          </button>
        </div>
      )}

      {/* Add entry form */}
      {canManage && (
        <form
          onSubmit={handleAdd}
          className="facet-border mb-6 flex flex-wrap gap-3 rounded-sm bg-bg-card p-4"
        >
          <input
            type="text"
            value={newSteamId}
            onChange={(e) => setNewSteamId(e.target.value)}
            placeholder="Steam64 ID"
            className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            required
          />
          <input
            type="text"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-64 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding}
            className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add Entry"}
          </button>
          {addError && (
            <div className="w-full text-sm text-danger">{addError}</div>
          )}
        </form>
      )}

      {/* Whitelist table */}
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Steam ID
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Added By
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Reason
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Date Added
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
                    colSpan={canManage ? 5 : 4}
                    className="px-4 py-8 text-center text-text-muted"
                  >
                    {search
                      ? "No entries match your search"
                      : "No whitelist entries yet"}
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-border/50 transition-colors hover:bg-bg-tertiary/50"
                  >
                    <td className="px-4 py-3">
                      {editingId === entry.id ? (
                        <input
                          type="text"
                          value={editSteamId}
                          onChange={(e) => setEditSteamId(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-accent focus:border-accent focus:outline-none"
                        />
                      ) : (
                        <code className="text-accent">{entry.steamId}</code>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {entry.addedBy}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {editingId === entry.id ? (
                        <input
                          type="text"
                          value={editReason}
                          onChange={(e) => setEditReason(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                          placeholder="Reason (optional)"
                        />
                      ) : (
                        entry.reason || (
                          <span className="text-text-muted">--</span>
                        )
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3">
                        {editingId === entry.id ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveEdit(entry.id)}
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
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => startEdit(entry)}
                              className="text-xs text-text-muted transition-colors hover:text-accent"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(entry.id)}
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
