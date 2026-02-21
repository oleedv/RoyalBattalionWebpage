"use client";

import { useState, useEffect } from "react";
import {
  getWhitelist,
  addWhitelistEntry,
  updateWhitelistEntry,
  deleteWhitelistEntry,
  bulkAddWhitelist,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { WhitelistEntry } from "shared";

interface ParsedImportRow {
  steamId: string;
  name: string;
  clan: string;
  role: string;
  error: boolean;
}

export default function WhitelistPage() {
  const { apiToken, hasPermission } = usePermissions();
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [newSteamId, setNewSteamId] = useState("");
  const [newName, setNewName] = useState("");
  const [newClan, setNewClan] = useState("");
  const [newRole, setNewRole] = useState("");
  const [newReason, setNewReason] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteamId, setEditSteamId] = useState("");
  const [editName, setEditName] = useState("");
  const [editClan, setEditClan] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [importStep, setImportStep] = useState<"paste" | "review">("paste");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

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

    const res = await addWhitelistEntry(apiToken, newSteamId.trim(), {
      name: newName.trim() || undefined,
      clan: newClan.trim() || undefined,
      role: newRole.trim() || undefined,
      reason: newReason.trim() || undefined,
    });

    if (res.success && res.data) {
      setEntries((prev) => [res.data!, ...prev]);
      setNewSteamId("");
      setNewName("");
      setNewClan("");
      setNewRole("");
      setNewReason("");
    } else {
      setAddError(res.error || "Failed to add entry");
    }
    setAdding(false);
  }

  function startEdit(entry: WhitelistEntry) {
    setEditingId(entry.id);
    setEditSteamId(entry.steamId);
    setEditName(entry.name || "");
    setEditClan(entry.clan || "");
    setEditRole(entry.role || "");
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
      name: editName.trim() || undefined,
      clan: editClan.trim() || undefined,
      role: editRole.trim() || undefined,
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
    const header = "Steam ID,Name,Clan,Role,Added By,Reason,Date Added";
    const rows = entries.map(
      (e) =>
        `${e.steamId},"${(e.name || "").replace(/"/g, '""')}","${(e.clan || "").replace(/"/g, '""')}","${(e.role || "").replace(/"/g, '""')}",${e.addedBy},"${(e.reason || "").replace(/"/g, '""')}",${e.createdAt}`
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

  // Import modal functions
  function openImportModal() {
    setShowImportModal(true);
    setImportText("");
    setImportRows([]);
    setImportStep("paste");
    setImportStatus(null);
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportText("");
    setImportRows([]);
    setImportStep("paste");
    setImportStatus(null);
  }

  function parseImportText() {
    const lines = importText.split("\n").filter((l) => l.trim());
    const parsed: ParsedImportRow[] = lines.map((line) => {
      const match = line.match(/^(.+?)=(\d+):(.+?)\s*\/\/\s*(.+)$/);
      if (match) {
        return {
          clan: match[1].trim(),
          steamId: match[2].trim(),
          role: match[3].trim(),
          name: match[4].trim(),
          error: false,
        };
      }
      return { steamId: "", name: "", clan: "", role: "", error: true };
    });
    setImportRows(parsed);
    setImportStep("review");
  }

  function updateImportRow(index: number, field: keyof ParsedImportRow, value: string) {
    setImportRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: value, error: false } : row
      )
    );
  }

  function removeImportRow(index: number) {
    setImportRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function confirmImport() {
    if (!apiToken) return;
    const validRows = importRows.filter((r) => r.steamId.trim());
    if (validRows.length === 0) return;

    setImporting(true);
    const res = await bulkAddWhitelist(
      apiToken,
      validRows.map((r) => ({
        steamId: r.steamId,
        name: r.name || undefined,
        clan: r.clan || undefined,
        role: r.role || undefined,
      }))
    );

    if (res.success && res.data) {
      setImportStatus(
        `Imported ${res.data.created} entries, ${res.data.skipped} skipped (duplicates)`
      );
      const wlRes = await getWhitelist(apiToken);
      if (wlRes.success && wlRes.data) {
        setEntries(wlRes.data);
      }
      closeImportModal();
    } else {
      setImportStatus(res.error || "Import failed");
    }
    setImporting(false);
  }

  const filtered = search
    ? entries.filter(
        (e) =>
          e.steamId.includes(search) ||
          e.addedBy.toLowerCase().includes(search.toLowerCase()) ||
          e.name?.toLowerCase().includes(search.toLowerCase()) ||
          e.clan?.toLowerCase().includes(search.toLowerCase()) ||
          e.role?.toLowerCase().includes(search.toLowerCase()) ||
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
          placeholder="Search by Steam ID, name, clan, role..."
          className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleExport}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
        >
          Export CSV
        </button>
        {canManage && (
          <button
            onClick={openImportModal}
            className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Import
          </button>
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
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (optional)"
            className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-40"
          />
          <input
            type="text"
            value={newClan}
            onChange={(e) => setNewClan(e.target.value)}
            placeholder="Clan (optional)"
            className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-32"
          />
          <input
            type="text"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="Role (optional)"
            className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-32"
          />
          <input
            type="text"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            placeholder="Reason (optional)"
            className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-48"
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
                  Name
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Clan
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                  Added By
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
                    colSpan={canManage ? 7 : 6}
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
                      {editingId === entry.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                          placeholder="Name"
                        />
                      ) : (
                        entry.name || <span className="text-text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {editingId === entry.id ? (
                        <input
                          type="text"
                          value={editClan}
                          onChange={(e) => setEditClan(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                          placeholder="Clan"
                        />
                      ) : (
                        entry.clan || <span className="text-text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {editingId === entry.id ? (
                        <input
                          type="text"
                          value={editRole}
                          onChange={(e) => setEditRole(e.target.value)}
                          className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                          placeholder="Role"
                        />
                      ) : (
                        entry.role || <span className="text-text-muted">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {entry.addedBy}
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

      {/* Import Modal */}
      {showImportModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={closeImportModal} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-sm border border-border bg-bg-secondary p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold tracking-wide">
                  Import Whitelist
                </h2>
                <button
                  onClick={closeImportModal}
                  className="text-text-muted transition-colors hover:text-text-primary"
                >
                  x
                </button>
              </div>

              {importStep === "paste" && (
                <div>
                  <p className="mb-3 text-sm text-text-secondary">
                    Paste whitelist entries in the format:
                  </p>
                  <code className="mb-3 block rounded-sm bg-bg-tertiary px-3 py-2 text-xs text-text-secondary">
                    Admin=76561198310486875:SuperAdmin // Spud
                  </code>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="Paste entries here, one per line..."
                    rows={10}
                    className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={closeImportModal}
                      className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={parseImportText}
                      disabled={!importText.trim()}
                      className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
                    >
                      Parse
                    </button>
                  </div>
                </div>
              )}

              {importStep === "review" && (
                <div>
                  <p className="mb-3 text-sm text-text-secondary">
                    Review parsed entries. Edit fields or remove rows before importing.
                  </p>
                  <div className="mb-4 max-h-96 overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                            Steam ID
                          </th>
                          <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                            Name
                          </th>
                          <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                            Clan
                          </th>
                          <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                            Role
                          </th>
                          <th className="w-10 px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row, i) => (
                          <tr
                            key={i}
                            className={`border-b border-border/50 ${row.error ? "bg-danger/10" : ""}`}
                          >
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.steamId}
                                onChange={(e) => updateImportRow(i, "steamId", e.target.value)}
                                className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-accent focus:border-accent focus:outline-none"
                                placeholder="Steam64 ID"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.name}
                                onChange={(e) => updateImportRow(i, "name", e.target.value)}
                                className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                                placeholder="Name"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.clan}
                                onChange={(e) => updateImportRow(i, "clan", e.target.value)}
                                className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                                placeholder="Clan"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={row.role}
                                onChange={(e) => updateImportRow(i, "role", e.target.value)}
                                className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
                                placeholder="Role"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <button
                                onClick={() => removeImportRow(i)}
                                className="text-xs text-text-muted transition-colors hover:text-danger"
                              >
                                x
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">
                      {importRows.filter((r) => r.steamId.trim()).length} valid entries
                    </span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setImportStep("paste")}
                        className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
                      >
                        Back
                      </button>
                      <button
                        onClick={confirmImport}
                        disabled={importing || importRows.filter((r) => r.steamId.trim()).length === 0}
                        className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
                      >
                        {importing ? "Importing..." : "Import"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
