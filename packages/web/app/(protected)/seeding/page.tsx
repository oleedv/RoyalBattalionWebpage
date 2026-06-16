"use client";

import { usePermissions } from "@/lib/permission-context";
import { SeedingLeaderboard } from "./components/SeedingLeaderboard";
import { SeedingLiveStatus } from "./components/SeedingLiveStatus";
import { SeedingAdmin } from "./components/SeedingAdmin";

export default function SeedingPage() {
  const { apiToken, hasPermission } = usePermissions();

  if (!apiToken) return <div className="text-text-secondary">Loading...</div>;

  const canView = hasPermission("view:seeding-tracker");
  const canManage = hasPermission("manage:discord-bot");

  if (!canView && !canManage) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Seeding</h1>
      </div>

      {canView && (
        <section className="space-y-6">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
            Live Status
          </h2>
          <SeedingLiveStatus apiToken={apiToken} />
          <SeedingLeaderboard apiToken={apiToken} />
        </section>
      )}

      {canManage && (
        <section className="space-y-6">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
            Admin
          </h2>
          <SeedingAdmin apiToken={apiToken} />
        </section>
      )}
    </div>
  );
}
