"use client";

import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UserProfile } from "shared";
import { getUserProfileBySteamId } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import {
  UserProfileContent,
  UserProfileLoading,
  UserProfileError,
} from "@/components/user-profile/UserProfileContent";

export default function ProfileBySteamIdPage({
  params,
}: {
  params: Promise<{ steamId: string }>;
}) {
  const { steamId } = use(params);
  const { apiToken } = usePermissions();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiToken) return;
    setLoading(true);
    setError(null);
    const res = await getUserProfileBySteamId(apiToken, steamId);
    if (res.success && res.data) {
      // If a User exists for this steamId, redirect to the canonical URL.
      if (res.data.user) {
        router.replace(`/users/${res.data.user.id}`);
        return;
      }
      setProfile(res.data);
    } else {
      setError(res.error || "Failed to load profile");
    }
    setLoading(false);
  }, [apiToken, steamId, router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/whitelist"
          className="text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          ← Back
        </Link>
      </div>
      <div className="rounded-sm border border-border bg-bg-card">
        {loading && <UserProfileLoading />}
        {error && <UserProfileError message={error} />}
        {profile && <UserProfileContent profile={profile} />}
      </div>
    </div>
  );
}
