import {
  LayoutDashboard,
  ShieldCheck,
  Radio,
  Ticket,
  UserPlus,
  Sprout,
  Gift,
  Swords,
  Users,
  MessageSquare,
  Bot,
  Mic,
  Cog,
  KeyRound,
  ScrollText,
  FileCode2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Any-match grants access; "developer" bypasses all. Undefined = all authed users. */
  requiredPermissions?: string[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const DASHBOARD_ITEM: NavItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: LayoutDashboard,
};

// Reconciled against the 2026-07-05 spec §3 and app/(protected)/layout.tsx perms.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      {
        label: "Whitelist",
        href: "/whitelist",
        icon: ShieldCheck,
        requiredPermissions: ["view:whitelist", "manage:whitelist"],
      },
      {
        label: "Live Server",
        href: "/live-server",
        icon: Radio,
        // manage:rcon-console is standalone-sufficient (spec §5 gating alignment):
        // the API admits such users to the console WS, so they need a nav path.
        requiredPermissions: [
          "view:live-server",
          "manage:live-server",
          "manage:rcon-console",
        ],
      },
      {
        label: "Tickets",
        href: "/tickets",
        icon: Ticket,
        requiredPermissions: [
          "view:tickets",
          "manage:tickets",
          "view:tickets:normal",
          "view:tickets:community_officer",
          "view:tickets:admin_officer",
          "view:tickets:comp_team",
          "view:tickets:whitelist",
        ],
      },
      {
        label: "Prospects",
        href: "/prospects",
        icon: UserPlus,
        requiredPermissions: [
          "view:prospects",
          "view:prospect-settings",
          "manage:prospects",
        ],
      },
      {
        label: "Seeding",
        href: "/seeding",
        icon: Sprout,
        requiredPermissions: ["view:seeding-tracker", "manage:discord-bot"],
      },
      {
        label: "Giveaway",
        href: "/giveaway",
        icon: Gift,
        requiredPermissions: ["view:giveaway", "manage:giveaway", "manage:giveaway-tickets"],
      },
      {
        label: "Match Manager",
        href: "/match-manager",
        icon: Swords,
        requiredPermissions: ["manage:matches"],
      },
    ],
  },
  {
    label: "Community",
    items: [
      {
        label: "Members",
        href: "/members",
        icon: Users,
        requiredPermissions: ["view:members", "manage:members"],
      },
      {
        label: "Discord Users",
        href: "/discord-users",
        icon: MessageSquare,
        requiredPermissions: ["view:members", "manage:members"],
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        label: "Discord Bot",
        href: "/discord-bot",
        icon: Bot,
        requiredPermissions: ["view:discord-bot", "manage:discord-bot"],
      },
      {
        label: "Temp Voice",
        href: "/temp-voice",
        icon: Mic,
        requiredPermissions: ["view:discord-bot", "manage:discord-bot"],
      },
      {
        label: "SquadJS Config",
        href: "/squadjs-config",
        icon: Cog,
        requiredPermissions: ["view:squadjs", "manage:squadjs"],
      },
      {
        label: "Roles",
        href: "/roles",
        icon: KeyRound,
        requiredPermissions: ["manage:roles"],
      },
      {
        label: "Audit Logs",
        href: "/audit-logs",
        icon: ScrollText,
        requiredPermissions: ["view:audit-logs"],
      },
      {
        label: "API Docs",
        href: "/api-docs",
        icon: FileCode2,
        requiredPermissions: ["view:api-docs"],
      },
    ],
  },
];

export function filterNavGroups(permissions: string[]): NavGroup[] {
  const isDev = permissions.includes("developer");
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        !item.requiredPermissions ||
        isDev ||
        item.requiredPermissions.some((p) => permissions.includes(p)),
    ),
  })).filter((group) => group.items.length > 0);
}
