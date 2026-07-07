"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getAdminGroups,
  getClans,
  getServerConfigs,
  getWhitelist,
  getWhitelistCandidates,
  toggleServerSync,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { usePermissions } from "@/lib/permission-context";
import { toastError } from "@/lib/toast";
import { Skeleton, SkeletonCard, SkeletonTableRows } from "@/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AdminGroup,
  Clan,
  ServerConfig,
  WhitelistCandidate,
  WhitelistEntry,
} from "shared";
import { DEFAULT_SERVERS, getStoredDefaultServer } from "./lib";
import EntriesTab from "./entries-tab";
import RequestsTab from "./requests-tab";
import GroupsTab from "./groups-tab";
import ClansTab from "./clans-tab";
import ActivityTab from "./activity-tab";

type Tab = "entries" | "requests" | "groups" | "clans" | "activity";

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
        const configRes = await getServerConfigs(apiToken);
        if (configRes.success && configRes.data && configRes.data.length > 0) {
          setServerConfigs(configRes.data);
          const srvList = configRes.data.map((c) => ({ server: c.server, label: c.label }));
          setServers(srvList);
          const stored = getStoredDefaultServer();
          const initial = srvList.find((s) => s.server === stored)?.server || srvList[0].server;
          setActiveServer(initial);
        } else {
          const stored = getStoredDefaultServer();
          const initial = DEFAULT_SERVERS.find((s) => s.server === stored)?.server || "main";
          setActiveServer(initial);
        }

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
    } catch {
      /* silent */
    }
  }, [apiToken, activeServer, canManage]);

  useAutoRefresh(refreshWhitelist, 20_000, !!apiToken && !!activeServer);

  async function handleToggleSync() {
    if (!apiToken || !activeServer) return;
    setTogglingSync(true);
    const current = serverConfigs.find((c) => c.server === activeServer);
    const res = await toggleServerSync(apiToken, activeServer, !current?.syncEnabled);
    if (res.success && res.data) {
      setServerConfigs((prev) =>
        prev.map((c) => (c.server === activeServer ? res.data! : c)),
      );
    } else {
      toastError(res.error, "Failed to toggle SFTP sync");
    }
    setTogglingSync(false);
  }

  if (loading)
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-7 w-24" />
        </div>
        <div className="mb-6 flex items-center gap-3">
          <Skeleton className="h-11 w-52" />
        </div>
        <div className="mb-6 flex gap-2 border-b border-border pb-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-20" />
          ))}
        </div>
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-28" />
          <Skeleton className="ml-auto h-10 w-24" />
        </div>
        <SkeletonCard pad="p-0">
          <table className="w-full text-sm">
            <tbody>
              <SkeletonTableRows
                rows={8}
                columns={[
                  { key: "steamId" },
                  { key: "name" },
                  { key: "clan" },
                  { key: "group" },
                  { key: "expires" },
                  { key: "created" },
                ]}
              />
            </tbody>
          </table>
        </SkeletonCard>
      </div>
    );
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

      {/* Server switcher + SFTP sync */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex gap-1 rounded-sm border border-border bg-bg-tertiary p-1">
          {servers.map((s) => (
            <button
              key={s.server}
              onClick={() => setActiveServer(s.server)}
              className={`rounded-sm px-4 py-2 text-sm font-medium tracking-wide transition-all ${
                activeServer === s.server
                  ? "border border-accent/20 bg-accent/10 text-accent"
                  : "border border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

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
            <span
              className={`inline-block h-2 w-2 rounded-full ${currentConfig.syncEnabled ? "bg-success" : "bg-text-muted"}`}
              aria-hidden="true"
            />
            SFTP Sync {currentConfig.syncEnabled ? "On" : "Off"}
          </button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList variant="line" className="mb-6 w-full justify-start border-b border-border">
          {visibleTabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              <span className="capitalize">{t}</span>
              {t === "requests" && pendingCandidates.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] font-bold text-destructive-foreground">
                  {pendingCandidates.length}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="entries">
          <EntriesTab
            entries={entries}
            setEntries={setEntries}
            groups={groups}
            clans={clans}
            token={apiToken}
            canManage={canManage}
            activeServer={activeServer}
          />
        </TabsContent>
        <TabsContent value="requests">
          <RequestsTab
            candidates={pendingCandidates}
            groups={groups}
            onApproved={(created) => setEntries((prev) => [created, ...prev])}
            dismissed={dismissed}
            setDismissed={setDismissed}
            token={apiToken}
            canManage={canManage}
            activeServer={activeServer}
          />
        </TabsContent>
        <TabsContent value="groups">
          <GroupsTab groups={groups} setGroups={setGroups} token={apiToken} canManage={canManage} />
        </TabsContent>
        <TabsContent value="clans">
          <ClansTab clans={clans} setClans={setClans} token={apiToken} canManage={canManage} />
        </TabsContent>
        {canViewAudit && (
          <TabsContent value="activity">
            <ActivityTab token={apiToken} groups={groups} clans={clans} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
