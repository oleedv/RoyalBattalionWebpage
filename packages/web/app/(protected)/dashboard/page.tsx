"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { getDashboardStats } from "@/lib/api-client";
import type { DashboardStats } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { StatusBadge, matchResultVariant } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { SkeletonStatGrid } from "@/components/skeleton";
import ProfileCard from "./profile-card";
import BirthdayAdminCard from "./birthday-admin-card";
import ServerStatusCard from "./server-status-card";
import PlayerStatsSection from "./player-stats-section";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { apiToken, user: contextUser, hasPermission } = usePermissions();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!apiToken) return;
    const res = await getDashboardStats(apiToken);
    if (res.success && res.data) setStats(res.data);
    setStatsLoading(false);
  }, [apiToken]);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, 30_000);

  if (!apiToken) {
    return (
      <SkeletonStatGrid
        count={4}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      />
    );
  }

  const isAdmin = hasPermission("developer");
  const canViewMembers = hasPermission("view:members");
  const canViewWhitelist = hasPermission("view:whitelist");
  const canManageMatches = hasPermission("manage:matches");

  const statCards: {
    label: string;
    value: string | number;
    accent?: boolean;
    href?: string;
  }[] = [];

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
      <ProfileCard
        token={apiToken}
        sessionName={session?.user?.name ?? null}
        sessionEmail={session?.user?.email ?? null}
        sessionImage={session?.user?.image ?? null}
        user={contextUser}
      />

      {hasPermission("manage:discord-bot") && (
        <BirthdayAdminCard token={apiToken} />
      )}

      <PlayerStatsSection />

      {statsLoading ? (
        <SkeletonStatGrid count={2} className="grid gap-4 sm:grid-cols-2" />
      ) : stats?.servers && stats.servers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {stats.servers.map((server) => (
            <ServerStatusCard key={server.id} server={server} />
          ))}
        </div>
      ) : null}

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
                className="text-xs font-medium text-accent transition-colors hover:text-accent-bright"
              >
                View all
              </Link>
            </div>
            <div className="divide-y divide-border/30">
              {stats.recentMatches.map((match) => (
                <div key={match.id} className="flex items-center gap-4 px-5 py-3">
                  <span className="w-20 shrink-0 font-mono text-xs text-text-muted">
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
                  <StatusBadge variant={matchResultVariant(match.result)} />
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  );
}
