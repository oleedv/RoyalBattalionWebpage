"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";
import { linkSteam } from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { UserWithRoles } from "shared";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { apiToken, user: contextUser, permissions } = usePermissions();
  const [linkedUser, setLinkedUser] = useState<UserWithRoles | null>(null);
  const [steamId, setSteamId] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);

  // Use locally-updated user (from Steam link) if available, otherwise context
  const displayUser = linkedUser || contextUser;

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
      setLinkedUser(res.data);
      setSteamId("");
      setLinkSuccess(true);
    } else {
      setLinkError(res.error || "Failed to link Steam ID.");
    }
  }

  if (!apiToken) {
    return (
      <div className="text-text-secondary">Loading dashboard...</div>
    );
  }

  return (
    <div>
      <h1 className="font-display mb-6 text-2xl font-bold tracking-wide sm:mb-8 sm:text-3xl">Dashboard</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* User Info Card */}
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">Your Profile</h2>
          <div className="flex items-start gap-4">
            {session?.user?.image && (
              <img
                src={session.user.image}
                alt="Avatar"
                className="h-16 w-16 rounded-full border-2 border-accent/20"
              />
            )}
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <div className="text-lg font-medium text-text-primary">
                  {session?.user?.name || "Unknown"}
                </div>
                <div className="mt-0.5 text-sm text-text-secondary">
                  {session?.user?.email || "No email"}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                    Discord ID
                  </span>
                  <div className="mt-0.5 text-sm">
                    {displayUser?.discordId ? (
                      <code className="text-accent">{displayUser.discordId}</code>
                    ) : (
                      <span className="text-text-muted">--</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                    Steam ID
                  </span>
                  <div className="mt-0.5 text-sm">
                    {displayUser?.steamId ? (
                      <code className="text-accent">{displayUser.steamId}</code>
                    ) : (
                      <span className="text-text-muted">Not linked</span>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                    EOS ID
                  </span>
                  <div className="mt-0.5 text-sm">
                    {displayUser?.eosId ? (
                      <code className="text-accent">{displayUser.eosId}</code>
                    ) : (
                      <span className="text-text-muted">Not set</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Roles Card */}
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">Your Roles</h2>
          {displayUser?.roles && displayUser.roles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {displayUser.roles.map((role) => (
                <span
                  key={role.id}
                  className="rounded-sm border border-accent/30 bg-accent/10 px-3 py-1 text-sm text-accent"
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
              <h3 className="mb-2 text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
                Permissions
              </h3>
              <div className="flex flex-wrap gap-2">
                {permissions.map((perm) => (
                  <span
                    key={perm}
                    className="rounded-sm bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
                  >
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Link Steam Card */}
        <div className="facet-border rounded-sm bg-bg-card p-6 lg:col-span-2">
          <h2 className="font-display mb-4 text-lg font-semibold tracking-wide">Link Steam Account</h2>
          <p className="mb-4 text-sm text-text-secondary">
            Enter your Steam64 ID to link your Steam account. This is required
            for server whitelist access.
          </p>

          <form onSubmit={handleLinkSteam} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="Enter Steam64 ID (e.g. 76561198012345678)"
              className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted"
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
