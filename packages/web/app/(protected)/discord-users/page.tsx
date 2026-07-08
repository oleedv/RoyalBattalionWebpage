"use client";
import { usePermissions } from "@/lib/permission-context";
import { DiscordUsersView, defaultApi } from "./discord-users-view";
export default function DiscordUsersPage() {
  const { apiToken, permissions } = usePermissions();
  return <DiscordUsersView token={apiToken ?? ""} permissions={permissions as string[]} api={defaultApi} />;
}
