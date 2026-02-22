"use client";

import { useState, useEffect } from "react";
import {
  getWhitelist,
  addWhitelistEntry,
  updateWhitelistEntry,
  deleteWhitelistEntry,
  bulkAddWhitelist,
  getWhitelistCandidates,
  getAdminGroups,
  createAdminGroup,
  updateAdminGroup,
  deleteAdminGroup,
  getServerConfigs,
  toggleServerSync,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { WhitelistEntry, WhitelistCandidate, AdminGroup, ServerConfig } from "shared";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const SQUAD_PERMISSIONS = [
  "reserve", "pause", "kick", "ban", "changemap", "chat",
  "config", "immune", "cameraman", "forceteamchange", "teamchange", "debug",
  "clientdemos", "cheat", "featuretest",
];

type Tab = "entries" | "requests" | "groups";

// --- Import modal types ---
interface ParsedImportRow {
  steamId: string;
  name: string;
  clan: string;
  role: string;
  error: boolean;
}

// Default servers if no ServerConfig exists in DB
const DEFAULT_SERVERS = [
  { server: "main", label: "Main Server" },
  { server: "battle", label: "Battle Server" },
];

// --- Expiry helpers ---
function formatExpiry(expiresAt: string | null): { label: string; expired: boolean } | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  const now = new Date();
  if (exp <= now) return { label: "Expired", expired: true };
  const diff = exp.getTime() - now.getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 0) return { label: `${days}d left`, expired: false };
  const hours = Math.floor(diff / 3600000);
  return { label: `${hours}h left`, expired: false };
}

function getStoredDefaultServer(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rb-default-server") || "";
}

export default function WhitelistPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canManage = hasPermission("manage:whitelist");
  const isAdmin = hasPermission("admin");

  const [tab, setTab] = useState<Tab>("entries");
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [candidates, setCandidates] = useState<WhitelistCandidate[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [serverConfigs, setServerConfigs] = useState<ServerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Server selection
  const [servers, setServers] = useState<{ server: string; label: string }[]>(DEFAULT_SERVERS);
  const [activeServer, setActiveServer] = useState<string>("");

  // Dismissed candidates (client-side only)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Toggling sync
  const [togglingSync, setTogglingSync] = useState(false);

  // Initialize: fetch server configs then load data for default server
  useEffect(() => {
    async function init() {
      if (!apiToken) return;
      try {
        // Fetch server configs
        const configRes = await getServerConfigs(apiToken);
        if (configRes.success && configRes.data && configRes.data.length > 0) {
          setServerConfigs(configRes.data);
          const srvList = configRes.data.map((c) => ({ server: c.server, label: c.label }));
          setServers(srvList);
          // Use stored default or first server
          const stored = getStoredDefaultServer();
          const initial = srvList.find((s) => s.server === stored)?.server || srvList[0].server;
          setActiveServer(initial);
        } else {
          // No configs in DB, use defaults
          const stored = getStoredDefaultServer();
          const initial = DEFAULT_SERVERS.find((s) => s.server === stored)?.server || "main";
          setActiveServer(initial);
        }

        // Fetch groups (shared across servers)
        const grpRes = await getAdminGroups(apiToken);
        if (grpRes.success && grpRes.data) setGroups(grpRes.data);
      } catch {
        setError("Failed to initialize");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [apiToken]);

  // Fetch entries and candidates when active server changes
  useEffect(() => {
    // Clear dismissed set so candidates approved on other servers still show
    setDismissed(new Set());

    async function loadServer() {
      if (!apiToken || !activeServer) return;
      try {
        const wlRes = await getWhitelist(apiToken, activeServer);
        if (wlRes.success && wlRes.data) setEntries(wlRes.data);
        else setError(wlRes.error || "Failed to load whitelist");

        if (canManage) {
          const candRes = await getWhitelistCandidates(apiToken, activeServer);
          if (candRes.success && candRes.data) setCandidates(candRes.data);
        }
      } catch {
        setError("Failed to load whitelist");
      }
    }
    loadServer();
  }, [apiToken, activeServer, canManage]);

  async function handleToggleSync() {
    if (!apiToken || !activeServer) return;
    setTogglingSync(true);
    const res = await toggleServerSync(apiToken, activeServer);
    if (res.success && res.data) {
      setServerConfigs((prev) =>
        prev.map((c) => (c.server === activeServer ? res.data! : c))
      );
    }
    setTogglingSync(false);
  }

  if (loading) return <div className="text-text-secondary">Loading whitelist...</div>;
  if (error) return <div className="text-danger">{error}</div>;

  const pendingCandidates = candidates.filter((c) => !dismissed.has(c.userId));
  const currentConfig = serverConfigs.find((c) => c.server === activeServer);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">Whitelist</h1>
        <span className="rounded-sm border border-accent/20 bg-accent/10 px-3 py-1 text-sm text-accent">
          {entries.length} entries
        </span>
      </div>

      {/* Server tabs */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex gap-1 rounded-sm border border-border bg-bg-tertiary p-1">
          {servers.map((s) => (
            <button
              key={s.server}
              onClick={() => setActiveServer(s.server)}
              className={`rounded-sm px-4 py-2 text-sm font-medium tracking-wide transition-all ${
                activeServer === s.server
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-text-secondary hover:text-text-primary border border-transparent"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* SFTP Sync toggle (admin only) */}
        {isAdmin && currentConfig && (
          <button
            onClick={handleToggleSync}
            disabled={togglingSync}
            className={`ml-auto flex items-center gap-2 rounded-sm border px-4 py-2 text-sm font-medium tracking-wide transition-all disabled:opacity-50 ${
              currentConfig.syncEnabled
                ? "border-success/30 bg-success/10 text-success"
                : "border-border bg-bg-tertiary text-text-muted"
            }`}
          >
            <span className={`inline-block h-2 w-2 rounded-full ${currentConfig.syncEnabled ? "bg-success" : "bg-text-muted"}`} />
            SFTP Sync {currentConfig.syncEnabled ? "On" : "Off"}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {(["entries", "requests", "groups"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-5 py-2.5 text-sm font-medium tracking-wide transition-colors ${
              tab === t
                ? "text-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <span className="capitalize">{t}</span>
            {t === "requests" && pendingCandidates.length > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {pendingCandidates.length}
              </span>
            )}
            {tab === t && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
            )}
          </button>
        ))}
      </div>

      {tab === "entries" && (
        <EntriesTab
          entries={entries}
          setEntries={setEntries}
          groups={groups}
          apiToken={apiToken}
          canManage={canManage}
          activeServer={activeServer}
        />
      )}
      {tab === "requests" && (
        <RequestsTab
          candidates={pendingCandidates}
          groups={groups}
          entries={entries}
          setEntries={setEntries}
          dismissed={dismissed}
          setDismissed={setDismissed}
          apiToken={apiToken}
          canManage={canManage}
          activeServer={activeServer}
        />
      )}
      {tab === "groups" && (
        <GroupsTab
          groups={groups}
          setGroups={setGroups}
          apiToken={apiToken}
          canManage={canManage}
        />
      )}
    </div>
  );
}

// ============================================================
// ENTRIES TAB
// ============================================================

function EntriesTab({
  entries,
  setEntries,
  groups,
  apiToken,
  canManage,
  activeServer,
}: {
  entries: WhitelistEntry[];
  setEntries: React.Dispatch<React.SetStateAction<WhitelistEntry[]>>;
  groups: AdminGroup[];
  apiToken: string | null;
  canManage: boolean;
  activeServer: string;
}) {
  const [search, setSearch] = useState("");

  // Add form
  const [newSteamId, setNewSteamId] = useState("");
  const [newName, setNewName] = useState("");
  const [newClan, setNewClan] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSteamId, setEditSteamId] = useState("");
  const [editName, setEditName] = useState("");
  const [editClan, setEditClan] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  // Review cfg modal
  const [showCfgModal, setShowCfgModal] = useState(false);
  const [cfgContent, setCfgContent] = useState("");
  const [cfgLoading, setCfgLoading] = useState(false);
  const [cfgCopied, setCfgCopied] = useState(false);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [importStep, setImportStep] = useState<"paste" | "review">("paste");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!apiToken || !newSteamId.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await addWhitelistEntry(apiToken, newSteamId.trim(), {
      name: newName.trim() || undefined,
      clan: newClan.trim() || undefined,
      groupId: newGroupId || undefined,
      reason: newReason.trim() || undefined,
      expiresAt: newExpiresAt || undefined,
      server: activeServer,
    });

    if (res.success && res.data) {
      setEntries((prev) => [res.data!, ...prev]);
      setNewSteamId("");
      setNewName("");
      setNewClan("");
      setNewGroupId("");
      setNewReason("");
      setNewExpiresAt("");
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
    setEditGroupId(entry.groupId || "");
    setEditReason(entry.reason || "");
    setEditExpiresAt(entry.expiresAt ? entry.expiresAt.slice(0, 16) : "");
    setEditError(null);
  }

  async function saveEdit(id: string) {
    if (!apiToken) return;
    setEditError(null);

    const res = await updateWhitelistEntry(apiToken, id, {
      steamId: editSteamId.trim(),
      name: editName.trim() || undefined,
      clan: editClan.trim() || undefined,
      groupId: editGroupId || null,
      reason: editReason.trim() || undefined,
      expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
    });

    if (res.success && res.data) {
      setEntries((prev) => prev.map((e) => (e.id === id ? res.data! : e)));
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
    window.open(`${BASE_URL}/admins.cfg?server=${encodeURIComponent(activeServer)}`, "_blank");
  }

  async function handleReviewCfg() {
    setShowCfgModal(true);
    setCfgLoading(true);
    setCfgCopied(false);
    try {
      const res = await fetch(`${BASE_URL}/admins.cfg?server=${encodeURIComponent(activeServer)}`);
      setCfgContent(await res.text());
    } catch {
      setCfgContent("Failed to load admins.cfg");
    } finally {
      setCfgLoading(false);
    }
  }

  function handleCopyCfg() {
    navigator.clipboard.writeText(cfgContent);
    setCfgCopied(true);
    setTimeout(() => setCfgCopied(false), 1500);
  }

  // Import
  function openImportModal() {
    setShowImportModal(true);
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
        return { clan: match[1].trim(), steamId: match[2].trim(), role: match[3].trim(), name: match[4].trim(), error: false };
      }
      return { steamId: "", name: "", clan: "", role: "", error: true };
    });
    setImportRows(parsed);
    setImportStep("review");
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
      })),
      activeServer
    );

    if (res.success && res.data) {
      setImportStatus(`Imported ${res.data.created} entries, ${res.data.skipped} skipped`);
      const wlRes = await getWhitelist(apiToken, activeServer);
      if (wlRes.success && wlRes.data) setEntries(wlRes.data);
      setShowImportModal(false);
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
          e.groupName?.toLowerCase().includes(search.toLowerCase()) ||
          e.reason?.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  return (
    <>
      {/* Actions bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Steam ID, name, clan, group..."
          className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleReviewCfg}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
        >
          Review admins.cfg
        </button>
        <button
          onClick={handleExport}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
        >
          Export admins.cfg
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
          <button onClick={() => setImportStatus(null)} className="ml-3 text-text-muted hover:text-text-primary">x</button>
        </div>
      )}

      {/* Add entry form */}
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 flex flex-wrap gap-3 rounded-sm bg-bg-card p-4">
          <input type="text" value={newSteamId} onChange={(e) => setNewSteamId(e.target.value)} placeholder="Steam64 ID" className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none" required />
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-36" />
          <input type="text" value={newClan} onChange={(e) => setNewClan(e.target.value)} placeholder="Clan" className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-28" />
          <select value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-36">
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <input type="text" value={newReason} onChange={(e) => setNewReason(e.target.value)} placeholder="Reason" className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-40" />
          <input type="datetime-local" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-48" title="Expiry (optional)" />
          <button type="submit" disabled={adding} className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50">
            {adding ? "Adding..." : "Add Entry"}
          </button>
          {addError && <div className="w-full text-sm text-danger">{addError}</div>}
        </form>
      )}

      {/* Table */}
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Steam ID</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Name</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Clan</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Group</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Expires</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Added</th>
                {canManage && <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={canManage ? 7 : 6} className="px-4 py-8 text-center text-text-muted">
                    {search ? "No entries match your search" : "No whitelist entries yet"}
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => {
                  const expiry = formatExpiry(entry.expiresAt);
                  const isEditing = editingId === entry.id;

                  return (
                    <tr key={entry.id} className={`border-b border-border/50 transition-colors hover:bg-bg-tertiary/50 ${expiry?.expired ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input type="text" value={editSteamId} onChange={(e) => setEditSteamId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-accent focus:border-accent focus:outline-none" />
                        ) : (
                          <code className="text-accent">{entry.steamId}</code>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {isEditing ? (
                          <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" placeholder="Name" />
                        ) : (
                          entry.name || <span className="text-text-muted">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {isEditing ? (
                          <input type="text" value={editClan} onChange={(e) => setEditClan(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" placeholder="Clan" />
                        ) : (
                          entry.clan || <span className="text-text-muted">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {isEditing ? (
                          <select value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                            <option value="">None</option>
                            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        ) : (
                          entry.groupName ? (
                            <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs text-accent">{entry.groupName}</span>
                          ) : (
                            entry.role ? <span className="text-text-secondary">{entry.role}</span> : <span className="text-text-muted">--</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input type="datetime-local" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" />
                        ) : expiry ? (
                          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${expiry.expired ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                            {expiry.label}
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">Permanent</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {new Date(entry.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      {canManage && (
                        <td className="px-4 py-3">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => saveEdit(entry.id)} className="text-xs text-success transition-colors hover:text-success/80">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">Cancel</button>
                              {editError && <span className="text-xs text-danger">{editError}</span>}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => startEdit(entry)} className="text-xs text-text-muted transition-colors hover:text-accent">Edit</button>
                              <button onClick={() => handleDelete(entry.id)} className="text-xs text-text-muted transition-colors hover:text-danger">Delete</button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Review admins.cfg Modal */}
      {showCfgModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowCfgModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="flex w-full max-w-3xl flex-col rounded-sm border border-border bg-bg-secondary" style={{ maxHeight: "80vh" }}>
              <div className="flex items-center justify-between border-b border-border px-6 py-4">
                <h2 className="font-display text-lg font-semibold tracking-wide">admins.cfg ({activeServer})</h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCopyCfg}
                    disabled={cfgLoading}
                    className="rounded-sm border border-border px-4 py-1.5 text-xs font-medium tracking-wide text-text-secondary transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-40"
                  >
                    {cfgCopied ? "Copied!" : "Copy"}
                  </button>
                  <button onClick={() => setShowCfgModal(false)} className="text-text-muted transition-colors hover:text-text-primary">x</button>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-6">
                {cfgLoading ? (
                  <div className="text-text-muted">Loading...</div>
                ) : (
                  <pre className="whitespace-pre font-mono text-xs leading-relaxed text-text-secondary">{cfgContent}</pre>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setShowImportModal(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-sm border border-border bg-bg-secondary p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-lg font-semibold tracking-wide">Import Whitelist ({activeServer})</h2>
                <button onClick={() => setShowImportModal(false)} className="text-text-muted transition-colors hover:text-text-primary">x</button>
              </div>

              {importStep === "paste" && (
                <div>
                  <p className="mb-3 text-sm text-text-secondary">Paste entries in the format:</p>
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
                    <button onClick={() => setShowImportModal(false)} className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary">Cancel</button>
                    <button onClick={parseImportText} disabled={!importText.trim()} className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50">Parse</button>
                  </div>
                </div>
              )}

              {importStep === "review" && (
                <div>
                  <p className="mb-3 text-sm text-text-secondary">Review parsed entries before importing.</p>
                  <div className="mb-4 max-h-96 overflow-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Steam ID</th>
                          <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Name</th>
                          <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Clan</th>
                          <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Role</th>
                          <th className="w-10 px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row, i) => (
                          <tr key={i} className={`border-b border-border/50 ${row.error ? "bg-danger/10" : ""}`}>
                            <td className="px-3 py-2"><input type="text" value={row.steamId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => j === i ? { ...r, steamId: e.target.value, error: false } : r))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-accent focus:border-accent focus:outline-none" /></td>
                            <td className="px-3 py-2"><input type="text" value={row.name} onChange={(e) => setImportRows((prev) => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" /></td>
                            <td className="px-3 py-2"><input type="text" value={row.clan} onChange={(e) => setImportRows((prev) => prev.map((r, j) => j === i ? { ...r, clan: e.target.value } : r))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" /></td>
                            <td className="px-3 py-2"><input type="text" value={row.role} onChange={(e) => setImportRows((prev) => prev.map((r, j) => j === i ? { ...r, role: e.target.value } : r))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" /></td>
                            <td className="px-3 py-2"><button onClick={() => setImportRows((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-text-muted transition-colors hover:text-danger">x</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-muted">{importRows.filter((r) => r.steamId.trim()).length} valid entries</span>
                    <div className="flex gap-3">
                      <button onClick={() => setImportStep("paste")} className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary">Back</button>
                      <button onClick={confirmImport} disabled={importing || importRows.filter((r) => r.steamId.trim()).length === 0} className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50">
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
    </>
  );
}

// ============================================================
// REQUESTS TAB
// ============================================================

function RequestsTab({
  candidates,
  groups,
  entries,
  setEntries,
  dismissed,
  setDismissed,
  apiToken,
  canManage,
  activeServer,
}: {
  candidates: WhitelistCandidate[];
  groups: AdminGroup[];
  entries: WhitelistEntry[];
  setEntries: React.Dispatch<React.SetStateAction<WhitelistEntry[]>>;
  dismissed: Set<string>;
  setDismissed: React.Dispatch<React.SetStateAction<Set<string>>>;
  apiToken: string | null;
  canManage: boolean;
  activeServer: string;
}) {
  const [approving, setApproving] = useState<string | null>(null);
  const [approveGroupId, setApproveGroupId] = useState<Record<string, string>>({});

  async function handleApprove(candidate: WhitelistCandidate) {
    if (!apiToken) return;
    setApproving(candidate.userId);

    const groupId = approveGroupId[candidate.userId] || undefined;
    const res = await addWhitelistEntry(apiToken, candidate.steamId, {
      name: candidate.discordName,
      groupId,
      server: activeServer,
    });

    if (res.success && res.data) {
      setEntries((prev) => [res.data!, ...prev]);
      setDismissed((prev) => new Set(prev).add(candidate.userId));
    }
    setApproving(null);
  }

  function handleDismiss(userId: string) {
    setDismissed((prev) => new Set(prev).add(userId));
  }

  if (!canManage) {
    return <div className="text-text-muted py-8 text-center">You need manage:whitelist permission to view requests.</div>;
  }

  if (candidates.length === 0) {
    return (
      <div className="facet-border rounded-sm bg-bg-card px-6 py-12 text-center text-text-muted">
        No pending whitelist requests. Users with a qualifying Discord role and linked Steam ID will appear here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {candidates.map((c) => (
        <div key={c.userId} className="facet-border flex items-center justify-between rounded-sm bg-bg-card p-4">
          <div>
            <div className="mb-1 font-medium text-text-primary">{c.discordName}</div>
            <div className="flex items-center gap-3 text-xs text-text-secondary">
              <code className="text-accent">{c.steamId}</code>
              <span className="h-1 w-1 rounded-full bg-text-muted" />
              <span>Role: {c.roleName}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={approveGroupId[c.userId] || ""}
              onChange={(e) => setApproveGroupId((prev) => ({ ...prev, [c.userId]: e.target.value }))}
              className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">Whitelist (default)</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <button
              onClick={() => handleApprove(c)}
              disabled={approving === c.userId}
              className="rounded-sm bg-success/15 px-4 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/25 disabled:opacity-50"
            >
              {approving === c.userId ? "Approving..." : "Approve"}
            </button>
            <button
              onClick={() => handleDismiss(c.userId)}
              className="text-xs text-text-muted transition-colors hover:text-text-secondary"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// GROUPS TAB
// ============================================================

function GroupsTab({
  groups,
  setGroups,
  apiToken,
  canManage,
}: {
  groups: AdminGroup[];
  setGroups: React.Dispatch<React.SetStateAction<AdminGroup[]>>;
  apiToken: string | null;
  canManage: boolean;
}) {
  // Add form
  const [newName, setNewName] = useState("");
  const [newPerms, setNewPerms] = useState<Set<string>>(new Set());
  const [newOrder, setNewOrder] = useState(0);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPerms, setEditPerms] = useState<Set<string>>(new Set());
  const [editOrder, setEditOrder] = useState(0);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!apiToken || !newName.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await createAdminGroup(apiToken, {
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
    if (!apiToken) return;
    setEditError(null);

    const res = await updateAdminGroup(apiToken, id, {
      name: editName.trim(),
      permissions: Array.from(editPerms).join(","),
      sortOrder: editOrder,
    });

    if (res.success && res.data) {
      setGroups((prev) => prev.map((g) => (g.id === id ? res.data! : g)).sort((a, b) => a.sortOrder - b.sortOrder));
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update group");
    }
  }

  async function handleDelete(id: string) {
    if (!apiToken) return;
    const res = await deleteAdminGroup(apiToken, id);
    if (res.success) {
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setDeletingId(null);
    }
  }

  function PermCheckboxes({ perms, setPerms, disabled }: { perms: Set<string>; setPerms: (fn: (prev: Set<string>) => Set<string>) => void; disabled?: boolean }) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {SQUAD_PERMISSIONS.map((p) => {
          const active = perms.has(p);
          return (
            <button
              key={p}
              type="button"
              disabled={disabled}
              onClick={() => setPerms((prev) => {
                const next = new Set(prev);
                if (next.has(p)) next.delete(p);
                else next.add(p);
                return next;
              })}
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

  return (
    <>
      {/* Add group form */}
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 rounded-sm bg-bg-card p-4">
          <div className="mb-3 flex flex-wrap gap-3">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Group name (e.g. Whitelist)" className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none" required />
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-text-muted whitespace-nowrap">Priority</label>
              <input type="number" value={newOrder} onChange={(e) => setNewOrder(Number(e.target.value))} className="w-16 rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary text-center focus:border-accent focus:outline-none" title="Lower number = higher priority in admins.cfg" />
            </div>
            <button type="submit" disabled={adding} className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50">
              {adding ? "Creating..." : "Create Group"}
            </button>
          </div>
          <PermCheckboxes perms={newPerms} setPerms={setNewPerms} />
          {addError && <div className="mt-2 text-sm text-danger">{addError}</div>}
        </form>
      )}

      {/* Groups list */}
      {groups.length === 0 ? (
        <div className="facet-border rounded-sm bg-bg-card px-6 py-12 text-center text-text-muted">
          No admin groups defined yet. Create groups like Whitelist, Admin, SuperAdmin to use in the admins.cfg.
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
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-text-muted whitespace-nowrap">Priority</label>
                        <input type="number" value={editOrder} onChange={(e) => setEditOrder(Number(e.target.value))} className="w-16 rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary text-center focus:border-accent focus:outline-none" title="Lower number = higher priority in admins.cfg" />
                      </div>
                      <button onClick={() => saveEdit(g.id)} className="rounded-sm bg-accent px-4 py-2 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted">Save</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">Cancel</button>
                    </div>
                    <PermCheckboxes perms={editPerms} setPerms={setEditPerms} />
                    {editError && <div className="mt-2 text-sm text-danger">{editError}</div>}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="font-display text-base font-semibold tracking-wide text-text-primary">{g.name}</h3>
                        <span className="text-xs text-text-muted" title="Priority order in admins.cfg (lower = first)">Priority {g.sortOrder}</span>
                      </div>
                      {canManage && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEdit(g)} className="text-xs text-text-muted transition-colors hover:text-accent">Edit</button>
                          {deletingId === g.id ? (
                            <>
                              <button onClick={() => handleDelete(g.id)} className="text-xs text-danger transition-colors hover:text-danger/80">Confirm</button>
                              <button onClick={() => setDeletingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">Cancel</button>
                            </>
                          ) : (
                            <button onClick={() => setDeletingId(g.id)} className="text-xs text-text-muted transition-colors hover:text-danger">Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {g.permissions.split(",").filter(Boolean).map((p) => (
                        <span key={p} className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-[10px] font-medium tracking-wide text-accent">{p}</span>
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
