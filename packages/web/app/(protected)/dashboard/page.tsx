"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { syncAuth, getMe, linkSteam } from "@/lib/api-client";
import type { UserWithRoles, Permission } from "shared";

export default function DashboardPage() {
  const { data: session } = useSession();
  const [user, setUser] = useState<UserWithRoles | null>(null);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [steamId, setSteamId] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      if (!session?.accessToken) return;

      try {
        // Sync with backend to get API token
        const syncRes = await syncAuth(session.accessToken);
        if (syncRes.success && syncRes.data) {
          setApiToken(syncRes.data.token);
          setUser(syncRes.data.user);
          setPermissions(syncRes.data.permissions);
        }
      } catch {
        // If sync fails, try to get existing user data
        console.error("Failed to sync auth");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [session]);

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
      setUser(res.data);
      setSteamId("");
      setLinkSuccess(true);
    } else {
      setLinkError(res.error || "Failed to link Steam ID.");
    }
  }

  if (loading) {
    return (
      <div className="text-text-secondary">Loading dashboard...</div>
    );
  }

  return (
    <div>
      <h1 className="mb-8 text-3xl font-bold">Dashboard</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Info Card */}
        <div className="rounded border border-border bg-bg-secondary p-6">
          <h2 className="mb-4 text-lg font-semibold">Your Profile</h2>
          <div className="flex items-start gap-4">
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt="Avatar"
                className="h-16 w-16 rounded-full border-2 border-border"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-lg font-medium text-text-primary">
                {session?.user?.name || "Unknown"}
              </div>
              <div className="mt-1 text-sm text-text-secondary">
                {session?.user?.email || "No email"}
              </div>
              <div className="mt-3">
                <span className="text-xs font-medium tracking-widest text-text-muted uppercase">
                  Steam ID
                </span>
                <div className="mt-0.5 text-sm">
                  {user?.steamId ? (
                    <code className="text-accent">{user.steamId}</code>
                  ) : (
                    <span className="text-text-muted">Not linked</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Roles Card */}
        <div className="rounded border border-border bg-bg-secondary p-6">
          <h2 className="mb-4 text-lg font-semibold">Your Roles</h2>
          {user?.roles && user.roles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {user.roles.map((role) => (
                <span
                  key={role.id}
                  className="rounded border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent"
                >
                  {role.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No roles assigned. Roles are synced from Discord automatically.
            </p>
          )}

          {permissions.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium text-text-muted">
                Permissions
              </h3>
              <div className="flex flex-wrap gap-2">
                {permissions.map((perm) => (
                  <span
                    key={perm}
                    className="rounded bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Link Steam Card */}
        <div className="rounded border border-border bg-bg-secondary p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold">Link Steam Account</h2>
          <p className="mb-4 text-sm text-text-secondary">
            Enter your Steam64 ID to link your Steam account. This is required
            for server whitelist access.
          </p>

          <form onSubmit={handleLinkSteam} className="flex gap-3">
            <input
              type="text"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="Enter Steam64 ID (e.g. 76561198012345678)"
              className="flex-1 rounded border border-border bg-bg-tertiary px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded bg-accent px-6 py-2.5 text-sm font-semibold text-bg-primary transition-colors hover:bg-accent-muted"
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
