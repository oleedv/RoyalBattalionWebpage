"use client";

import Link from "next/link";
import { useState } from "react";
import type { UserProfile, LinkedWhitelistEntry, LiveStatus } from "shared";
import { formatDate } from "@/lib/format";
import { usePermissions } from "@/lib/permission-context";
import { Skeleton, SkeletonRegion } from "@/components/skeleton";

function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/40 px-6 py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h3>
      {children}
    </div>
  );
}

function StatusBadges({ profile }: { profile: UserProfile }) {
  const u = profile.user;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {profile.liveStatus?.online && (
        <span className="rounded-sm bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
          Online now
        </span>
      )}
      {u?.disabled && (
        <span className="rounded-sm bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
          Disabled
        </span>
      )}
      {u && !u.hasLoggedIn && !u.disabled && (
        <span className="rounded-sm bg-text-muted/10 px-1.5 py-0.5 text-[10px] text-text-muted">
          Discord only
        </span>
      )}
      {!u && (
        <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-[10px] font-medium text-warning">
          Not linked to a Discord user
        </span>
      )}
    </div>
  );
}

function LiveStatusSection({
  status,
  actions,
}: {
  status: LiveStatus;
  actions?: { onWarn?: () => void; onKick?: () => void; onSwitchTeam?: () => void };
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <InfoField label="Server name">
        <span className="text-text-secondary">{status.name ?? "--"}</span>
      </InfoField>
      <InfoField label="Team">
        <span className="text-text-secondary">{status.teamID ?? "--"}</span>
      </InfoField>
      <InfoField label="Squad">
        <span className="text-text-secondary">
          {status.squadName ? `${status.squadName} (${status.squadID})` : status.squadID ?? "--"}
        </span>
      </InfoField>
      <InfoField label="Role">
        <span className="text-text-secondary">{status.role ?? "--"}</span>
      </InfoField>
      {actions && (
        <div className="col-span-2 flex gap-2 sm:col-span-4">
          {actions.onWarn && (
            <button
              onClick={actions.onWarn}
              className="rounded-sm border border-warning/40 bg-warning/10 px-3 py-1 text-xs text-warning transition-colors hover:bg-warning/20"
            >
              Warn
            </button>
          )}
          {actions.onSwitchTeam && (
            <button
              onClick={actions.onSwitchTeam}
              className="rounded-sm border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary"
            >
              Switch team
            </button>
          )}
          {actions.onKick && (
            <button
              onClick={actions.onKick}
              className="rounded-sm border border-danger/40 bg-danger/10 px-3 py-1 text-xs text-danger transition-colors hover:bg-danger/20"
            >
              Kick
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function WhitelistSection({ entries }: { entries: LinkedWhitelistEntry[] }) {
  if (entries.length === 0) {
    return <div className="text-xs text-text-muted">No whitelist entries linked.</div>;
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border/50 bg-bg-tertiary/30 px-3 py-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-sm bg-bg-tertiary px-2 py-0.5 font-medium text-text-secondary">
              {e.server}
            </span>
            {e.groupName && (
              <span className="rounded-sm border border-accent/20 bg-accent/5 px-2 py-0.5 text-accent">
                {e.groupName}
              </span>
            )}
            {e.clanName && <span className="text-text-secondary">{e.clanName}</span>}
            {e.role && <span className="text-text-muted">{e.role}</span>}
          </div>
          <div className="flex items-center gap-3 text-text-muted">
            {e.expiresAt ? (
              <span>expires {formatDate(e.expiresAt)}</span>
            ) : (
              <span>permanent</span>
            )}
            {e.addedByName && <span>by {e.addedByName}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface UserProfileContentProps {
  profile: UserProfile;
  /** When provided, renders an "Open full page" link to /users/[id]. */
  showOpenPageLink?: boolean;
  /** Live-server admin actions, only rendered when liveStatus.online. */
  liveActions?: { onWarn?: () => void; onKick?: () => void; onSwitchTeam?: () => void };
  /** Called when user clicks "Link to user" on a steamId-keyed profile. */
  onLinkToUser?: () => void;
}

export function UserProfileContent({
  profile,
  showOpenPageLink,
  liveActions,
  onLinkToUser,
}: UserProfileContentProps) {
  const { hasPermission } = usePermissions();
  const u = profile.user;
  const canManage = hasPermission("manage:members");

  const displayName = u?.displayName ?? u?.discordName ?? profile.displayName ?? profile.steamId ?? "Unknown";
  const avatarLetter = (displayName || "?").charAt(0).toUpperCase();

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-4 border-b border-border/40 px-6 py-5">
        <div className="relative">
          {u?.avatarUrl ? (
            <img src={u.avatarUrl} alt="" className="h-12 w-12 rounded-full" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-tertiary text-lg text-text-muted">
              {avatarLetter}
            </div>
          )}
          {profile.liveStatus?.online && (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg-card bg-success"
              title="Online now"
            />
          )}
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-text-primary">{displayName}</h2>
            {u && (u.roles ?? []).map((r) => (
              <span
                key={r.id}
                className="rounded-sm border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent"
              >
                {r.name}
              </span>
            ))}
          </div>
          {u && (
            <div className="text-xs text-text-muted">
              {u.displayName ? `${u.discordName} · ${u.discordId}` : u.discordId}
            </div>
          )}
          <div className="mt-2">
            <StatusBadges profile={profile} />
          </div>
        </div>
        {showOpenPageLink && u && (
          <Link
            href={`/users/${u.id}`}
            className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          >
            Open full page →
          </Link>
        )}
        {showOpenPageLink && !u && profile.steamId && (
          <Link
            href={`/users/by-steamid/${profile.steamId}`}
            className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
          >
            Open full page →
          </Link>
        )}
      </div>

      {/* Identity */}
      <Section title="Identity">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoField label="Steam ID">
            {profile.steamId ? (
              <code className="text-accent">{profile.steamId}</code>
            ) : (
              <span className="text-text-muted">--</span>
            )}
          </InfoField>
          <InfoField label="EOS ID">
            {profile.eosId ? (
              <code className="text-xs text-accent">{profile.eosId}</code>
            ) : (
              <span className="text-text-muted">--</span>
            )}
          </InfoField>
          {u && (
            <>
              <InfoField label="Discord ID">
                <code className="text-xs text-text-secondary">{u.discordId}</code>
              </InfoField>
              <InfoField label="Country">
                <span className={u.country ? "text-text-secondary" : "text-text-muted"}>
                  {u.country || "--"}
                </span>
              </InfoField>
              <InfoField label="Date of Birth">
                <span className={u.dateOfBirth ? "text-text-secondary" : "text-text-muted"}>
                  {u.dateOfBirth ? formatDate(u.dateOfBirth) : "--"}
                </span>
              </InfoField>
              <InfoField label="Membership Date">
                <span className={u.membershipDate ? "text-text-secondary" : "text-text-muted"}>
                  {u.membershipDate ? formatDate(u.membershipDate) : "--"}
                </span>
              </InfoField>
              <InfoField label="Joined">
                <span className="text-text-secondary">{formatDate(u.createdAt)}</span>
              </InfoField>
            </>
          )}
        </div>
        {!u && profile.steamId && canManage && onLinkToUser && (
          <div className="mt-4">
            <button
              onClick={onLinkToUser}
              className="rounded-sm border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent transition-colors hover:bg-accent/20"
            >
              Link this Steam ID to a user…
            </button>
          </div>
        )}
      </Section>

      {/* Roles */}
      {u && (
        <Section title="Roles">
          {(u.roles ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {u.roles.map((r) => (
                <span
                  key={r.id}
                  className="rounded-sm border border-border bg-bg-tertiary/40 px-2 py-0.5 text-xs text-text-secondary"
                >
                  {r.name}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-text-muted">No roles assigned.</div>
          )}
        </Section>
      )}

      {/* Activity */}
      {u && (
        <Section title="Activity">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <InfoField label="Activity 30d">
              <span className="text-text-secondary">{u.playtime30}h</span>
            </InfoField>
            <InfoField label="Activity 90d">
              <span className="text-text-secondary">{u.playtime90}h</span>
            </InfoField>
            <InfoField label="Seed time 30d">
              <span className="text-text-secondary">{u.seed30}h</span>
            </InfoField>
            <InfoField label="Seed time 90d">
              <span className="text-text-secondary">{u.seed90}h</span>
            </InfoField>
          </div>
        </Section>
      )}

      {/* Whitelist */}
      <Section title={`Whitelist (${profile.whitelistEntries.length})`}>
        <WhitelistSection entries={profile.whitelistEntries} />
      </Section>

      {/* Live status */}
      {profile.liveStatus?.online && (
        <Section title="Live status">
          <LiveStatusSection status={profile.liveStatus} actions={liveActions} />
        </Section>
      )}

      {/* Comments */}
      {u && u.comments.length > 0 && (
        <Section title={`Comments (${u.comments.length})`}>
          <div className="space-y-2">
            {u.comments.map((c) => (
              <div key={c.id} className="rounded-sm border border-border/40 bg-bg-tertiary/30 px-3 py-2 text-xs">
                <div className="mb-1 flex items-center justify-between text-text-muted">
                  <span className="font-medium text-text-secondary">{c.authorName}</span>
                  <span>{formatDate(c.createdAt)}</span>
                </div>
                <div className="whitespace-pre-wrap text-text-secondary">{c.text}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

export function UserProfileLoading() {
  return (
    <SkeletonRegion label="Loading profile…" className="overflow-hidden">
      {/* Header: avatar circle + name/meta/badge bars */}
      <div className="flex items-start gap-4 border-b border-border/40 px-6 py-5">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-4 w-24 rounded-sm" />
        </div>
      </div>

      {/* Sections: title bar + grid of label/value field bars */}
      {[3, 4, 2].map((fields, s) => (
        <div key={s} className="border-t border-border/40 px-6 py-4">
          <Skeleton className="mb-3 h-3 w-28" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: fields }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-2.5 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </SkeletonRegion>
  );
}

export function UserProfileError({ message }: { message: string }) {
  return (
    <div className="px-6 py-12 text-center text-sm text-danger">{message}</div>
  );
}
