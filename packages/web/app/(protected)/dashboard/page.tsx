"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { linkSteam, getDashboardStats, getBirthdayConfig, updateBirthdayConfig, updateBirthdayPrefs } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { formatDate } from "@/lib/format";
import type { UserWithRoles, BirthdayConfig } from "shared";
import type { DashboardStats, ServerStatus } from "@/lib/api-client";
import PlayerStatsSection from "./player-stats-section";
import { SkeletonStatGrid } from "@/components/skeleton";

const CONNECT_URLS: Record<string, string> = {
  "37.153.157.204:27050": "steam://connect/37.153.157.204:27050",
  "37.153.157.204:27060": "steam://connect/37.153.157.204:27060",
};

/* ── Sparkline (multi-line) ─────────────────────────────────────────── */

interface SparklineLine {
  data: number[];
  color: string;
  label: string;
}

function Sparkline({ lines, height = 64, fixedMax }: { lines: SparklineLine[]; height?: number; fixedMax?: number }) {
  const width = 200;
  const hasData = lines.some((l) => l.data.length >= 2);
  if (!hasData) return null;

  const allValues = lines.flatMap((l) => l.data);
  const max = fixedMax ?? Math.max(...allValues, 1);
  const min = 0;
  const range = max - min || 1;

  function toCoords(data: number[]) {
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 6) - 3;
      return { x, y };
    });
  }

  return (
    <div>
      <svg
        width={width}
        height={height}
        className="w-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} ${height}`}
      >
        {lines.map((line) => {
          if (line.data.length < 2) return null;
          const coords = toCoords(line.data);
          const linePoints = coords.map((c) => `${c.x},${c.y}`).join(" ");
          const areaPoints = `${linePoints} ${width},${height} 0,${height}`;
          return (
            <g key={line.label}>
              <polygon fill={line.color} fillOpacity="0.2" points={areaPoints} />
              <polyline fill="none" stroke={line.color} strokeWidth="2" points={linePoints} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex items-center gap-4">
        {lines.map((line) => {
          const current = line.data.length > 0 ? line.data[line.data.length - 1] : 0;
          return (
            <div key={line.label} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} />
              <span className="text-[10px] text-text-muted">
                {line.label}: <span className="text-text-secondary">{current}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Server Card ────────────────────────────────────────────────────── */

function ServerStatusCard({ server }: { server: ServerStatus }) {
  const isOnline = server.status === "online";
  const connectUrl = CONNECT_URLS[`${server.ip}:${server.port}`] ?? "#";

  const players = server.players;
  const maxPlayers = server.maxPlayers;
  const queue = server.publicQueue + server.reserveQueue;

  const playerData = server.metricHistory?.map((s) => s.playerCount) || [];
  const queueData = server.metricHistory?.map((s) => s.publicQueue + s.reserveQueue) || [];

  return (
    <div className="facet-border group rounded-sm bg-bg-card transition-colors hover:bg-bg-card-hover">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            {server.name}
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`h-2 w-2 rounded-full ${
                isOnline ? "bg-success animate-pulse" : "bg-text-muted"
              }`}
            />
            <span
              className={`text-xs font-medium ${
                isOnline ? "text-success" : "text-text-muted"
              }`}
            >
              {isOnline ? "Online" : "Offline"}
            </span>
          </div>
        </div>

        <div className="mb-3 flex items-baseline gap-2">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-3xl font-bold tracking-wide text-text-primary">
              {players}
            </span>
            <span className="text-sm text-text-muted">/ {maxPlayers}</span>
          </div>
          {queue > 0 && (
            <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
              +{queue} queue
            </span>
          )}
        </div>

        <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-bg-tertiary">
          <div
            className="h-full rounded-full bg-accent transition-all duration-500"
            style={{ width: `${(players / maxPlayers) * 100}%` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">{server.map}</span>
          <a
            href={connectUrl}
            className="text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100"
          >
            Connect
          </a>
        </div>
      </div>

      {(playerData.length >= 2 || queueData.length >= 2) && (
        <div className="border-t border-border/30 px-4 pt-3 pb-3">
          <Sparkline
            lines={[
              { data: playerData, color: "#c8a84e", label: "Players" },
              { data: queueData, color: "#f59e0b", label: "Queue" },
            ]}
            fixedMax={maxPlayers || 100}
          />
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ──────────────────────────────────────────────────────── */

function StatCard({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <div
      className={`facet-border rounded-sm bg-bg-card p-5 transition-colors ${
        href ? "cursor-pointer hover:bg-bg-card-hover" : ""
      }`}
    >
      <div className="mb-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
        {label}
      </div>
      <div
        className={`font-display text-2xl font-bold tracking-wide ${
          accent ? "text-accent" : "text-text-primary"
        }`}
      >
        {value}
      </div>
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

/* ── Match result badge ─────────────────────────────────────────────── */

function resultBadgeBg(result: string): string {
  switch (result.toLowerCase()) {
    case "win":
      return "bg-success/10 border-success/30 text-success";
    case "loss":
      return "bg-danger/10 border-danger/30 text-danger";
    case "draw":
      return "bg-text-muted/10 border-text-muted/30 text-text-muted";
    default:
      return "bg-bg-tertiary border-border text-text-secondary";
  }
}

/* ── Read-only field tooltip ────────────────────────────────────────── */

/**
 * Wraps an immutable profile field. On hover it surfaces a hint that the value
 * can't be self-edited and a ticket is the way to correct it.
 */
function FieldTip({ children }: { children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex cursor-help items-center">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-bg-primary px-2 py-1 text-[10px] text-text-secondary opacity-0 shadow-lg ring-1 ring-border transition-opacity group-hover:opacity-100">
        If this is incorrect, create a community ticket.
      </span>
    </span>
  );
}

/* ── Dashboard Page ─────────────────────────────────────────────────── */

/* ── Birthday admin card ────────────────────────────────────────────── */

const DEFAULT_LOUNGE_CHANNEL_ID = "460898033794809856";

function BirthdayAdminCard({ token }: { token: string }) {
  const [config, setConfig] = useState<BirthdayConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBirthdayConfig(token).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        // Pre-fill the royal-lounge default when no channel is set yet.
        setConfig({ ...res.data, channelId: res.data.channelId ?? DEFAULT_LOUNGE_CHANNEL_ID });
      } else {
        setError(res.error || "Failed to load birthday config");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateBirthdayConfig(token, config);
    setSaving(false);
    if (res.success && res.data) {
      setConfig({ ...res.data, channelId: res.data.channelId ?? DEFAULT_LOUNGE_CHANNEL_ID });
      setSaved(true);
    } else {
      setError(res.error || "Failed to save");
    }
  }

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-semibold tracking-wide text-text-primary">
          Birthday announcements
        </h2>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={config?.enabled ?? false}
            disabled={!config}
            onChange={(e) => config && setConfig({ ...config, enabled: e.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          Enabled
        </label>
      </div>

      {!config ? (
        <p className="text-sm text-text-muted">{error || "Loading..."}</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
                Channel ID
              </span>
              <input
                type="text"
                value={config.channelId ?? ""}
                onChange={(e) => setConfig({ ...config, channelId: e.target.value.trim() || null })}
                placeholder={DEFAULT_LOUNGE_CHANNEL_ID}
                className="w-full rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
                Post time
              </span>
              <input
                type="time"
                value={config.postTime}
                onChange={(e) => setConfig({ ...config, postTime: e.target.value })}
                className="w-full rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
                Timezone
              </span>
              <input
                type="text"
                value={config.timezone}
                onChange={(e) => setConfig({ ...config, timezone: e.target.value.trim() })}
                placeholder="Europe/Oslo"
                className="w-full rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-sm bg-accent px-4 py-1.5 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {saved && <span className="text-xs text-success">Saved.</span>}
            {error && <span className="text-xs text-danger">{error}</span>}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Birthday self-service toggles ──────────────────────────────────── */

function BirthdayPrefsToggles({
  token,
  initialOptOut,
  initialShowAge,
}: {
  token: string;
  initialOptOut: boolean;
  initialShowAge: boolean;
}) {
  const [optOut, setOptOut] = useState(initialOptOut);
  const [showAge, setShowAge] = useState(initialShowAge);
  const [error, setError] = useState<string | null>(null);

  // Keep in sync if the context user re-syncs (token refresh every ~2 min).
  useEffect(() => {
    setOptOut(initialOptOut);
    setShowAge(initialShowAge);
  }, [initialOptOut, initialShowAge]);

  async function update(next: { birthdayOptOut?: boolean; birthdayShowAge?: boolean }) {
    setError(null);
    const res = await updateBirthdayPrefs(token, next);
    if (res.success && res.data) {
      setOptOut(res.data.birthdayOptOut);
      setShowAge(res.data.birthdayShowAge);
    } else {
      setError(res.error || "Failed to save");
      // Revert the optimistic flip.
      if (next.birthdayOptOut !== undefined) setOptOut(!next.birthdayOptOut);
      if (next.birthdayShowAge !== undefined) setShowAge(!next.birthdayShowAge);
    }
  }

  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <div className="mb-1.5 text-[10px] font-medium tracking-wider text-text-muted uppercase">
        Birthday
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={optOut}
            onChange={(e) => {
              setOptOut(e.target.checked);
              update({ birthdayOptOut: e.target.checked });
            }}
            className="h-4 w-4 accent-accent"
          />
          Don&apos;t announce my birthday
        </label>
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={showAge}
            onChange={(e) => {
              setShowAge(e.target.checked);
              update({ birthdayShowAge: e.target.checked });
            }}
            className="h-4 w-4 accent-accent"
          />
          Show my age in the announcement
        </label>
      </div>
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const { apiToken, user: contextUser, hasPermission } = usePermissions();
  const [linkedUser, setLinkedUser] = useState<UserWithRoles | null>(null);
  const [steamId, setSteamId] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const displayUser = linkedUser || contextUser;

  useEffect(() => {
    if (!apiToken) return;

    async function fetchStats() {
      const res = await getDashboardStats(apiToken!);
      if (res.success && res.data) {
        setStats(res.data);
      }
      setStatsLoading(false);
    }

    fetchStats();
    let interval: ReturnType<typeof setInterval> | null = setInterval(fetchStats, 30_000);

    function handleVisibility() {
      if (document.hidden) {
        if (interval) {
          clearInterval(interval);
          interval = null;
        }
      } else {
        fetchStats();
        if (!interval) {
          interval = setInterval(fetchStats, 30_000);
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [apiToken]);

  async function handleLinkSteam(e: React.FormEvent) {
    e.preventDefault();
    setLinkError(null);
    setLinkSuccess(false);

    if (!apiToken) {
      setLinkError("Not authenticated with the API. Please try refreshing.");
      return;
    }

    if (!steamId.trim()) {
      setLinkError("Please enter a Steam ID.");
      return;
    }

    const res = await linkSteam(apiToken, steamId.trim());
    if (res.success && res.data) {
      setLinkedUser(res.data);
      setSteamId("");
      setLinkSuccess(true);
    } else {
      setLinkError(res.error || "Failed to link Steam ID.");
    }
  }

  if (!apiToken) {
    return (
      <div className="text-text-secondary">Loading dashboard...</div>
    );
  }

  const isAdmin = hasPermission("developer");
  const canViewMembers = hasPermission("view:members");
  const canViewWhitelist = hasPermission("view:whitelist");
  const canManageMatches = hasPermission("manage:matches");

  const statCards: { label: string; value: string | number; accent?: boolean; href?: string }[] = [];

  if (isAdmin && stats?.tickets) {
    statCards.push({
      label: "Open Tickets",
      value: stats.tickets.open,
      accent: stats.tickets.open > 0,
      href: "/tickets",
    });
  }

  if (isAdmin && stats?.prospects) {
    statCards.push({
      label: "Pending Prospects",
      value: stats.prospects.open,
      accent: stats.prospects.open > 0,
      href: "/tickets",
    });
  }

  if (canViewMembers && stats?.members) {
    statCards.push({
      label: "Total Members",
      value: stats.members.total,
    });
  }

  if (canViewWhitelist && stats?.whitelist) {
    statCards.push({
      label: "Whitelist Entries",
      value: stats.whitelist.total,
      href: "/whitelist",
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Profile Header ─────────────────────────────────────────── */}
      <div className="facet-border rounded-sm bg-bg-card p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* Avatar + name */}
          <div className="flex items-center gap-3 sm:min-w-0 sm:shrink-0">
            {session?.user?.image ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={session.user.image}
                alt="Avatar"
                className="h-10 w-10 rounded-full ring-2 ring-accent/20"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
                {(session?.user?.name || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text-primary">
                {session?.user?.name || "Unknown"}
              </div>
              <div className="truncate text-xs text-text-muted">
                {session?.user?.email || ""}
              </div>
            </div>
          </div>

          {/* IDs */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:ml-auto">
            {displayUser?.discordId && (
              <FieldTip>
                <span className="text-text-muted">Discord </span>
                <code className="text-accent">{displayUser.discordId}</code>
              </FieldTip>
            )}
            {displayUser?.steamId ? (
              <FieldTip>
                <span className="text-text-muted">Steam </span>
                <code className="text-accent">{displayUser.steamId}</code>
              </FieldTip>
            ) : (
              <div className="text-text-muted">Steam: not linked</div>
            )}
            {displayUser?.eosId && (
              <FieldTip>
                <span className="text-text-muted">EOS </span>
                <code className="text-accent">{displayUser.eosId}</code>
              </FieldTip>
            )}
            <FieldTip>
              <span className="text-text-muted">Country </span>
              <span className={displayUser?.country ? "text-text-secondary" : "text-text-muted"}>
                {displayUser?.country || "--"}
              </span>
            </FieldTip>
            <FieldTip>
              <span className="text-text-muted">DOB </span>
              <span className={displayUser?.dateOfBirth ? "text-text-secondary" : "text-text-muted"}>
                {displayUser?.dateOfBirth ? formatDate(displayUser.dateOfBirth) : "--"}
              </span>
            </FieldTip>
          </div>
        </div>

        {/* Roles */}
        {displayUser?.roles && displayUser.roles.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/30 pt-3">
            {displayUser.roles.map((role) => (
              <FieldTip key={role.id}>
                <span className="rounded-sm border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent">
                  {role.name}
                </span>
              </FieldTip>
            ))}
          </div>
        )}

        {/* Inline Steam link form (only if not linked) */}
        {!displayUser?.steamId && (
          <div className="mt-3 border-t border-border/30 pt-3">
            <form onSubmit={handleLinkSteam} className="flex items-center gap-2">
              <input
                type="text"
                value={steamId}
                onChange={(e) => setSteamId(e.target.value)}
                placeholder="Enter Steam64 ID to link"
                className="min-w-0 flex-1 rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                className="shrink-0 rounded-sm bg-accent px-4 py-1.5 text-xs font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted"
              >
                Link
              </button>
            </form>
            {linkError && <p className="mt-1.5 text-xs text-danger">{linkError}</p>}
            {linkSuccess && <p className="mt-1.5 text-xs text-success">Steam ID linked.</p>}
          </div>
        )}

        {/* Birthday privacy self-service */}
        {displayUser && (
          <BirthdayPrefsToggles
            token={apiToken}
            initialOptOut={displayUser.birthdayOptOut}
            initialShowAge={displayUser.birthdayShowAge}
          />
        )}
      </div>

      {/* ── Birthday announcements (admin) ─────────────────────────── */}
      {hasPermission("manage:discord-bot") && <BirthdayAdminCard token={apiToken} />}

      {/* ── My Squad Stats ─────────────────────────────────────────── */}
      <PlayerStatsSection />

      {/* ── Server Status ──────────────────────────────────────────── */}
      {statsLoading ? (
        <SkeletonStatGrid count={2} className="grid gap-4 sm:grid-cols-2" />
      ) : stats?.servers && stats.servers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {stats.servers.map((server) => (
            <ServerStatusCard key={server.id} server={server} />
          ))}
        </div>
      ) : null}

      {/* ── Quick Stats ────────────────────────────────────────────── */}
      {statCards.length > 0 && (
        <div
          className={`grid gap-4 ${
            statCards.length >= 4
              ? "grid-cols-2 lg:grid-cols-4"
              : statCards.length === 3
                ? "grid-cols-2 lg:grid-cols-3"
                : statCards.length === 2
                  ? "sm:grid-cols-2"
                  : ""
          }`}
        >
          {statCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>
      )}

      {/* ── Recent Matches ─────────────────────────────────────────── */}
      {canManageMatches &&
        stats?.recentMatches &&
        stats.recentMatches.length > 0 && (
          <div className="facet-border rounded-sm bg-bg-card">
            <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
              <h2 className="font-display text-sm font-semibold tracking-wide">
                Recent Matches
              </h2>
              <Link
                href="/match-manager"
                className="text-xs font-medium text-accent transition-colors hover:text-accent-muted"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-border/30">
              {stats.recentMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center gap-4 px-5 py-3"
                >
                  <span className="w-20 shrink-0 text-xs text-text-muted">
                    {new Date(match.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "2-digit",
                    })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
                    {match.map}
                  </span>
                  <span className="hidden text-xs text-text-muted sm:block">
                    {match.server}
                  </span>
                  <span
                    className={`inline-flex rounded-sm border px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase ${resultBadgeBg(
                      match.result
                    )}`}
                  >
                    {match.result}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
