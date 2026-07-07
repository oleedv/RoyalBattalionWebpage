"use client";

import { useEffect, useState } from "react";
import { linkSteam, updateBirthdayPrefs } from "@/lib/api-client";
import type { ApiResponse, UserWithRoles } from "shared";
import { toastError, toastSuccess } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { FieldTip } from "@/components/field-tip";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface ProfileApi {
  linkSteam: (
    token: string,
    steamId: string,
  ) => Promise<ApiResponse<UserWithRoles>>;
  updateBirthdayPrefs: (
    token: string,
    data: { birthdayOptOut?: boolean; birthdayShowAge?: boolean },
  ) => Promise<ApiResponse<{ birthdayOptOut: boolean; birthdayShowAge: boolean }>>;
}

export interface ProfileNotify {
  success: (message: string) => void;
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: ProfileApi = { linkSteam, updateBirthdayPrefs };
const defaultNotify: ProfileNotify = { success: toastSuccess, error: toastError };

function BirthdayPrefsToggles({
  token,
  initialOptOut,
  initialShowAge,
  api,
  notify,
}: {
  token: string;
  initialOptOut: boolean;
  initialShowAge: boolean;
  api: ProfileApi;
  notify: ProfileNotify;
}) {
  const [optOut, setOptOut] = useState(initialOptOut);
  const [showAge, setShowAge] = useState(initialShowAge);

  // Keep in sync if the context user re-syncs (token refresh every ~2 min).
  useEffect(() => {
    setOptOut(initialOptOut);
    setShowAge(initialShowAge);
  }, [initialOptOut, initialShowAge]);

  async function update(next: {
    birthdayOptOut?: boolean;
    birthdayShowAge?: boolean;
  }) {
    const res = await api.updateBirthdayPrefs(token, next);
    if (res.success && res.data) {
      setOptOut(res.data.birthdayOptOut);
      setShowAge(res.data.birthdayShowAge);
    } else {
      notify.error(res.error, "Failed to save");
      // Revert the optimistic flip.
      if (next.birthdayOptOut !== undefined) setOptOut(!next.birthdayOptOut);
      if (next.birthdayShowAge !== undefined) setShowAge(!next.birthdayShowAge);
    }
  }

  return (
    <div className="mt-3 border-t border-border/30 pt-3">
      <div className="mb-1.5 text-[10px] font-medium tracking-wider text-text-muted uppercase">
        Birthday
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Switch
            checked={optOut}
            aria-label="Don't announce my birthday"
            onCheckedChange={(next) => {
              setOptOut(next);
              update({ birthdayOptOut: next });
            }}
          />
          <span>Don&apos;t announce my birthday</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Switch
            checked={showAge}
            aria-label="Show my age in the announcement"
            onCheckedChange={(next) => {
              setShowAge(next);
              update({ birthdayShowAge: next });
            }}
          />
          <span>Show my age in the announcement</span>
        </div>
      </div>
    </div>
  );
}

export default function ProfileCard({
  token,
  sessionName,
  sessionEmail,
  sessionImage,
  user,
  api = defaultApi,
  notify = defaultNotify,
}: {
  token: string;
  sessionName: string | null;
  sessionEmail: string | null;
  sessionImage: string | null;
  user: UserWithRoles | null;
  api?: ProfileApi;
  notify?: ProfileNotify;
}) {
  const [linkedUser, setLinkedUser] = useState<UserWithRoles | null>(null);
  const [steamId, setSteamId] = useState("");

  const displayUser = linkedUser || user;

  async function handleLinkSteam(e: React.FormEvent) {
    e.preventDefault();
    if (!steamId.trim()) {
      notify.error("Please enter a Steam ID.");
      return;
    }
    const res = await api.linkSteam(token, steamId.trim());
    if (res.success && res.data) {
      setLinkedUser(res.data);
      setSteamId("");
      notify.success("Steam ID linked.");
    } else {
      notify.error(res.error, "Failed to link Steam ID.");
    }
  }

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Avatar + name */}
        <div className="flex items-center gap-3 sm:min-w-0 sm:shrink-0">
          {sessionImage ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={sessionImage}
              alt="Avatar"
              className="h-10 w-10 rounded-full ring-2 ring-accent/20"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
              {(sessionName || "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-text-primary">
              {sessionName || "Unknown"}
            </div>
            <div className="truncate text-xs text-text-muted">
              {sessionEmail || ""}
            </div>
          </div>
        </div>

        {/* IDs */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs sm:ml-auto">
          {displayUser?.discordId && (
            <FieldTip>
              <span className="text-text-muted">Discord </span>
              <code className="font-mono text-accent">{displayUser.discordId}</code>
            </FieldTip>
          )}
          {displayUser?.steamId ? (
            <FieldTip>
              <span className="text-text-muted">Steam </span>
              <code className="font-mono text-accent">{displayUser.steamId}</code>
            </FieldTip>
          ) : (
            <div className="text-text-muted">Steam: not linked</div>
          )}
          {displayUser?.eosId && (
            <FieldTip>
              <span className="text-text-muted">EOS </span>
              <code className="font-mono text-accent">{displayUser.eosId}</code>
            </FieldTip>
          )}
          <FieldTip>
            <span className="text-text-muted">Country </span>
            <span
              className={
                displayUser?.country ? "text-text-secondary" : "text-text-muted"
              }
            >
              {displayUser?.country || "--"}
            </span>
          </FieldTip>
          <FieldTip>
            <span className="text-text-muted">DOB </span>
            <span
              className={
                displayUser?.dateOfBirth
                  ? "text-text-secondary"
                  : "text-text-muted"
              }
            >
              {displayUser?.dateOfBirth
                ? formatDate(displayUser.dateOfBirth)
                : "--"}
            </span>
          </FieldTip>
        </div>
      </div>

      {/* Roles */}
      {displayUser?.roles && displayUser.roles.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/30 pt-3">
          {displayUser.roles.map((role) => (
            <FieldTip key={role.id}>
              <span className="rounded-sm border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs text-accent">
                {role.name}
              </span>
            </FieldTip>
          ))}
        </div>
      )}

      {/* Inline Steam link form (only if not linked) */}
      {!displayUser?.steamId && (
        <div className="mt-3 border-t border-border/30 pt-3">
          <form
            id="steam-link"
            onSubmit={handleLinkSteam}
            className="flex items-center gap-2"
          >
            <Input
              type="text"
              value={steamId}
              onChange={(e) => setSteamId(e.target.value)}
              placeholder="Enter Steam64 ID to link"
              className="min-w-0 flex-1 font-mono text-xs"
            />
            <Button type="submit" variant="gold" size="sm" className="shrink-0">
              Link
            </Button>
          </form>
        </div>
      )}

      {/* Birthday privacy self-service */}
      {displayUser && (
        <BirthdayPrefsToggles
          token={token}
          initialOptOut={displayUser.birthdayOptOut ?? false}
          initialShowAge={displayUser.birthdayShowAge ?? false}
          api={api}
          notify={notify}
        />
      )}
    </div>
  );
}
