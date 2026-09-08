"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import type { UserProfile } from "shared";
import { getUserProfile } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import {
  UserProfileContent,
  UserProfileLoading,
  UserProfileError,
} from "@/components/user-profile/UserProfileContent";
import { ExtraPermissionsPanel } from "@/components/user-profile/extra-permissions";

export default function UserProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { apiToken } = usePermissions();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiToken) return;
    setLoading(true);
    setError(null);
    const res = await getUserProfile(apiToken, id);
    if (res.success && res.data) {
      setProfile(res.data);
    } else {
      setError(res.error || "Failed to load profile");
    }
    setLoading(false);
  }, [apiToken, id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/members"
          className="text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          ← Back
        </Link>
      </div>
      <div className="rounded-sm border border-border bg-bg-card">
        {loading && !profile && <UserProfileLoading />}
        {error && <UserProfileError message={error} />}
        {profile && <UserProfileContent profile={profile} />}
      </div>
      {profile?.user && (
        <ExtraPermissionsPanel
          userId={profile.user.id}
          value={profile.extraPermissions ?? []}
          onSaved={(permissions) =>
            setProfile((prev) => (prev ? { ...prev, extraPermissions: permissions } : prev))
          }
        />
      )}
    </div>
  );
}
