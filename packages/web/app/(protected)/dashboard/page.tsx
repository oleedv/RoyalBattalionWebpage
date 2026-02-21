"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { linkSteam, getDashboardStats } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { UserWithRoles } from "shared";
import type { DashboardStats, ServerStatus } from "@/lib/api-client";

const SERVER_META: Record<string, { label: string; connectUrl: string }> = {
  "Main Server": {
    label: "Main Server",
    connectUrl: "steam://connect/37.153.157.204:27050",
  },
  "Battle Server": {
    label: "Battle Server",
    connectUrl: "steam://connect/37.153.157.204:27060",
  },
};

function ServerStatusCard({ server }: { server: ServerStatus }) {
  const isOnline = server.status === "online";
  const meta = Object.values(SERVER_META).find((m) =>
    server.name.toLowerCase().includes(m.label.toLowerCase().split(" ")[0].toLowerCase())
  ) || { label: server.name, connectUrl: "#" };

  return (
    <div className="facet-border group rounded-sm bg-bg-card p-5 transition-colors hover:bg-bg-card-hover">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
          {meta.label}
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

      <div className="mb-3 flex items-baseline gap-1">
        <span className="font-display text-3xl font-bold tracking-wide text-text-primary">
          {server.players}
        </span>
        <span className="text-sm text-text-muted">/ {server.maxPlayers}</span>
      </div>

      <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-bg-tertiary">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{
            width: `${(server.players / server.maxPlayers) * 100}%`,
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">{server.map}</span>
        <a
          href={meta.connectUrl}
          className="text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100"
        >
          Connect
        </a>
      </div>
    </div>
  );
}

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

  if (href) {
    return <Link href={href}>{inner}</Link>;
  }
  return inner;
}

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
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
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

  const isAdmin = hasPermission("admin");
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

  if (canManageMatches && stats?.matches) {
    statCards.push({
      label: "Match Record",
      value: `${stats.matches.wins}W - ${stats.matches.losses}L - ${stats.matches.draws}D`,
      href: "/match-manager",
    });
  }

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl font-bold tracking-wide sm:mb-8 sm:text-3xl">
        Dashboard
      </h1>

      {/* Server Status Row */}
      {statsLoading ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="facet-border animate-pulse rounded-sm bg-bg-card p-5"
            >
              <div className="mb-3 h-3 w-24 rounded bg-bg-tertiary" />
              <div className="mb-3 h-8 w-16 rounded bg-bg-tertiary" />
              <div className="h-1 w-full rounded-full bg-bg-tertiary" />
            </div>
          ))}
        </div>
      ) : stats?.servers && stats.servers.length > 0 ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          {stats.servers.map((server) => (
            <ServerStatusCard key={server.id} server={server} />
          ))}
        </div>
      ) : null}

      {/* Quick Stats Row */}
      {statCards.length > 0 && (
        <div
          className={`mb-6 grid gap-4 ${
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

      {/* Recent Matches */}
      {canManageMatches &&
        stats?.recentMatches &&
        stats.recentMatches.length > 0 && (
          <div className="facet-border mb-6 rounded-sm bg-bg-card">
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

      {/* Existing cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Info Card */}
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">
            Your Profile
          </h2>
          <div className="flex items-start gap-4">
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt="Avatar"
                className="h-16 w-16 rounded-full border-2 border-accent/20"
              />
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="text-lg font-medium text-text-primary">
                  {session?.user?.name || "Unknown"}
                </div>
                <div className="mt-0.5 text-sm text-text-secondary">
                  {session?.user?.email || "No email"}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                    Discord ID
                  </span>
                  <div className="mt-0.5 text-sm">
                    {displayUser?.discordId ? (
                      <code className="text-accent">
                        {displayUser.discordId}
                      </code>
                    ) : (
                      <span className="text-text-muted">--</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                    Steam ID
                  </span>
                  <div className="mt-0.5 text-sm">
                    {displayUser?.steamId ? (
                      <code className="text-accent">
                        {displayUser.steamId}
                      </code>
                    ) : (
                      <span className="text-text-muted">Not linked</span>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                    EOS ID
                  </span>
                  <div className="mt-0.5 text-sm">
                    {displayUser?.eosId ? (
                      <code className="text-accent">{displayUser.eosId}</code>
                    ) : (
                      <span className="text-text-muted">Not set</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Roles Card */}
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">
            Your Roles
          </h2>
          {displayUser?.roles && displayUser.roles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {displayUser.roles.map((role) => (
                <span
                  key={role.id}
                  className="rounded-sm border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent"
                >
                  {role.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No system roles assigned. Roles are managed in the Roles
              dashboard.
            </p>
          )}
        </div>

        {/* Link Steam Card */}
        <div className="facet-border rounded-sm bg-bg-card p-6 lg:col-span-2">
          <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">
            Link Steam Account
          </h2>
          <p className="mb-4 text-sm text-text-secondary">
            Enter your Steam64 ID to link your Steam account. This is required
            for server whitelist access.
          </p>

          <form
            onSubmit={handleLinkSteam}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <input
              type="text"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="Enter Steam64 ID (e.g. 76561198012345678)"
              className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted"
            >
              Link Steam
            </button>
          </form>

          {linkError && (
            <p className="mt-3 text-sm text-danger">{linkError}</p>
          )}
          {linkSuccess && (
            <p className="mt-3 text-sm text-success">
              Steam ID linked successfully.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
