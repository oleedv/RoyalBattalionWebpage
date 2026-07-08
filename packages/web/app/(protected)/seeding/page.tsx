"use client";

import { usePermissions } from "@/lib/permission-context";
import { PageHeader } from "@/components/page-header";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { SeedingLeaderboard } from "./components/SeedingLeaderboard";
import { SeedingLiveStatus } from "./components/SeedingLiveStatus";
import { SeedingAdmin } from "./components/SeedingAdmin";

export default function SeedingPage() {
  const { apiToken, hasPermission } = usePermissions();

  if (!apiToken) return null;

  const canView = hasPermission("view:seeding-tracker");
  const canManage = hasPermission("manage:discord-bot");

  if (!canView && !canManage) {
    return (
      <div className="flex justify-center py-12">
        <AccessDeniedCard message="You need seeding access to view this page." />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <PageHeader title="Seeding" />

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
