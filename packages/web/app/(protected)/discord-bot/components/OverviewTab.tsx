"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getDiscordBotOverview } from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { DiscordBotOverview, SeedingSession, BotStatus } from "shared";

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card p-4">
      <div className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
        {label}
      </div>
      <div
        className={`mt-1 font-display text-2xl font-bold ${color || "text-text-primary"}`}
      >
        {value}
      </div>
    </div>
  );
}

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
  const heartbeatAge = status.lastHeartbeat ? Date.now() - new Date(status.lastHeartbeat).getTime() : Infinity;
  const isStale = heartbeatAge > 3 * 60 * 1000;
  const effectiveStatus = isStale ? "offline" : status.status;

  const statusColors: Record<string, string> = {
    online: "bg-success/15 text-success border-success/30",
    offline: "bg-danger/15 text-danger border-danger/30",
    starting: "bg-accent/15 text-accent border-accent/30",
  };

  return (
    <div className="facet-border rounded-sm bg-bg-card p-4">
      <div className="flex flex-wrap items-center gap-4">
        <span
          className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-semibold uppercase ${statusColors[effectiveStatus] || statusColors.offline}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${effectiveStatus === "online" ? "bg-success" : effectiveStatus === "starting" ? "bg-accent" : "bg-danger"}`}
          />
          {effectiveStatus}
          {isStale && effectiveStatus === "offline" && " (stale)"}
        </span>

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

function SessionBadge({ status }: { status: SeedingSession["status"] }) {
  const colors: Record<string, string> = {
    active: "bg-success/15 text-success border-success/30",
    completed: "bg-accent/15 text-accent border-accent/30",
    reset: "bg-text-muted/15 text-text-secondary border-text-muted/30",
    expired: "bg-danger/15 text-danger border-danger/30",
  };
  return (
    <span
      className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.reset}`}
    >
      {status}
    </span>
  );
}

export default function OverviewTab({ apiToken }: { apiToken: string }) {
  const [data, setData] = useState<DiscordBotOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDiscordBotOverview(apiToken).then((res) => {
      if (res.success && res.data) setData(res.data);
      else setError(res.error || "Failed to load overview");
      setLoading(false);
    });
  }, [apiToken]);

  const refreshOverview = useCallback(async () => {
    try {
      const res = await getDiscordBotOverview(apiToken);
      if (res.success && res.data) setData(res.data);
    } catch {
      /* silent */
    }
  }, [apiToken]);

  useAutoRefresh(refreshOverview, 20_000, !!apiToken);

  if (loading)
    return <div className="text-text-muted">Loading overview...</div>;
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
            color="text-accent"
          />
          <StatCard
            label="Admin Officer"
            value={data.tickets.openByTier.admin_officer}
            color="text-danger"
          />
        </div>
        {data.tickets.recentlyClosed.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
              Recently Closed
            </h3>
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
                      <td className="px-4 py-2 capitalize text-text-secondary">{t.tier.replace(/_/g, " ")}</td>
                      <td className="max-w-xs truncate px-4 py-2 text-text-secondary">{t.firstMessage || "-"}</td>
                      <td className="px-4 py-2 text-text-muted">{t.closedAt ? new Date(t.closedAt).toLocaleDateString() : "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Prospects */}
      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Prospect Pipeline
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Open"
            value={data.prospects.open}
            color="text-accent"
          />
          <StatCard
            label="Accepted"
            value={data.prospects.accepted}
            color="text-success"
          />
          <StatCard
            label="Denied"
            value={data.prospects.denied}
            color="text-danger"
          />
        </div>
        {data.prospects.recentActivity.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
              Recent Applications
            </h3>
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
                  {data.prospects.recentActivity.map((p) => {
                    const statusColors: Record<string, string> = {
                      open: "text-accent",
                      accepted: "text-success",
                      denied: "text-danger",
                      closed: "text-text-muted",
                    };
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border/30 last:border-0"
                      >
                        <td className="px-4 py-2 text-text-primary">
                          {p.alias}
                        </td>
                        <td
                          className={`px-4 py-2 capitalize ${statusColors[p.status] || "text-text-secondary"}`}
                        >
                          {p.status}
                        </td>
                        <td className="px-4 py-2 text-text-muted">
                          {new Date(p.createdAt).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
                <span
                  className={`inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 text-xs font-medium ${
                    data.seeding.config.enabled
                      ? "border-success/30 bg-success/15 text-success"
                      : "border-text-muted/30 bg-text-muted/15 text-text-secondary"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${data.seeding.config.enabled ? "bg-success" : "bg-text-muted"}`}
                  />
                  {data.seeding.config.enabled ? "Enabled" : "Disabled"}
                </span>
                <span className="text-xs text-text-muted">
                  Threshold: {data.seeding.config.seedThreshold} players
                </span>
              </>
            )}
            {data.seeding.activeSession && <SessionBadge status="active" />}
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
