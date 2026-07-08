"use client";

import { usePermissions } from "@/lib/permission-context";
import { MatchManagerView } from "./match-manager-view";

export default function MatchesPage() {
  const { apiToken } = usePermissions();
  if (!apiToken) return null;
  return <MatchManagerView token={apiToken} />;
}
