"use client";

import { usePermissions } from "@/lib/permission-context";
import { Skeleton, SkeletonCard, SkeletonStatGrid } from "@/components/skeleton";
import { TempVoiceView } from "./view";

export default function TempVoicePage() {
  const { apiToken, hasPermission } = usePermissions();

  if (!apiToken) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-9 w-48" />
        <SkeletonStatGrid count={5} className="grid gap-3 sm:grid-cols-5" />
        <SkeletonCard pad="p-4">
          <Skeleton className="h-24 w-full" />
        </SkeletonCard>
      </div>
    );
  }

  const canView =
    hasPermission("view:temp-voice")
    || hasPermission("manage:temp-voice")
    || hasPermission("view:discord-bot")
    || hasPermission("manage:discord-bot");
  if (!canView) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  return (
    <TempVoiceView
      apiToken={apiToken}
      canManage={hasPermission("manage:temp-voice") || hasPermission("manage:discord-bot")}
    />
  );
}
