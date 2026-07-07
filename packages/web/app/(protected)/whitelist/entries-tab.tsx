"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import {
  addWhitelistEntry,
  bulkAddWhitelist,
  bulkDeleteWhitelist,
  bulkUpdateWhitelist,
  getWhitelist,
  getWhitelistEntry,
} from "@/lib/api-client";
import type {
  AdminGroup,
  Clan,
  WhitelistEntry,
  WhitelistEntryWithComments,
} from "shared";
import { toastError } from "@/lib/toast";
import { DataTable } from "@/components/data-table-v2";
import { SearchInput } from "@/components/search-input-v2";
import { FilterBar, type ActiveFilter } from "@/components/filter-bar";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import EntryProfileDialog, {
  ExpiryBadge,
  defaultApi as profileDefaultApi,
  type ProfileDialogApi,
} from "./entry-profile-dialog";
import ImportDialog, { type ImportApi } from "./import-dialog";
import CfgDialog from "./cfg-dialog";
import { formatDate } from "@/lib/format";
import { generateCfgContent } from "./lib";

export type EntriesApi = {
  getWhitelist: typeof getWhitelist;
  addWhitelistEntry: typeof addWhitelistEntry;
  getWhitelistEntry: typeof getWhitelistEntry;
  bulkUpdateWhitelist: typeof bulkUpdateWhitelist;
  bulkDeleteWhitelist: typeof bulkDeleteWhitelist;
} & ProfileDialogApi &
  ImportApi;

export interface EntriesNotify {
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: EntriesApi = {
  ...profileDefaultApi,
  getWhitelist,
  addWhitelistEntry,
  bulkUpdateWhitelist,
  bulkDeleteWhitelist,
  bulkAddWhitelist,
};
const defaultNotify: EntriesNotify = { error: toastError };

type BulkAction = "group" | "clan" | "expiry" | "delete";
interface PendingBulk {
  action: BulkAction;
  ids: string[];
  clear: () => void;
}

const BULK_TITLES: Record<BulkAction, string> = {
  group: "Change Group",
  clan: "Change Clan",
  expiry: "Set Expiry",
  delete: "Delete Entries",
};

export default function EntriesTab({
  entries,
  setEntries,
  groups,
  clans,
  token,
  canManage,
  activeServer,
  api = defaultApi,
  notify = defaultNotify,
}: {
  entries: WhitelistEntry[];
  setEntries: React.Dispatch<React.SetStateAction<WhitelistEntry[]>>;
  groups: AdminGroup[];
  clans: Clan[];
  token: string | null;
  canManage: boolean;
  activeServer: string;
  api?: EntriesApi;
  notify?: EntriesNotify;
}) {
  const [search, setSearch] = useState("");
  const [filterClan, setFilterClan] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [showExpired, setShowExpired] = useState(false);

  // Add form
  const [newSteamId, setNewSteamId] = useState("");
  const [newName, setNewName] = useState("");
  const [newClanId, setNewClanId] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Dialogs
  const [selectedEntry, setSelectedEntry] = useState<WhitelistEntryWithComments | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [cfgContent, setCfgContent] = useState<string | null>(null);

  // Bulk
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);
  const [bulkGroupId, setBulkGroupId] = useState("");
  const [bulkClanId, setBulkClanId] = useState("");
  const [bulkExpiresAt, setBulkExpiresAt] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
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
  }, [entries, search, filterClan, filterGroup, showExpired]);

  async function refetchEntries() {
    if (!token) return;
    const wlRes = await api.getWhitelist(token, activeServer);
    if (wlRes.success && wlRes.data) setEntries(wlRes.data);
  }

  async function openProfile(entry: WhitelistEntry) {
    if (!token) return;
    const res = await api.getWhitelistEntry(token, entry.id);
    if (res.success && res.data) setSelectedEntry(res.data);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newSteamId.trim()) return;
    setAddError(null);
    setAdding(true);

    const selectedClan = clans.find((c) => c.id === newClanId);
    const res = await api.addWhitelistEntry(token, newSteamId.trim(), {
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

  async function executeBulkAction() {
    if (!token || !pendingBulk) return;
    setBulkProcessing(true);
    const { action, ids, clear } = pendingBulk;

    let res: { success: boolean; error?: string };
    if (action === "delete") {
      res = await api.bulkDeleteWhitelist(token, ids);
      if (res.success) {
        const idSet = new Set(ids);
        setEntries((prev) => prev.filter((e) => !idSet.has(e.id)));
      }
    } else if (action === "group") {
      res = await api.bulkUpdateWhitelist(token, ids, { groupId: bulkGroupId || null });
      if (res.success) await refetchEntries();
    } else if (action === "clan") {
      res = await api.bulkUpdateWhitelist(token, ids, { clanId: bulkClanId || null });
      if (res.success) await refetchEntries();
    } else {
      res = await api.bulkUpdateWhitelist(token, ids, {
        expiresAt: bulkExpiresAt ? new Date(bulkExpiresAt).toISOString() : null,
      });
      if (res.success) await refetchEntries();
    }

    if (res.success) {
      clear();
      setPendingBulk(null);
    } else {
      notify.error(res.error, "Bulk action failed");
    }
    setBulkProcessing(false);
  }

  function handleExport() {
    const content = generateCfgContent(entries, groups, activeServer);
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

  const activeFilters: ActiveFilter[] = [];
  if (filterClan) {
    const c = clans.find((x) => x.id === filterClan);
    activeFilters.push({ key: "clan", label: `Clan: ${c ? c.tag : filterClan}` });
  }
  if (filterGroup) {
    const g = groups.find((x) => x.id === filterGroup);
    activeFilters.push({ key: "group", label: `Group: ${g ? g.name : filterGroup}` });
  }
  if (showExpired) activeFilters.push({ key: "expired", label: "Showing Expired" });

  const columns = useMemo<ColumnDef<WhitelistEntry, unknown>[]>(
    () => [
      {
        id: "steamId",
        accessorKey: "steamId",
        header: "Steam ID",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <code className="font-mono text-xs text-accent">{row.original.steamId}</code>
            <Link
              href={
                row.original.userId
                  ? `/users/${row.original.userId}`
                  : `/users/by-steamid/${row.original.steamId}`
              }
              title="Open unified profile"
              className="rounded-sm border border-border/50 px-1.5 py-0.5 text-[10px] text-text-muted transition-colors hover:border-accent/40 hover:text-accent"
            >
              profile →
            </Link>
          </div>
        ),
      },
      {
        id: "name",
        accessorFn: (e) => e.name ?? undefined,
        sortUndefined: "last",
        header: "Name",
        cell: ({ row }) =>
          row.original.name || <span className="text-text-muted">--</span>,
      },
      {
        id: "clan",
        accessorFn: (e) => e.clanName || e.clan || undefined,
        sortUndefined: "last",
        header: "Clan",
        cell: ({ row }) =>
          row.original.clanName || row.original.clan || (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        id: "group",
        accessorFn: (e) => e.groupName || e.role || undefined,
        sortUndefined: "last",
        header: "Group",
        cell: ({ row }) =>
          row.original.groupName ? (
            <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-xs text-accent">
              {row.original.groupName}
            </span>
          ) : row.original.role ? (
            <span className="text-text-secondary">{row.original.role}</span>
          ) : (
            <span className="text-text-muted">--</span>
          ),
      },
      {
        id: "expires",
        accessorFn: (e) => (e.expiresAt ? new Date(e.expiresAt).getTime() : undefined),
        sortUndefined: "last",
        header: "Expires",
        cell: ({ row }) => <ExpiryBadge expiresAt={row.original.expiresAt} />,
      },
      {
        id: "created",
        accessorFn: (e) => new Date(e.createdAt).getTime(),
        header: "Added",
        cell: ({ row }) => (
          <span className="text-xs text-text-secondary">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      {/* Toolbar */}
      <FilterBar
        className="mb-6"
        activeFilters={activeFilters}
        onClear={(key) => {
          if (key === "clan") setFilterClan("");
          if (key === "group") setFilterGroup("");
          if (key === "expired") setShowExpired(false);
        }}
        onClearAll={() => {
          setFilterClan("");
          setFilterGroup("");
          setShowExpired(false);
        }}
      >
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by Steam ID, name, clan, group..."
          className="min-w-64 flex-1"
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
        <Button
          variant={showExpired ? "outlineGold" : "outline"}
          onClick={() => setShowExpired((v) => !v)}
        >
          {showExpired ? "Showing Expired" : "Show Expired"}
        </Button>
        <Button variant="outline" onClick={() => setCfgContent(generateCfgContent(entries, groups, activeServer))}>
          Review admins.cfg
        </Button>
        <Button variant="outline" onClick={handleExport}>
          Export admins.cfg
        </Button>
        {canManage && (
          <Button variant="outline" onClick={() => setShowImport(true)}>
            Import
          </Button>
        )}
      </FilterBar>

      {/* Duplicate warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-sm border border-warning/20 bg-warning/5 px-4 py-2.5 text-sm text-warning">
          {warnings.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
          <button onClick={() => setWarnings([])} className="ml-3 text-text-muted hover:text-text-primary" aria-label="Dismiss warnings">
            x
          </button>
        </div>
      )}

      {importStatus && (
        <div className="mb-4 rounded-sm border border-accent/20 bg-accent/5 px-4 py-2.5 text-sm text-accent">
          {importStatus}
          <button onClick={() => setImportStatus(null)} className="ml-3 text-text-muted hover:text-text-primary" aria-label="Dismiss import status">
            x
          </button>
        </div>
      )}

      {/* Add entry form */}
      {canManage && (
        <form onSubmit={handleAdd} className="facet-border mb-6 flex flex-wrap gap-3 rounded-sm bg-bg-card p-4">
          <Input type="text" value={newSteamId} onChange={(e) => setNewSteamId(e.target.value)} placeholder="Steam64 ID" className="flex-1 font-mono" required />
          <Input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="w-full sm:w-36" />
          <select value={newClanId} onChange={(e) => setNewClanId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-32">
            <option value="">No Clan</option>
            {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
          </select>
          <select value={newGroupId} onChange={(e) => setNewGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none sm:w-36">
            <option value="">No group</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <Input type="datetime-local" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} className="w-full sm:w-48" title="Expiry (optional)" />
          <Button type="submit" variant="gold" disabled={adding}>
            {adding ? "Adding..." : "Add Entry"}
          </Button>
          {addError && <div className="w-full text-sm text-danger">{addError}</div>}
        </form>
      )}

      {/* Entries table */}
      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(e) => e.id}
        pageSize={50}
        initialSorting={[{ id: "clan", desc: false }]}
        onRowClick={openProfile}
        rowClassName={(e) =>
          e.expiresAt && new Date(e.expiresAt) < new Date() ? "opacity-50" : undefined
        }
        enableSelection={canManage}
        emptyState={
          <EmptyState
            className="py-8"
            message={search ? "No entries match your search" : "No whitelist entries yet"}
          />
        }
        bulkActions={(rows, clear) => (
          <>
            <span className="text-sm font-medium text-text-primary">{rows.length} selected</span>
            <Button variant="outline" size="sm" onClick={() => { setBulkGroupId(""); setPendingBulk({ action: "group", ids: rows.map((r) => r.id), clear }); }}>
              Change Group
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkClanId(""); setPendingBulk({ action: "clan", ids: rows.map((r) => r.id), clear }); }}>
              Change Clan
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setBulkExpiresAt(""); setPendingBulk({ action: "expiry", ids: rows.map((r) => r.id), clear }); }}>
              Set Expiry
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setPendingBulk({ action: "delete", ids: rows.map((r) => r.id), clear })}>
              Delete
            </Button>
          </>
        )}
      />

      {/* Bulk action dialog */}
      <Dialog open={pendingBulk !== null} onOpenChange={(o) => { if (!o) setPendingBulk(null); }}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-semibold tracking-wide">
              {pendingBulk ? BULK_TITLES[pendingBulk.action] : ""}
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-text-secondary">
            This will affect {pendingBulk?.ids.length ?? 0} selected {pendingBulk?.ids.length === 1 ? "entry" : "entries"}.
          </p>

          {pendingBulk?.action === "group" && (
            <select value={bulkGroupId} onChange={(e) => setBulkGroupId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
              <option value="">No group</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}

          {pendingBulk?.action === "clan" && (
            <select value={bulkClanId} onChange={(e) => setBulkClanId(e.target.value)} className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary focus:border-accent focus:outline-none">
              <option value="">No Clan</option>
              {clans.map((c) => <option key={c.id} value={c.id}>[{c.tag}] {c.name}</option>)}
            </select>
          )}

          {pendingBulk?.action === "expiry" && (
            <Input type="datetime-local" value={bulkExpiresAt} onChange={(e) => setBulkExpiresAt(e.target.value)} />
          )}

          {pendingBulk?.action === "delete" && (
            <p className="text-sm text-danger">
              Are you sure you want to permanently delete {pendingBulk.ids.length} {pendingBulk.ids.length === 1 ? "entry" : "entries"}? This cannot be undone.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingBulk(null)}>Cancel</Button>
            <Button
              variant={pendingBulk?.action === "delete" ? "destructive" : "gold"}
              onClick={executeBulkAction}
              disabled={bulkProcessing}
            >
              {bulkProcessing ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EntryProfileDialog
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
        groups={groups}
        clans={clans}
        token={token}
        canManage={canManage}
        onUpdated={(updated) =>
          setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
        }
        onDeleted={(id) => setEntries((prev) => prev.filter((e) => e.id !== id))}
        api={api}
        notify={notify}
      />

      <ImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        entries={entries}
        groups={groups}
        clans={clans}
        token={token}
        activeServer={activeServer}
        onImported={(msg) => {
          setImportStatus(msg);
          refetchEntries();
        }}
        api={api}
      />

      <CfgDialog
        open={cfgContent !== null}
        onClose={() => setCfgContent(null)}
        content={cfgContent ?? ""}
        activeServer={activeServer}
      />
    </>
  );
}
