"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getRoleMembers } from "@/lib/api-client";
import { SearchInput } from "@/components/search-input";
import { Skeleton } from "@/components/skeleton";
import type { RoleMember } from "shared";
import {
  filterRoleMembers,
  groupRoleMembersByLetter,
  memberSortName,
} from "./role-members";

export function RoleMembersPanel({
  apiToken,
  roleId,
  memberCount,
}: {
  apiToken: string;
  roleId: string;
  memberCount: number;
}) {
  const [members, setMembers] = useState<RoleMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setMembers(null);
    setError(null);
    setQuery("");

    getRoleMembers(apiToken, roleId)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.data) {
          setMembers(res.data);
        } else {
          setError(res.error || "Failed to load members");
        }
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load members");
      });

    return () => {
      cancelled = true;
    };
  }, [apiToken, roleId]);

  const filtered = useMemo(() => {
    if (!members) return [];
    return filterRoleMembers(members, query).slice().sort((a, b) =>
      memberSortName(a).localeCompare(memberSortName(b), undefined, {
        sensitivity: "base",
      }),
    );
  }, [members, query]);

  const groups = useMemo(() => groupRoleMembersByLetter(filtered), [filtered]);
  const total = members?.length ?? memberCount;
  const countLabel =
    members && query.trim()
      ? `${filtered.length} of ${total}`
      : `${total} member${total !== 1 ? "s" : ""}`;

  return (
    <div className="px-5 pb-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-xs tabular-nums text-text-muted/70">{countLabel}</span>
        </div>
        {members && members.length > 0 && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Find a member..."
            className="w-full sm:w-64"
          />
        )}
      </div>

      {error && <div className="text-sm text-danger">{error}</div>}

      {!members && !error && (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-sm" />
          ))}
        </div>
      )}

      {members && members.length === 0 && (
        <div className="rounded-sm border border-border/50 bg-bg-tertiary/30 px-4 py-8 text-center text-sm text-text-muted">
          No one has this role
        </div>
      )}

      {members && members.length > 0 && filtered.length === 0 && (
        <div className="rounded-sm border border-border/50 bg-bg-tertiary/30 px-4 py-8 text-center text-sm text-text-muted">
          No members match
        </div>
      )}

      {members && filtered.length > 0 && (
        <div className="max-h-[min(28rem,55vh)] overflow-y-auto rounded-sm border border-border/50">
          {groups
            ? groups.map((group) => (
                <div key={group.letter}>
                  <div
                    aria-label={`Letter ${group.letter}`}
                    className="sticky top-0 z-10 border-b border-border/40 bg-bg-card px-3 py-1 text-[10px] font-semibold tracking-widest text-accent"
                  >
                    {group.letter}
                  </div>
                  {group.members.map((m) => (
                    <MemberRow key={m.id} member={m} />
                  ))}
                </div>
              ))
            : filtered.map((m) => <MemberRow key={m.id} member={m} />)}
        </div>
      )}
    </div>
  );
}

function MemberRow({ member }: { member: RoleMember }) {
  const name = memberSortName(member);
  const showHandle = member.displayName?.trim() && member.displayName.trim() !== member.discordName;

  return (
    <Link
      href={`/users/${member.id}`}
      className="flex items-center gap-3 border-b border-border/30 px-3 py-2 last:border-b-0 transition-colors hover:bg-bg-tertiary/40"
    >
      {member.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.avatarUrl}
          alt=""
          className="h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-[10px] font-semibold text-text-muted">
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`truncate text-sm font-medium ${
              member.disabled ? "text-text-muted line-through" : "text-text-primary"
            }`}
          >
            {name}
          </span>
          {member.disabled && (
            <span className="rounded-sm bg-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-danger">
              Disabled
            </span>
          )}
        </div>
        {showHandle && (
          <div className="truncate text-xs text-text-muted">{member.discordName}</div>
        )}
      </div>
    </Link>
  );
}
