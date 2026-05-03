"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  getWhitelist,
  addWhitelistEntry,
  updateWhitelistEntry,
  deleteWhitelistEntry,
  bulkAddWhitelist,
  getWhitelistCandidates,
  getWhitelistEntry,
  addWhitelistComment,
  deleteWhitelistComment,
  bulkUpdateWhitelist,
  bulkDeleteWhitelist,
  getAdminGroups,
  createAdminGroup,
  updateAdminGroup,
  deleteAdminGroup,
  getClans,
  createClan,
  updateClan,
  deleteClan,
  getServerConfigs,
  toggleServerSync,
  getAuditLogs,
  getPlaytime,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePermissions } from "@/lib/permission-context";
import { Modal } from "@/components/modal";
import { SearchInput } from "@/components/search-input";
import { formatDate, formatRelativeTime, formatDateTime } from "@/lib/format";
import type { WhitelistEntry, WhitelistEntryWithComments, WhitelistComment, WhitelistCandidate, AdminGroup, Clan, ServerConfig, AuditLogEntry, PlaytimeStats } from "shared";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const SQUAD_PERMISSIONS = [
  "startvote", "cheat", "private", "config", "manageserver", "featuretest",
  "debug", "teamchange", "cameraman", "pause", "kick", "ban", "changemap",
  "chat", "balance", "reserve", "immune", "forceteamchange", "canseeadminchat",
  "clientdemos",
];

type Tab = "entries" | "requests" | "groups" | "clans" | "activity";

// --- Sort types ---
type SortKey = "steamId" | "name" | "clan" | "group" | "expires" | "created";
type SortDir = "asc" | "desc";

// --- Import modal types ---
interface ParsedImportRow {
  steamId: string;
  name: string;
  clanId: string;
  role: string;
  groupId: string;
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

// --- Helper components ---

function CopyableId({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button onClick={handleCopy} title={value} className="group flex items-center gap-1.5 text-left">
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

export default function WhitelistPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canManage = hasPermission("manage:whitelist");
  const canSync = hasPermission("manage:whitelist-sync");
  const canViewAudit = hasPermission("view:audit-logs");

  const [tab, setTab] = useState<Tab>("entries");
  const [entries, setEntries] = useState<WhitelistEntry[]>([]);
  const [candidates, setCandidates] = useState<WhitelistCandidate[]>([]);
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [clans, setClans] = useState<Clan[]>([]);
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

        // Fetch groups and clans (shared across servers)
        const [grpRes, clanRes] = await Promise.all([
          getAdminGroups(apiToken),
          getClans(apiToken),
        ]);
        if (grpRes.success && grpRes.data) setGroups(grpRes.data);
        if (clanRes.success && clanRes.data) setClans(clanRes.data);
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

  const refreshWhitelist = useCallback(async () => {
    if (!apiToken || !activeServer) return;
    try {
      const [wlRes, grpRes, clanRes] = await Promise.all([
        getWhitelist(apiToken, activeServer),
        getAdminGroups(apiToken),
        getClans(apiToken),
      ]);
      if (wlRes.success && wlRes.data) setEntries(wlRes.data);
      if (grpRes.success && grpRes.data) setGroups(grpRes.data);
      if (clanRes.success && clanRes.data) setClans(clanRes.data);
      if (canManage) {
        const candRes = await getWhitelistCandidates(apiToken, activeServer);
        if (candRes.success && candRes.data) setCandidates(candRes.data);
      }
    } catch { /* silent */ }
  }, [apiToken, activeServer, canManage]);

  useAutoRefresh(refreshWhitelist, 20_000, !!apiToken && !!activeServer);

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

  const visibleTabs: Tab[] = canViewAudit
    ? ["entries", "requests", "groups", "clans", "activity"]
    : ["entries", "requests", "groups", "clans"];

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

        {/* SFTP Sync toggle */}
        {canSync && currentConfig && (
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
        {visibleTabs.map((t) => (
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
          clans={clans}
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
      {tab === "clans" && (
        <ClansTab
          clans={clans}
          setClans={setClans}
          apiToken={apiToken}
          canManage={canManage}
        />
      )}
      {tab === "activity" && (
        <ActivityTab apiToken={apiToken} />
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
  clans,
  apiToken,
  canManage,
  activeServer,
}: {
  entries: WhitelistEntry[];
  setEntries: React.Dispatch<React.SetStateAction<WhitelistEntry[]>>;
  groups: AdminGroup[];
  clans: Clan[];
  apiToken: string | null;
  canManage: boolean;
  activeServer: string;
}) {
  const [search, setSearch] = useState("");
  const [filterClan, setFilterClan] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [showExpired, setShowExpired] = useState(false);

  // --- Sorting ---
  const [sortKey, setSortKey] = useState<SortKey>("clan");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "expires" || key === "created" ? "desc" : "asc");
    }
  }

  // Add form
  const [newSteamId, setNewSteamId] = useState("");
  const [newName, setNewName] = useState("");
  const [newClanId, setNewClanId] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Duplicate warnings
  const [warnings, setWarnings] = useState<string[]>([]);

  // Profile modal
  const [selectedEntry, setSelectedEntry] = useState<WhitelistEntryWithComments | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editSteamId, setEditSteamId] = useState("");
  const [editName, setEditName] = useState("");
  const [editClanId, setEditClanId] = useState("");
  const [editGroupId, setEditGroupId] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [activityLogs, setActivityLogs] = useState<AuditLogEntry[]>([]);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityLoading, setActivityLoading] = useState(false);
  const [playtimeStats, setPlaytimeStats] = useState<PlaytimeStats | null>(null);
  const [playtimeLoading, setPlaytimeLoading] = useState(false);

  // Bulk selection
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"group" | "clan" | "expiry" | "delete" | null>(null);
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [bulkClanId, setBulkClanId] = useState("");
  const [bulkExpiresAt, setBulkExpiresAt] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // Review cfg modal
  const [showCfgModal, setShowCfgModal] = useState(false);
  const [cfgContent, setCfgContent] = useState("");
  const [cfgCopied, setCfgCopied] = useState(false);

  // Import modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importRows, setImportRows] = useState<ParsedImportRow[]>([]);
  const [importStep, setImportStep] = useState<"paste" | "review">("paste");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // --- Open profile modal ---
  async function openProfile(entry: WhitelistEntry) {
    if (!apiToken) return;
    const res = await getWhitelistEntry(apiToken, entry.id);
    if (res.success && res.data) {
      setSelectedEntry(res.data);
      setEditing(false);
      setConfirmingDelete(false);
      setEditError(null);
      setCommentText("");
      setActivityLogs([]);
      setActivityOpen(false);
      setPlaytimeStats(null);
      setPlaytimeLoading(true);
      getPlaytime(apiToken, res.data.steamId)
        .then((pt) => { if (pt.success && pt.data) setPlaytimeStats(pt.data); })
        .finally(() => setPlaytimeLoading(false));
    }
  }

  function closeProfile() {
    setSelectedEntry(null);
    setEditing(false);
    setConfirmingDelete(false);
    setEditError(null);
    setCommentText("");
    setActivityLogs([]);
    setActivityOpen(false);
  }

  function startEdit() {
    if (!selectedEntry) return;
    setEditSteamId(selectedEntry.steamId);
    setEditName(selectedEntry.name || "");
    setEditClanId(selectedEntry.clanId || "");
    setEditGroupId(selectedEntry.groupId || "");
    setEditReason(selectedEntry.reason || "");
    setEditExpiresAt(selectedEntry.expiresAt ? selectedEntry.expiresAt.slice(0, 16) : "");
    setEditError(null);
    setEditing(true);
    setConfirmingDelete(false);
  }

  async function saveEdit() {
    if (!apiToken || !selectedEntry) return;
    setEditError(null);

    const selectedClan = clans.find((c) => c.id === editClanId);
    const res = await updateWhitelistEntry(apiToken, selectedEntry.id, {
      steamId: editSteamId.trim(),
      name: editName.trim() || undefined,
      clanId: editClanId || null,
      clan: selectedClan?.tag || undefined,
      groupId: editGroupId || null,
      reason: editReason.trim() || undefined,
      expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null,
    });

    if (res.success && res.data) {
      setEntries((prev) => prev.map((e) => (e.id === selectedEntry.id ? res.data! : e)));
      // Refresh profile
      const refreshed = await getWhitelistEntry(apiToken, selectedEntry.id);
      if (refreshed.success && refreshed.data) setSelectedEntry(refreshed.data);
      setEditing(false);
    } else {
      setEditError(res.error || "Failed to update entry");
    }
  }

  async function handleDeleteFromModal() {
    if (!apiToken || !selectedEntry) return;
    const res = await deleteWhitelistEntry(apiToken, selectedEntry.id);
    if (res.success) {
      setEntries((prev) => prev.filter((e) => e.id !== selectedEntry.id));
      closeProfile();
    }
  }

  async function handleAddComment() {
    if (!apiToken || !selectedEntry || !commentText.trim()) return;
    setCommentSaving(true);
    const res = await addWhitelistComment(apiToken, selectedEntry.id, commentText.trim());
    if (res.success && res.data) {
      setSelectedEntry((prev) => prev ? { ...prev, comments: [res.data!, ...prev.comments] } : prev);
      setCommentText("");
    }
    setCommentSaving(false);
  }

  async function handleDeleteComment(commentId: string) {
    if (!apiToken || !selectedEntry) return;
    const res = await deleteWhitelistComment(apiToken, selectedEntry.id, commentId);
    if (res.success) {
      setSelectedEntry((prev) => prev ? { ...prev, comments: prev.comments.filter((c) => c.id !== commentId) } : prev);
    }
  }

  async function loadActivity() {
    if (!apiToken || !selectedEntry) return;
    setActivityLoading(true);
    const res = await getAuditLogs(apiToken, { resource: "WhitelistEntry", resourceId: selectedEntry.id, limit: 50 });
    if (res.success && res.data) {
      setActivityLogs(res.data.items);
    }
    setActivityLoading(false);
  }

  function toggleActivity() {
    if (!activityOpen) {
      setActivityOpen(true);
      loadActivity();
    } else {
      setActivityOpen(false);
    }
  }

  function getActionVerb(action: string): string {
    switch (action) {
      case "whitelist.add": return "added this entry";
      case "whitelist.update": return "updated entry";
      case "whitelist.delete": return "removed entry";
      case "whitelist.comment.add": return "added a comment";
      case "whitelist.comment.delete": return "deleted a comment";
      case "whitelist.bulk_update": return "bulk updated";
      case "whitelist.bulk_add": return "bulk added";
      case "whitelist.bulk_delete": return "bulk deleted";
      default: return action;
    }
  }

  // --- Bulk actions ---
  function toggleBulkMode() {
    setBulkMode((prev) => !prev);
    setSelectedIds(new Set());
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
      setSelectedIds(new Set(filtered.map((e) => e.id)));
    }
  }

  async function executeBulkAction() {
    if (!apiToken || selectedIds.size === 0) return;
    setBulkProcessing(true);

    const ids = Array.from(selectedIds);

    if (bulkAction === "delete") {
      const res = await bulkDeleteWhitelist(apiToken, ids);
      if (res.success) {
        setEntries((prev) => prev.filter((e) => !selectedIds.has(e.id)));
        setSelectedIds(new Set());
        setBulkAction(null);
      }
    } else if (bulkAction === "group") {
      const res = await bulkUpdateWhitelist(apiToken, ids, { groupId: bulkGroupId || null });
      if (res.success) {
        const wlRes = await getWhitelist(apiToken, activeServer);
        if (wlRes.success && wlRes.data) setEntries(wlRes.data);
        setSelectedIds(new Set());
        setBulkAction(null);
      }
    } else if (bulkAction === "clan") {
      const res = await bulkUpdateWhitelist(apiToken, ids, { clanId: bulkClanId || null });
      if (res.success) {
        const wlRes = await getWhitelist(apiToken, activeServer);
        if (wlRes.success && wlRes.data) setEntries(wlRes.data);
        setSelectedIds(new Set());
        setBulkAction(null);
      }
    } else if (bulkAction === "expiry") {
      const res = await bulkUpdateWhitelist(apiToken, ids, { expiresAt: bulkExpiresAt ? new Date(bulkExpiresAt).toISOString() : null });
      if (res.success) {
        const wlRes = await getWhitelist(apiToken, activeServer);
        if (wlRes.success && wlRes.data) setEntries(wlRes.data);
        setSelectedIds(new Set());
        setBulkAction(null);
      }
    }

    setBulkProcessing(false);
  }

  // --- Add entry ---
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!apiToken || !newSteamId.trim()) return;
    setAddError(null);
    setAdding(true);

    const selectedClan = clans.find((c) => c.id === newClanId);
    const res = await addWhitelistEntry(apiToken, newSteamId.trim(), {
      name: newName.trim() || undefined,
      clanId: newClanId || undefined,
      clan: selectedClan?.tag || undefined,
      groupId: newGroupId || undefined,
      expiresAt: newExpiresAt || undefined,
      server: activeServer,
    });

    if (res.success && res.data) {
      setEntries((prev) => [res.data!, ...prev]);
      setNewSteamId("");
      setNewName("");
      setNewClanId("");
      setNewGroupId("");
      setNewExpiresAt("");
      const data = res.data as WhitelistEntry & { warnings?: string[] };
      if (data.warnings?.length) setWarnings(data.warnings);
    } else {
      setAddError(res.error || "Failed to add entry");
    }
    setAdding(false);
  }

  // --- CFG generation ---
  function generateCfgContent(): string {
    const lines: string[] = [];
    const now = new Date();
    const timestamp = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

    // Header
    lines.push("// ============================================================");
    lines.push("// Royal Battalion Whitelist");
    lines.push(`// Generated: ${timestamp}`);
    lines.push(`// Server: ${activeServer}`);
    lines.push("// ============================================================");
    lines.push("");

    // Group definitions
    const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const g of sortedGroups) {
      lines.push(`Group=${g.name}:${g.permissions}`);
    }
    if (sortedGroups.length > 0) lines.push("");

    // Entries grouped by clan
    const activeEntries = entries.filter((e) => {
      if (!e.expiresAt) return true;
      return new Date(e.expiresAt) > now;
    });

    const byClan = new Map<string, WhitelistEntry[]>();
    for (const e of activeEntries) {
      const clan = e.clan || "No Clan";
      if (!byClan.has(clan)) byClan.set(clan, []);
      byClan.get(clan)!.push(e);
    }

    const sortedClans = [...byClan.keys()].sort((a, b) => {
      if (a === "No Clan") return 1;
      if (b === "No Clan") return -1;
      return a.localeCompare(b);
    });

    for (const clan of sortedClans) {
      lines.push(`// ${clan}`);
      for (const e of byClan.get(clan)!) {
        const groupName = e.groupName || e.role || "Whitelist";
        const playerName = e.name || e.steamId;
        lines.push(`Admin=${e.steamId}:${groupName} // ${playerName}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  }

  function handleExport() {
    const content = generateCfgContent();
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "admins.cfg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleReviewCfg() {
    setCfgCopied(false);
    setCfgContent(generateCfgContent());
    setShowCfgModal(true);
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
    const allLines = importText.split("\n");
    const parsed: ParsedImportRow[] = [];
    let currentClanId = "";

    for (const line of allLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("Group=")) continue;

      // Detect clan section headers like "// RB" or "// No Clan"
      if (trimmed.startsWith("//")) {
        const sectionName = trimmed.replace(/^\/\/\s*/, "").trim();
        if (sectionName && sectionName !== "No Clan") {
          // Match by tag or name (case-insensitive)
          const matchedClan = clans.find(
            (c) => c.tag.toLowerCase() === sectionName.toLowerCase() || c.name.toLowerCase() === sectionName.toLowerCase()
          );
          currentClanId = matchedClan?.id || "";
        } else {
          currentClanId = "";
        }
        continue;
      }

      // Parse Admin=steamId:GroupName // PlayerName
      const match = trimmed.match(/^(.+?)=(\d+):(.+?)\s*\/\/\s*(.+)$/);
      if (match) {
        const roleName = match[3].trim();
        const matchedGroup = groups.find((g) => g.name.toLowerCase() === roleName.toLowerCase());
        parsed.push({ clanId: currentClanId, steamId: match[2].trim(), role: roleName, groupId: matchedGroup?.id || "", name: match[4].trim(), error: false });
      } else {
        // Try simpler format: Admin=steamId:GroupName
        const simpleMatch = trimmed.match(/^(.+?)=(\d+):(.+)$/);
        if (simpleMatch) {
          const roleName = simpleMatch[3].trim();
          const matchedGroup = groups.find((g) => g.name.toLowerCase() === roleName.toLowerCase());
          parsed.push({ clanId: currentClanId, steamId: simpleMatch[2].trim(), role: roleName, groupId: matchedGroup?.id || "", name: "", error: false });
        } else {
          parsed.push({ steamId: "", name: "", clanId: "", role: "", groupId: "", error: true });
        }
      }
    }
    setImportRows(parsed);
    setImportStep("review");
  }

  async function confirmImport() {
    if (!apiToken) return;
    const validRows = importRows.filter((_, i) => {
      const row = importRows[i];
      return row.steamId.trim() && !importDupeMap.has(i);
    });
    if (validRows.length === 0) return;

    setImporting(true);
    const res = await bulkAddWhitelist(
      apiToken,
      validRows.map((r) => {
        const selectedClan = clans.find((c) => c.id === r.clanId);
        return {
          steamId: r.steamId,
          name: r.name || undefined,
          clanId: r.clanId || undefined,
          clan: selectedClan?.tag || undefined,
          groupId: r.groupId || undefined,
        };
      }),
      activeServer
    );

    if (res.success && res.data) {
      const { created, skipped } = res.data;
      let msg = `Imported ${created} ${created === 1 ? "entry" : "entries"}`;
      if (skipped.length > 0) {
        const now = Date.now();
        const sample = skipped.slice(0, 5)
          .map((s) => {
            if (s.reason === "duplicate_in_batch") return `${s.steamId} (duplicate in batch)`;
            const who = s.existingName ? ` as "${s.existingName}"` : "";
            let when = "";
            if (s.existingExpiresAt) {
              const exp = new Date(s.existingExpiresAt);
              const expIso = s.existingExpiresAt.slice(0, 10);
              when = exp.getTime() < now ? `, expired ${expIso}` : `, expires ${expIso}`;
            } else if (s.existingName !== undefined) {
              when = ", no expiry";
            }
            return `${s.steamId} (already whitelisted${who}${when})`;
          })
          .join(", ");
        const extra = skipped.length > 5 ? `, +${skipped.length - 5} more` : "";
        msg += `. Skipped ${skipped.length}: ${sample}${extra}`;
      }
      setImportStatus(msg);
      const wlRes = await getWhitelist(apiToken, activeServer);
      if (wlRes.success && wlRes.data) setEntries(wlRes.data);
      setShowImportModal(false);
    } else {
      setImportStatus(res.error || "Import failed");
    }
    setImporting(false);
  }

  // Classify import rows against the currently loaded whitelist (same server) and within the pasted batch
  const importDupeMap = useMemo(() => {
    const map = new Map<number, "existing" | "batch">();
    const existingSteamIds = new Set(entries.map((e) => e.steamId));
    const seen = new Set<string>();
    importRows.forEach((row, i) => {
      const sid = row.steamId.trim();
      if (!sid) return;
      if (existingSteamIds.has(sid)) {
        map.set(i, "existing");
      } else if (seen.has(sid)) {
        map.set(i, "batch");
      } else {
        seen.add(sid);
      }
    });
    return map;
  }, [importRows, entries]);

  const importCounts = useMemo(() => {
    let newCount = 0;
    let existingCount = 0;
    let batchCount = 0;
    let errorCount = 0;
    importRows.forEach((row, i) => {
      if (row.error) { errorCount++; return; }
      if (!row.steamId.trim()) { errorCount++; return; }
      const reason = importDupeMap.get(i);
      if (reason === "existing") existingCount++;
      else if (reason === "batch") batchCount++;
      else newCount++;
    });
    return { newCount, existingCount, batchCount, errorCount };
  }, [importRows, importDupeMap]);

  const filtered = useMemo(() => {
    const base = entries.filter((e) => {
      if (!showExpired && e.expiresAt && new Date(e.expiresAt) < new Date()) return false;
      if (filterClan && e.clanId !== filterClan) return false;
      if (filterGroup && e.groupId !== filterGroup) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          e.steamId.includes(search) ||
          e.addedBy.toLowerCase().includes(s) ||
          e.name?.toLowerCase().includes(s) ||
          e.clan?.toLowerCase().includes(s) ||
          e.groupName?.toLowerCase().includes(s) ||
          e.reason?.toLowerCase().includes(s)
        );
      }
      return true;
    });

    const dir = sortDir === "desc" ? -1 : 1;
    const nullsLast = <T,>(a: T | null | undefined, b: T | null | undefined): number | null => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      return null;
    };

    return [...base].sort((a, b) => {
      switch (sortKey) {
        case "steamId":
          return dir * a.steamId.localeCompare(b.steamId);
        case "name": {
          const n = nullsLast(a.name, b.name);
          return n ?? dir * a.name!.localeCompare(b.name!);
        }
        case "clan": {
          const av = a.clanName || a.clan;
          const bv = b.clanName || b.clan;
          const n = nullsLast(av, bv);
          return n ?? dir * av!.localeCompare(bv!);
        }
        case "group": {
          const av = a.groupName || a.role;
          const bv = b.groupName || b.role;
          const n = nullsLast(av, bv);
          return n ?? dir * av!.localeCompare(bv!);
        }
        case "expires": {
          const n = nullsLast(a.expiresAt, b.expiresAt);
          return n ?? dir * (new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime());
        }
        case "created":
          return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        default:
          return 0;
      }
    });
  }, [entries, search, filterClan, filterGroup, showExpired, sortKey, sortDir]);

  return (
    <>
      {/* Actions bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by Steam ID, name, clan, group..."
          className="flex-1"
        />
        <select
          value={filterClan}
          onChange={(e) => setFilterClan(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Clans</option>
          {clans.map((c) => (
            <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>
          ))}
        </select>
        <select
          value={filterGroup}
          onChange={(e) => setFilterGroup(e.target.value)}
          className="rounded-sm border border-border bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button
          onClick={() => setShowExpired((v) => !v)}
          className={`rounded-sm border px-4 py-2 text-sm transition-colors ${
            showExpired
              ? "border-accent/40 bg-accent/10 text-accent"
              : "border-border bg-bg-tertiary text-text-secondary hover:border-accent/40 hover:text-text-primary"
          }`}
        >
          {showExpired ? "Showing Expired" : "Show Expired"}
        </button>
        {canManage && (
          <button
            onClick={toggleBulkMode}
            className={`rounded-sm border px-4 py-2 text-sm transition-colors ${
              bulkMode
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border bg-bg-tertiary text-text-secondary hover:border-accent/40 hover:text-text-primary"
            }`}
          >
            {bulkMode ? "Cancel Select" : "Select"}
          </button>
        )}
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

      {/* Duplicate warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-sm border border-warning/20 bg-warning/5 px-4 py-2.5 text-sm text-warning">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
          <button onClick={() => setWarnings([])} className="ml-3 text-text-muted hover:text-text-primary">x</button>
        </div>
      )}

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
          <select value={newClanId} onChange={(e) => setNewClanId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-32">
            <option value="">No Clan</option>
            {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
          </select>
          <select value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-36">
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
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
                    { key: "steamId" as SortKey, label: "Steam ID" },
                    { key: "name" as SortKey, label: "Name" },
                    { key: "clan" as SortKey, label: "Clan" },
                    { key: "group" as SortKey, label: "Group" },
                    { key: "expires" as SortKey, label: "Expires" },
                    { key: "created" as SortKey, label: "Added" },
                  ] as const
                ).map(({ key, label }) => (
                  <th
                    key={label}
                    onClick={() => toggleSort(key)}
                    className="cursor-pointer select-none px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase hover:text-text-primary"
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {sortKey === key && (
                        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor">
                          {sortDir === "asc" ? <path d="M6 2l4 5H2z" /> : <path d="M6 10l4-5H2z" />}
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
                  <td colSpan={bulkMode ? 8 : 7} className="px-4 py-8 text-center text-text-muted">
                    {search ? "No entries match your search" : "No whitelist entries yet"}
                  </td>
                </tr>
              ) : (
                filtered.map((entry) => {
                  const expiry = formatExpiry(entry.expiresAt);

                  return (
                    <tr
                      key={entry.id}
                      onClick={() => {
                        if (bulkMode) {
                          toggleSelect(entry.id);
                        } else {
                          openProfile(entry);
                        }
                      }}
                      className={`border-b border-border/50 transition-colors hover:bg-bg-tertiary/50 ${expiry?.expired ? "opacity-50" : ""} ${
                        bulkMode && selectedIds.has(entry.id) ? "bg-accent/5" : ""
                      } ${bulkMode ? "cursor-pointer" : "cursor-pointer"}`}
                    >
                      {bulkMode && (
                        <td className="w-10 px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(entry.id)}
                            onChange={() => toggleSelect(entry.id)}
                            className="accent-accent"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="text-accent">{entry.steamId}</code>
                          <Link
                            href={entry.userId ? `/users/${entry.userId}` : `/users/by-steamid/${entry.steamId}`}
                            onClick={(e) => e.stopPropagation()}
                            title="Open unified profile"
                            className="rounded-sm border border-border/50 px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:border-accent/40 hover:text-accent"
                          >
                            profile →
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {entry.name || <span className="text-text-muted">--</span>}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {entry.clanName || entry.clan || <span className="text-text-muted">--</span>}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">
                        {entry.groupName ? (
                          <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs text-accent">{entry.groupName}</span>
                        ) : (
                          entry.role ? <span className="text-text-secondary">{entry.role}</span> : <span className="text-text-muted">--</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {expiry ? (
                          <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${expiry.expired ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                            {expiry.label}
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">Permanent</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {formatDate(entry.createdAt)}
                      </td>
                    </tr>
                  );
                })
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
                onClick={() => { setBulkAction("group"); setBulkGroupId(""); }}
                className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                Change Group
              </button>
              <button
                onClick={() => { setBulkAction("clan"); setBulkClanId(""); }}
                className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                Change Clan
              </button>
              <button
                onClick={() => { setBulkAction("expiry"); setBulkExpiresAt(""); }}
                className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
              >
                Set Expiry
              </button>
              <button
                onClick={() => setBulkAction("delete")}
                className="rounded-sm border border-danger/30 bg-danger/10 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
              >
                Delete
              </button>
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
            {bulkAction === "group" && "Change Group"}
            {bulkAction === "clan" && "Change Clan"}
            {bulkAction === "expiry" && "Set Expiry"}
            {bulkAction === "delete" && "Delete Entries"}
          </h2>
          <button onClick={() => setBulkAction(null)} className="text-text-muted transition-colors hover:text-text-primary">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <p className="mb-4 text-sm text-text-secondary">
          This will affect {selectedIds.size} selected {selectedIds.size === 1 ? "entry" : "entries"}.
        </p>

        {bulkAction === "group" && (
          <select value={bulkGroupId} onChange={(e) => setBulkGroupId(e.target.value)} className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}

        {bulkAction === "clan" && (
          <select value={bulkClanId} onChange={(e) => setBulkClanId(e.target.value)} className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
            <option value="">No Clan</option>
            {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
          </select>
        )}

        {bulkAction === "expiry" && (
          <input type="datetime-local" value={bulkExpiresAt} onChange={(e) => setBulkExpiresAt(e.target.value)} className="mb-4 w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
        )}

        {bulkAction === "delete" && (
          <p className="mb-4 text-sm text-danger">
            Are you sure you want to permanently delete {selectedIds.size} {selectedIds.size === 1 ? "entry" : "entries"}? This cannot be undone.
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={() => setBulkAction(null)} className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary">
            Cancel
          </button>
          <button
            onClick={executeBulkAction}
            disabled={bulkProcessing}
            className={`rounded-sm px-5 py-2 text-sm font-semibold tracking-wide transition-colors disabled:opacity-50 ${
              bulkAction === "delete"
                ? "bg-danger text-white hover:bg-danger/80"
                : "bg-accent text-bg-primary hover:bg-accent-muted"
            }`}
          >
            {bulkProcessing ? "Processing..." : "Confirm"}
          </button>
        </div>
      </Modal>

      {/* Profile Modal */}
      <Modal
        open={selectedEntry !== null}
        onClose={closeProfile}
        className="flex max-w-2xl flex-col bg-bg-secondary"
      >
        {selectedEntry && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="font-display text-lg font-semibold tracking-wide text-text-primary">
                  {selectedEntry.name || "Unnamed"}
                </h2>
                <div className="text-xs text-text-muted">{selectedEntry.steamId}</div>
              </div>
              <button onClick={closeProfile} className="text-text-muted transition-colors hover:text-text-primary">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4 border-b border-border px-6 py-4">
              <InfoField label="Steam ID">
                <CopyableId value={selectedEntry.steamId} />
              </InfoField>
              <InfoField label="Name">
                {editing ? (
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" placeholder="Name" />
                ) : (
                  selectedEntry.name || <span className="text-text-muted">--</span>
                )}
              </InfoField>
              <InfoField label="Clan">
                {editing ? (
                  <select value={editClanId} onChange={(e) => setEditClanId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                    <option value="">No Clan</option>
                    {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
                  </select>
                ) : (
                  selectedEntry.clanName || selectedEntry.clan || <span className="text-text-muted">--</span>
                )}
              </InfoField>
              <InfoField label="Group">
                {editing ? (
                  <select value={editGroupId} onChange={(e) => setEditGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none">
                    <option value="">None</option>
                    {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                ) : (
                  selectedEntry.groupName ? (
                    <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs text-accent">{selectedEntry.groupName}</span>
                  ) : (
                    <span className="text-text-muted">--</span>
                  )
                )}
              </InfoField>
              <InfoField label="Reason">
                {editing ? (
                  <input type="text" value={editReason} onChange={(e) => setEditReason(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" placeholder="Reason" />
                ) : (
                  selectedEntry.reason || <span className="text-text-muted">--</span>
                )}
              </InfoField>
              <InfoField label="Expires">
                {editing ? (
                  <input type="datetime-local" value={editExpiresAt} onChange={(e) => setEditExpiresAt(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" />
                ) : (
                  (() => {
                    const exp = formatExpiry(selectedEntry.expiresAt);
                    if (!exp) return <span className="text-text-muted">Permanent</span>;
                    return (
                      <span className={`rounded-sm px-2 py-0.5 text-xs font-medium ${exp.expired ? "bg-danger/10 text-danger" : "bg-warning/10 text-warning"}`}>
                        {exp.label}
                      </span>
                    );
                  })()
                )}
              </InfoField>
              <InfoField label="Added By">
                {selectedEntry.addedByName || selectedEntry.addedBy}
              </InfoField>
              <InfoField label="Added">
                {formatDate(selectedEntry.createdAt)}
              </InfoField>
              <InfoField label="Playtime (30/90d)">
                {playtimeLoading ? (
                  <span className="text-text-muted">Loading...</span>
                ) : playtimeStats ? (
                  <span className="text-text-secondary">{playtimeStats.playtime30}h / {playtimeStats.playtime90}h</span>
                ) : (
                  <span className="text-text-muted">--</span>
                )}
              </InfoField>
              <InfoField label="Seed Time (30/90d)">
                {playtimeLoading ? (
                  <span className="text-text-muted">Loading...</span>
                ) : playtimeStats ? (
                  <span className="text-text-secondary">{playtimeStats.seed30}h / {playtimeStats.seed90}h</span>
                ) : (
                  <span className="text-text-muted">--</span>
                )}
              </InfoField>
            </div>

            {/* Comments */}
            <div className="border-b border-border px-6 py-4">
              <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.15em] text-text-muted">
                Comments ({selectedEntry.comments.length})
              </h3>
              {selectedEntry.comments.length > 0 && (
                <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
                  {selectedEntry.comments.map((comment) => (
                    <div key={comment.id} className="rounded-sm bg-bg-tertiary px-3 py-2">
                      <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-accent">{comment.authorName}</span>
                          <span className="text-[10px] text-text-muted">{formatRelativeTime(comment.createdAt)}</span>
                        </div>
                        {canManage && (
                          <button onClick={() => handleDeleteComment(comment.id)} className="text-[10px] text-text-muted transition-colors hover:text-danger">
                            delete
                          </button>
                        )}
                      </div>
                      <div className="text-sm text-text-secondary">{comment.text}</div>
                    </div>
                  ))}
                </div>
              )}
              {canManage && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddComment(); }}
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={commentSaving || !commentText.trim()}
                    className="rounded-sm bg-accent px-4 py-1.5 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
                  >
                    {commentSaving ? "..." : "Add"}
                  </button>
                </div>
              )}
            </div>

            {/* Activity (collapsible) */}
            <div className="border-b border-border px-6 py-4">
              <button
                onClick={toggleActivity}
                className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-[0.15em] text-text-muted transition-colors hover:text-text-secondary"
              >
                <span>Activity</span>
                <svg
                  className={`h-4 w-4 transition-transform ${activityOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {activityOpen && (
                <div className="mt-3">
                  {activityLoading ? (
                    <div className="text-xs text-text-muted">Loading activity...</div>
                  ) : activityLogs.length === 0 ? (
                    <div className="text-xs text-text-muted">No activity recorded.</div>
                  ) : (
                    <div className="max-h-48 space-y-1.5 overflow-y-auto">
                      {activityLogs.map((log) => (
                        <div key={log.id} className="text-xs text-text-secondary">
                          <span className="font-medium text-text-primary">{log.userName}</span>
                          {" "}{getActionVerb(log.action)}
                          <span className="ml-1.5 text-text-muted">{formatRelativeTime(log.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Actions footer */}
            {canManage && (
              <div className="px-6 py-4">
                {editing ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={saveEdit}
                      className="rounded-sm bg-accent px-4 py-1.5 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setEditing(false); setEditError(null); }}
                      className="text-xs text-text-muted transition-colors hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    {editError && <span className="text-xs text-danger">{editError}</span>}
                  </div>
                ) : confirmingDelete ? (
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-danger">Delete this entry?</span>
                    <button
                      onClick={handleDeleteFromModal}
                      className="rounded-sm bg-danger px-4 py-1.5 text-xs font-semibold tracking-wide text-white transition-colors hover:bg-danger/80"
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
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={startEdit}
                      className="rounded-sm border border-border bg-bg-tertiary px-4 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmingDelete(true)}
                      className="rounded-sm border border-danger/30 bg-danger/10 px-4 py-1.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {/* Review admins.cfg Modal */}
      <Modal
        open={showCfgModal}
        onClose={() => setShowCfgModal(false)}
        className="flex max-w-3xl flex-col bg-bg-secondary"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-semibold tracking-wide">admins.cfg ({activeServer})</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyCfg}
              className="rounded-sm border border-border px-4 py-1.5 text-xs font-medium tracking-wide text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
            >
              {cfgCopied ? "Copied!" : "Copy"}
            </button>
            <button onClick={() => setShowCfgModal(false)} className="text-text-muted transition-colors hover:text-text-primary">x</button>
          </div>
        </div>
        <div className="max-h-[70vh] flex-1 overflow-auto p-6">
          <pre className="whitespace-pre font-mono text-xs leading-relaxed text-text-secondary">{cfgContent}</pre>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        className="max-w-3xl bg-bg-secondary p-6"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold tracking-wide">Import Whitelist ({activeServer})</h2>
          <button onClick={() => setShowImportModal(false)} className="text-text-muted transition-colors hover:text-text-primary">x</button>
        </div>

        {importStep === "paste" && (
          <div>
            <p className="mb-3 text-sm text-text-secondary">Paste entries in the format:</p>
            <code className="mb-3 block rounded-sm bg-bg-tertiary px-3 py-2 text-xs text-text-secondary">
              Admin=76561197960957079:SuperAdmin // Ole
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
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-text-secondary">Review parsed entries before importing.</p>
              {importRows.length > 1 && importRows[0] && (importRows[0].clanId || importRows[0].groupId) && (
                <button
                  type="button"
                  onClick={() => setImportRows((prev) => {
                    const first = prev[0];
                    return prev.map((r, i) => i === 0 ? r : { ...r, clanId: first.clanId, groupId: first.groupId });
                  })}
                  className="rounded-sm border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
                >
                  Apply first row to all
                </button>
              )}
            </div>
            <div className="mb-3 flex flex-wrap gap-3 text-xs">
              <span className="rounded-sm bg-accent/10 px-2 py-0.5 text-accent">{importCounts.newCount} new</span>
              {importCounts.existingCount > 0 && (
                <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-warning">{importCounts.existingCount} already whitelisted</span>
              )}
              {importCounts.batchCount > 0 && (
                <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-warning">{importCounts.batchCount} duplicate{importCounts.batchCount === 1 ? "" : "s"} in paste</span>
              )}
              {importCounts.errorCount > 0 && (
                <span className="rounded-sm bg-danger/10 px-2 py-0.5 text-danger">{importCounts.errorCount} error{importCounts.errorCount === 1 ? "" : "s"}</span>
              )}
            </div>
            <div className="mb-4 max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Steam ID</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Name</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Clan</th>
                    <th className="px-3 py-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Group</th>
                    <th className="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row, i) => {
                    const dupeReason = importDupeMap.get(i);
                    const rowBg = row.error ? "bg-danger/10" : dupeReason ? "bg-warning/5" : "";
                    return (
                    <tr key={i} className={`border-b border-border/50 ${rowBg}`}>
                      <td className="px-3 py-2">
                        <input type="text" value={row.steamId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => j === i ? { ...r, steamId: e.target.value, error: false } : r))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-accent focus:border-accent focus:outline-none" />
                        {dupeReason === "existing" && <span className="mt-1 block text-[10px] text-warning">Already whitelisted</span>}
                        {dupeReason === "batch" && <span className="mt-1 block text-[10px] text-warning">Duplicate in paste</span>}
                      </td>
                      <td className="px-3 py-2"><input type="text" value={row.name} onChange={(e) => setImportRows((prev) => prev.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none" /></td>
                      <td className="px-3 py-2"><select value={row.clanId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => j === i ? { ...r, clanId: e.target.value } : r))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"><option value="">No Clan</option>{clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}</select></td>
                      <td className="px-3 py-2"><select value={row.groupId} onChange={(e) => setImportRows((prev) => prev.map((r, j) => j === i ? { ...r, groupId: e.target.value } : r))} className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"><option value="">No group</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></td>
                      <td className="px-3 py-2"><button onClick={() => setImportRows((prev) => prev.filter((_, j) => j !== i))} className="text-xs text-text-muted transition-colors hover:text-danger">x</button></td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">{importCounts.newCount} new {importCounts.newCount === 1 ? "entry" : "entries"} will be imported</span>
              <div className="flex gap-3">
                <button onClick={() => setImportStep("paste")} className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary">Back</button>
                <button onClick={confirmImport} disabled={importing || importCounts.newCount === 0} className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50">
                  {importing ? "Importing..." : "Import"}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
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

// ============================================================
// CLANS TAB
// ============================================================

function ClansTab({
  clans,
  setClans,
  apiToken,
  canManage,
}: {
  clans: Clan[];
  setClans: React.Dispatch<React.SetStateAction<Clan[]>>;
  apiToken: string | null;
  canManage: boolean;
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
    if (!apiToken || !newName.trim() || !newTag.trim()) return;
    setAddError(null);
    setAdding(true);

    const res = await createClan(apiToken, { name: newName.trim(), tag: newTag.trim() });
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
    if (!apiToken) return;
    setEditError(null);

    const res = await updateClan(apiToken, id, { name: editName.trim(), tag: editTag.trim() });
    if (res.success && res.data) {
      setClans((prev) => prev.map((c) => (c.id === id ? res.data! : c)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingId(null);
    } else {
      setEditError(res.error || "Failed to update clan");
    }
  }

  async function handleDelete(id: string) {
    if (!apiToken) return;
    const res = await deleteClan(apiToken, id);
    if (res.success) {
      setClans((prev) => prev.filter((c) => c.id !== id));
      setDeletingId(null);
    }
  }

  return (
    <>
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 rounded-sm bg-bg-card p-4">
          <div className="flex flex-wrap gap-3">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Clan name (e.g. Royal Battalion)" className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none" required />
            <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Tag (e.g. RB)" className="w-24 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none" required />
            <button type="submit" disabled={adding} className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50">
              {adding ? "Creating..." : "Create Clan"}
            </button>
          </div>
          {addError && <div className="mt-2 text-sm text-danger">{addError}</div>}
        </form>
      )}

      {clans.length === 0 ? (
        <div className="facet-border rounded-sm bg-bg-card px-6 py-12 text-center text-text-muted">
          No clans defined yet. Create clans to organize whitelist entries and manage team switching.
        </div>
      ) : (
        <div className="space-y-3">
          {clans.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <div key={c.id} className="facet-border rounded-sm bg-bg-card p-4">
                {isEditing ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
                    <input type="text" value={editTag} onChange={(e) => setEditTag(e.target.value)} className="w-24 rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none" />
                    <button onClick={() => saveEdit(c.id)} className="rounded-sm bg-accent px-4 py-2 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">Cancel</button>
                    {editError && <span className="text-sm text-danger">{editError}</span>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs font-medium tracking-wide text-accent">[{c.tag}]</span>
                      <h3 className="font-display text-base font-semibold tracking-wide text-text-primary">{c.name}</h3>
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => startEdit(c)} className="text-xs text-text-muted transition-colors hover:text-accent">Edit</button>
                        {deletingId === c.id ? (
                          <>
                            <button onClick={() => handleDelete(c.id)} className="text-xs text-danger transition-colors hover:text-danger/80">Confirm</button>
                            <button onClick={() => setDeletingId(null)} className="text-xs text-text-muted transition-colors hover:text-text-primary">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setDeletingId(c.id)} className="text-xs text-text-muted transition-colors hover:text-danger">Delete</button>
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

// ============================================================
// ACTIVITY TAB
// ============================================================

function ActivityTab({
  apiToken,
}: {
  apiToken: string | null;
}) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const fetchLogs = useCallback(async () => {
    if (!apiToken) return;
    setLoading(true);
    const res = await getAuditLogs(apiToken, {
      page,
      limit: PAGE_SIZE,
      resource: "WhitelistEntry",
      action: actionFilter || undefined,
      userId: userSearch || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    });
    if (res.success && res.data) {
      setLogs(res.data.items);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [apiToken, page, actionFilter, userSearch, fromDate, toDate]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useAutoRefresh(fetchLogs, 20_000, !!apiToken);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const ACTION_OPTIONS = [
    { value: "", label: "All actions" },
    { value: "whitelist.add", label: "Add" },
    { value: "whitelist.update", label: "Update" },
    { value: "whitelist.delete", label: "Delete" },
    { value: "whitelist.bulk_add", label: "Bulk Add" },
    { value: "whitelist.bulk_update", label: "Bulk Update" },
    { value: "whitelist.bulk_delete", label: "Bulk Delete" },
    { value: "whitelist.comment.add", label: "Comment Add" },
    { value: "whitelist.comment.delete", label: "Comment Delete" },
  ];

  function getActionBadge(action: string): string {
    if (action.includes("delete")) return "bg-red-500/15 text-red-400";
    if (action.includes("add") || action.includes("comment.add")) return "bg-green-500/15 text-green-400";
    if (action.includes("update")) return "bg-amber-500/15 text-amber-400";
    return "bg-blue-500/15 text-blue-400";
  }

  function getActionLabel(action: string): string {
    const parts = action.split(".");
    return parts[parts.length - 1];
  }

  function getDetailSummary(log: AuditLogEntry): string {
    const detail = (log.detail || {}) as Record<string, unknown>;
    switch (log.action) {
      case "whitelist.add":
        return `Added ${(detail.name as string) || (detail.steamId as string) || "entry"}${detail.server ? ` on ${detail.server}` : ""}`;
      case "whitelist.update": {
        const changes = detail.changes as Record<string, unknown> | undefined;
        if (changes) return `Changed: ${Object.keys(changes).join(", ")}`;
        return "Updated entry";
      }
      case "whitelist.delete":
        return `Removed ${(detail.name as string) || (detail.steamId as string) || "entry"}${detail.server ? ` from ${detail.server}` : ""}`;
      case "whitelist.bulk_add":
        return `Added ${detail.created ?? "?"} entries (${detail.skipped ?? 0} skipped)`;
      case "whitelist.bulk_update":
        return `Updated ${detail.count ?? "?"} entries`;
      case "whitelist.bulk_delete":
        return `Deleted ${detail.count ?? "?"} entries`;
      case "whitelist.comment.add":
        return "Added comment";
      case "whitelist.comment.delete":
        return "Deleted comment";
      default:
        return log.action;
    }
  }

  return (
    <>
      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <select
          value={actionFilter}
          onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <input
          type="text"
          value={userSearch}
          onChange={(e) => { setUserSearch(e.target.value); setPage(1); }}
          placeholder="User ID..."
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          title="From date"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); setPage(1); }}
          className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          title="To date"
        />
        <span className="ml-auto text-xs text-text-muted">{total} total</span>
      </div>

      {/* Table */}
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Time</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">User</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Action</th>
                <th className="px-4 py-3 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted">Loading...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-text-muted">No activity logs found.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    className="cursor-pointer border-b border-border/50 transition-colors hover:bg-bg-tertiary/50"
                  >
                    <td className="px-4 py-3 text-xs text-text-secondary" title={formatDateTime(log.createdAt)}>
                      {formatRelativeTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-text-primary text-xs font-medium">
                      {log.userName}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-sm px-2 py-0.5 text-[10px] font-medium tracking-wide ${getActionBadge(log.action)}`}>
                        {getActionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {getDetailSummary(log)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Expanded detail (below table for clicked row) */}
      {expandedId && (() => {
        const log = logs.find((l) => l.id === expandedId);
        if (!log || !log.detail) return null;
        return (
          <div className="facet-border mt-3 rounded-sm bg-bg-card p-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.15em] text-text-muted">Raw Detail</h3>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap font-mono text-xs text-text-secondary">
              {JSON.stringify(log.detail, null, 2)}
            </pre>
          </div>
        );
      })()}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-xs text-text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
