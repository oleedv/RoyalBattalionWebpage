import type { Permission } from "shared";
import { PERMISSIONS } from "shared";

// ---------------------------------------------------------------------------
// Permission group metadata
// ---------------------------------------------------------------------------

export type PermissionKey = Exclude<Permission, "developer">;

export interface PermEntry {
  perm: PermissionKey;
  label: string;
  description: string;
}

export interface PermSubGroup {
  label: string;
  description: string;
  entries: PermEntry[];
}

export interface PermGroup {
  id: string;
  label: string;
  description: string;
  entries: PermEntry[];
  subGroups?: PermSubGroup[];
}

export const PERMISSION_GROUPS: PermGroup[] = [
  {
    id: "whitelist",
    label: "Whitelist",
    description: "Server whitelist and SFTP sync",
    entries: [
      {
        perm: "view:whitelist",
        label: "View Whitelist",
        description: "Read whitelist entries and pending requests",
      },
      {
        perm: "manage:whitelist",
        label: "Manage Whitelist",
        description: "Add, edit, and remove whitelist entries",
      },
      {
        perm: "manage:whitelist-sync",
        label: "Manage Whitelist Sync",
        description: "Toggle SFTP sync per server",
      },
    ],
  },
  {
    id: "members",
    label: "Members",
    description: "Registered Discord member accounts",
    entries: [
      {
        perm: "view:members",
        label: "View Members",
        description: "Browse member profiles and linked game IDs",
      },
      {
        perm: "manage:members",
        label: "Manage Members",
        description: "Edit Steam/EOS IDs and sync roles",
      },
    ],
  },
  {
    id: "tickets",
    label: "Tickets",
    description: "Support ticket system",
    entries: [
      {
        perm: "view:tickets",
        label: "View All Tickets",
        description: "View tickets across all tiers",
      },
      {
        perm: "manage:tickets",
        label: "Manage Tickets",
        description: "Close tickets and take administrative actions",
      },
    ],
    subGroups: [
      {
        label: "Ticket Tier Access",
        description: "Grants read access to a specific tier only",
        entries: [
          {
            perm: "view:tickets:normal",
            label: "Normal Tier",
            description: "Standard player-submitted tickets",
          },
          {
            perm: "view:tickets:community_officer",
            label: "Community Officer Tier",
            description: "Tickets escalated to Community Officers",
          },
          {
            perm: "view:tickets:admin_officer",
            label: "Admin Officer Tier",
            description: "Sensitive admin-only tickets",
          },
          {
            perm: "view:tickets:comp_team",
            label: "Comp Team Tier",
            description: "Competitive team related tickets",
          },
          {
            perm: "view:tickets:whitelist",
            label: "Whitelist Tier",
            description: "Whitelist request tickets",
          },
        ],
      },
    ],
  },
  {
    id: "roles",
    label: "Roles",
    description: "Discord role and permission assignment",
    entries: [
      {
        perm: "manage:roles",
        label: "Manage Roles",
        description: "Register roles and assign permissions",
      },
    ],
  },
  {
    id: "matches",
    label: "Matches",
    description: "Match history and scoreboard data",
    entries: [
      {
        perm: "manage:matches",
        label: "Manage Matches",
        description: "Review and edit match records",
      },
    ],
  },
  {
    id: "squadjs",
    label: "SquadJS",
    description: "Game server plugin configuration",
    entries: [
      {
        perm: "view:squadjs",
        label: "View SquadJS Config",
        description: "Read plugin configuration",
      },
      {
        perm: "manage:squadjs",
        label: "Manage SquadJS Config",
        description: "Edit and apply plugin settings",
      },
    ],
  },
  {
    id: "live-server",
    label: "Live Server",
    description: "Real-time server monitor and RCON",
    entries: [
      {
        perm: "view:live-server",
        label: "View Live Server",
        description: "Watch live player list, chat, and teams",
      },
      {
        perm: "manage:live-server",
        label: "Manage Live Server",
        description: "Issue RCON commands (kicks, map changes, etc.)",
      },
      {
        perm: "manage:clan-move",
        label: "Clan Move",
        description: "Move or queue entire clans between teams",
      },
      {
        perm: "manage:randomize",
        label: "Randomize Teams",
        description: "Queue or run team randomization",
      },
      {
        perm: "manage:rcon-console",
        label: "RCON Console",
        description: "Run arbitrary RCON commands via the live console",
      },
    ],
  },
  {
    id: "discord-bot",
    label: "Discord Bot",
    description: "Bot configuration and automated systems",
    entries: [
      {
        perm: "view:discord-bot",
        label: "View Discord Bot",
        description: "View bot status, prospects, and logs",
      },
      {
        perm: "manage:discord-bot",
        label: "Manage Discord Bot",
        description: "Configure messages, seeding, and tickets",
      },
    ],
  },
  {
    id: "audit-logs",
    label: "Audit Logs",
    description: "Activity and change history",
    entries: [
      {
        perm: "view:audit-logs",
        label: "View Audit Logs",
        description: "Browse audit trail of all system actions",
      },
    ],
  },
  {
    id: "seeding-tracker",
    label: "Seeding Tracker",
    description: "Seeding session analytics and leaderboards",
    entries: [
      {
        perm: "view:seeding-tracker",
        label: "View Seeding Tracker",
        description: "Browse seeding leaderboard, player stats, and session history",
      },
    ],
  },
];

// Compile-time coverage: ensure every assignable permission is in a group
const _allGroupedPerms = PERMISSION_GROUPS.flatMap((g) => [
  ...g.entries.map((e) => e.perm),
  ...(g.subGroups?.flatMap((sg) => sg.entries.map((e) => e.perm)) ?? []),
]);
if (typeof window === "undefined") {
  const assignable = PERMISSIONS.filter((p) => p !== "developer");
  const missing = assignable.filter(
    (p) => !_allGroupedPerms.includes(p as PermissionKey)
  );
  if (missing.length > 0) {
    console.warn("[roles] Permissions missing from PERMISSION_GROUPS:", missing);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getAllGroupPerms(group: PermGroup): PermissionKey[] {
  return [
    ...group.entries.map((e) => e.perm),
    ...(group.subGroups?.flatMap((sg) => sg.entries.map((e) => e.perm)) ?? []),
  ];
}

export function getGroupActiveCount(
  group: PermGroup,
  effectivePerms: Permission[],
): { active: number; total: number } {
  const all = getAllGroupPerms(group);
  return {
    active: all.filter((p) => effectivePerms.includes(p)).length,
    total: all.length,
  };
}

export function togglePerm(current: Permission[], perm: Permission): Permission[] {
  return current.includes(perm)
    ? current.filter((p) => p !== perm)
    : [...current, perm];
}

export function setGroupPerms(
  current: Permission[],
  group: PermGroup,
  select: boolean,
): Permission[] {
  const groupPerms = getAllGroupPerms(group);
  return select
    ? [...new Set([...current, ...groupPerms])]
    : (current.filter((p) => !groupPerms.includes(p as PermissionKey)) as Permission[]);
}

export function hasPendingChanges(
  pending: Permission[] | undefined,
  rolePerms: Permission[],
): boolean {
  if (!pending) return false;
  if (pending.length !== rolePerms.length) return true;
  return !pending.every((p) => rolePerms.includes(p));
}
