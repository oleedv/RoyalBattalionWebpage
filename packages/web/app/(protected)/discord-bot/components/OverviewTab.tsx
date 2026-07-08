"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getDiscordBotOverview } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import {
  Skeleton,
  SkeletonCard,
  SkeletonRegion,
  SkeletonStatCard,
} from "@/components/skeleton";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import type { DiscordBotOverview, SeedingSession, BotStatus } from "shared";

export type OverviewApi = {
  getDiscordBotOverview: typeof getDiscordBotOverview;
};

const defaultApi: OverviewApi = { getDiscordBotOverview };

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function ConnectionDot({
  connected,
  label,
}: {
  connected: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full ${connected ? "bg-success" : "bg-danger"}`}
      />
      <span className="text-xs text-text-secondary">{label}</span>
    </div>
  );
}

function BotStatusBanner({ status }: { status: BotStatus }) {
  const heartbeatAge = status.lastHeartbeat
    ? Date.now() - new Date(status.lastHeartbeat).getTime()
    : Infinity;
  const isStale = heartbeatAge > 3 * 60 * 1000;
  const effectiveStatus = isStale ? "offline" : status.status;

  function statusBadge() {
    if (effectiveStatus === "online") {
      return <StatusBadge variant="server-online">Online</StatusBadge>;
    }
    if (effectiveStatus === "starting") {
      return <StatusBadge tone="accent">Starting</StatusBadge>;
    }
    return (
      <StatusBadge variant="server-offline">
        {isStale ? "Offline (stale)" : "Offline"}
      </StatusBadge>
    );
  }

  return (
    <div className="facet-border rounded-sm bg-bg-card p-4">
      <div className="flex flex-wrap items-center gap-4">
        {statusBadge()}

        <div className="flex items-center gap-4 text-xs text-text-secondary">
          <span>Uptime: {formatUptime(status.uptimeSeconds)}</span>
          <span>Latency: {status.latencyMs}ms</span>
          <span>Guilds: {status.guildCount}</span>
          <span>Members: {status.memberCount}</span>
        </div>

        <div className="ml-auto flex items-center gap-4">
          <ConnectionDot connected={status.dbConnected} label="DB" />
          <ConnectionDot connected={status.squadjsConnected} label="SquadJS" />
        </div>
      </div>
    </div>
  );
}

const SESSION_TONE: Record<
  SeedingSession["status"],
  "success" | "accent" | "neutral" | "danger"
> = {
  active: "success",
  completed: "accent",
  reset: "neutral",
  expired: "danger",
};

export default function OverviewTab({
  apiToken,
  api = defaultApi,
}: {
  apiToken: string;
  api?: OverviewApi;
}) {
  const [data, setData] = useState<DiscordBotOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDiscordBotOverview(apiToken).then((res) => {
      if (res.success && res.data) setData(res.data);
      else setError(res.error || "Failed to load overview");
      setLoading(false);
    });
  }, [apiToken, api]);

  const refreshOverview = useCallback(async () => {
    try {
      const res = await api.getDiscordBotOverview(apiToken);
      if (res.success && res.data) setData(res.data);
    } catch {
      /* silent */
    }
  }, [apiToken, api]);

  useAutoRefresh(refreshOverview, 20_000, !!apiToken);

  if (loading && !data)
    return (
      <SkeletonRegion className="space-y-8" label="Loading overview...">
        {/* Bot status banner */}
        <SkeletonCard pad="p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-7 w-24 rounded-sm" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
            <div className="ml-auto flex items-center gap-4">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </SkeletonCard>

        {/* Tickets + Prospects stat sections */}
        {[0, 1].map((s) => (
          <div key={s}>
            <Skeleton className="mb-3 h-3 w-40" />
            <div className="grid gap-3 sm:grid-cols-3">
              <SkeletonStatCard />
              <SkeletonStatCard />
              <SkeletonStatCard />
            </div>
          </div>
        ))}

        {/* Seeding */}
        <div>
          <Skeleton className="mb-3 h-3 w-24" />
          <SkeletonCard pad="p-4" className="flex items-center justify-between">
            <Skeleton className="h-6 w-48 rounded-sm" />
            <Skeleton className="h-3 w-28" />
          </SkeletonCard>
        </div>
      </SkeletonRegion>
    );

  if (error) return <div className="text-danger">{error}</div>;
  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* Bot Status */}
      {data.botStatus && <BotStatusBanner status={data.botStatus} />}

      {/* Tickets */}
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Open Tickets by Tier
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Normal" value={data.tickets.openByTier.normal} />
          <StatCard
            label="Community Officer"
            value={data.tickets.openByTier.community_officer}
            accent
          />
          <StatCard
            label="Admin Officer"
            value={data.tickets.openByTier.admin_officer}
          />
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
            Recently Closed
          </h3>
          {data.tickets.recentlyClosed.length === 0 ? (
            <EmptyState variant="hint" message="No recently closed tickets" />
          ) : (
            <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="px-4 py-2 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                      ID
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                      Tier
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                      Preview
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                      Closed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.tickets.recentlyClosed.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-border/30 last:border-0"
                    >
                      <td className="px-4 py-2 text-text-primary">#{t.id}</td>
                      <td className="px-4 py-2 capitalize text-text-secondary">
                        {t.tier.replace(/_/g, " ")}
                      </td>
                      <td className="max-w-xs truncate px-4 py-2 text-text-secondary">
                        {t.firstMessage || "-"}
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {t.closedAt
                          ? new Date(t.closedAt).toLocaleDateString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Prospects */}
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Prospect Pipeline
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Open" value={data.prospects.open} accent />
          <StatCard label="Accepted" value={data.prospects.accepted} />
          <StatCard label="Denied" value={data.prospects.denied} />
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
            Recent Applications
          </h3>
          {data.prospects.recentActivity.length === 0 ? (
            <EmptyState variant="hint" message="No recent applications" />
          ) : (
            <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="px-4 py-2 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                      Alias
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                      Applied
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.prospects.recentActivity.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-border/30 last:border-0"
                    >
                      <td className="px-4 py-2 text-text-primary">
                        {p.alias}
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge
                          tone={
                            p.status === "accepted"
                              ? "success"
                              : p.status === "denied"
                                ? "danger"
                                : p.status === "open"
                                  ? "accent"
                                  : "neutral"
                          }
                        >
                          {p.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2 text-text-muted">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Seeding */}
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Seeding
        </h2>
        <div className="facet-border flex items-center justify-between rounded-sm bg-bg-card p-4">
          <div className="flex items-center gap-3">
            {data.seeding.config && (
              <>
                <StatusBadge
                  tone={data.seeding.config.enabled ? "success" : "neutral"}
                >
                  {data.seeding.config.enabled ? "Enabled" : "Disabled"}
                </StatusBadge>
                <span className="text-xs text-text-muted">
                  Threshold: {data.seeding.config.seedThreshold} players
                </span>
              </>
            )}
            {data.seeding.activeSession && (
              <StatusBadge
                tone={SESSION_TONE[data.seeding.activeSession.status]}
              >
                {data.seeding.activeSession.status}
              </StatusBadge>
            )}
          </div>
          <Link
            href="/seeding"
            className="text-xs font-medium text-accent transition-colors hover:text-accent/80"
          >
            Manage seeding &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}
