"use client";

import { usePermissions } from "@/lib/permission-context";
import { SeedingLeaderboard } from "./components/SeedingLeaderboard";

export default function SeedingPage() {
  const { apiToken, hasPermission } = usePermissions();

  if (!apiToken) return <div className="text-text-secondary">Loading...</div>;

  if (!hasPermission("view:seeding-tracker")) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  return <SeedingLeaderboard apiToken={apiToken} />;
}
