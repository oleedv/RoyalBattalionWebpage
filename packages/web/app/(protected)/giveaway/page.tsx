"use client";

import { useCallback, useEffect, useState } from "react";
import type { GiveawayConfig, GiveawayHistoryItem, GiveawaySnapshot, GiveawayStatus } from "shared";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useDiscordNameMap } from "@/hooks/use-discord-names";
import { formatDateTime, formatNumber } from "@/lib/format";
import {
  adjustGiveawayTickets,
  getActiveGiveaway,
  getGiveawayById,
  getGiveawayConfig,
  getGiveawayHistory,
} from "@/lib/api-client";
import { GiveawayCharts } from "./components/GiveawayCharts";
import { GiveawayBoard } from "./components/GiveawayBoard";
import { GiveawayManage } from "./components/GiveawayManage";

const STATUS_CLASS: Record<GiveawayStatus, string> = {
  open: "bg-accent/15 text-accent border-accent/30",
  voting: "bg-success/15 text-success border-success/30",
  drawn: "bg-success/15 text-success border-success/30",
  cancelled: "bg-danger/15 text-danger border-danger/30",
};

function daysUntil(iso: string): string {
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return "";
  const days = Math.ceil(ms / 86400000);
  if (days > 1) return `Draw in ${days} days`;
  if (days === 1) return "Draw tomorrow";
  if (days === 0) return "Draw today";
  return "Draw date passed";
}

export default function GiveawayPage() {
  const { apiToken, hasPermission } = usePermissions();
  const canView =
    hasPermission("view:giveaway") ||
    hasPermission("manage:giveaway") ||
    hasPermission("manage:giveaway-tickets");
  const canManage = hasPermission("manage:giveaway");
  const canAdjustTickets = hasPermission("manage:giveaway-tickets");
  const { resolveNames, displayName } = useDiscordNameMap(apiToken);

  const [snapshot, setSnapshot] = useState<GiveawaySnapshot | null>(null);
  const [config, setConfig] = useState<GiveawayConfig | null>(null);
  const [history, setHistory] = useState<GiveawayHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewingId, setViewingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!apiToken) return;
    const [activeRes, configRes, historyRes] = await Promise.all([
      viewingId ? getGiveawayById(apiToken, viewingId) : getActiveGiveaway(apiToken),
      getGiveawayConfig(apiToken),
      getGiveawayHistory(apiToken),
    ]);
    if (activeRes.success) setSnapshot(activeRes.data ?? null);
    else setError(activeRes.error || "Failed to load giveaway");
    if (configRes.success && configRes.data) setConfig(configRes.data);
    if (historyRes.success && historyRes.data) setHistory(historyRes.data);
    setLoading(false);
  }, [apiToken, viewingId]);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(load, 20_000, Boolean(apiToken) && viewingId == null);

  useEffect(() => {
    if (!snapshot) return;
    const ids = [
      ...snapshot.leaderboard.map((r) => r.userId),
      snapshot.giveaway.winnerUserId,
      snapshot.giveaway.createdBy,
      ...history.map((h) => h.winnerUserId),
    ].filter((x): x is string => Boolean(x));
    resolveNames(ids);
  }, [snapshot, history, resolveNames]);

  if (!apiToken) return <div className="text-text-secondary">Loading...</div>;
  if (!canView) return <div className="text-danger">Insufficient permissions.</div>;

  const g = snapshot?.giveaway;
  const viewingPast = viewingId != null && g?.status !== "open" && g?.status !== "voting";

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide">Giveaway</h1>
          {g && (
            <p className="mt-1 text-sm text-text-secondary">
              {g.prize} · {g.monthLabel}
            </p>
          )}
        </div>
        {g && (
          <div className="flex items-center gap-3">
            <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium uppercase tracking-wider ${STATUS_CLASS[g.status]}`}>
              {g.status}
            </span>
            {(g.status === "open" || g.status === "voting") && (
              <span className="text-xs text-text-muted">{daysUntil(g.drawAt)}</span>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {loading && !snapshot && <p className="text-sm text-text-muted">Loading giveaway...</p>}

      {!loading && !snapshot && (
        <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-sm text-text-secondary">
          No giveaway running.
          {canManage ? " Use the form below to start one." : ""}
        </div>
      )}

      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Entries" value={formatNumber(snapshot.leaderboard.length)} />
            <Stat label="Total tickets" value={formatNumber(snapshot.totalTickets)} />
            <Stat label="Votes cast" value={formatNumber(snapshot.votesCast)} />
            <Stat
              label={g?.winnerUserId ? "Winner" : "Draw"}
              value={g?.winnerUserId ? displayName(g.winnerUserId) : formatDateTime(g!.drawAt)}
            />
          </div>

          {viewingPast && (
            <button
              type="button"
              onClick={() => setViewingId(null)}
              className="text-sm text-accent hover:text-accent-bright"
            >
              Back to current giveaway
            </button>
          )}

          <GiveawayCharts snapshot={snapshot} history={history} displayName={displayName} />
          <GiveawayBoard
            snapshot={snapshot}
            displayName={displayName}
            onAdjustTickets={
              canAdjustTickets && !viewingPast
                ? async (userId, delta) => {
                    const res = await adjustGiveawayTickets(apiToken, { userId, delta });
                    if (res.success) await load();
                    return res;
                  }
                : undefined
            }
          />
        </>
      )}

      {!snapshot && history.length > 0 && (
        <GiveawayCharts snapshot={null} history={history} displayName={displayName} />
      )}

      {(canManage || (canAdjustTickets && snapshot && !viewingPast)) && (
        <GiveawayManage
          apiToken={apiToken}
          config={config}
          snapshot={viewingPast ? null : snapshot}
          onChanged={load}
          canManage={canManage}
          canAdjustTickets={canAdjustTickets}
        />
      )}

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
            History
          </h2>
          <div className="facet-border overflow-x-auto rounded-sm bg-bg-card">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Month</th>
                  <th className="px-3 py-2 font-medium">Prize</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Entries</th>
                  <th className="px-3 py-2 font-medium">Winner</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => setViewingId(h.id)}
                        className="text-accent hover:text-accent-bright"
                      >
                        {h.monthLabel}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-text-primary">{h.prize}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-sm border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_CLASS[h.status]}`}>
                        {h.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{h.entryCount}</td>
                    <td className="px-3 py-2">{h.winnerUserId ? displayName(h.winnerUserId) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="facet-border rounded-sm bg-bg-card p-4">
      <div className="mb-1 text-[10px] font-medium tracking-[0.15em] text-text-muted uppercase">
        {label}
      </div>
      <div className="font-display text-xl font-bold tracking-wide text-text-primary">{value}</div>
    </div>
  );
}
