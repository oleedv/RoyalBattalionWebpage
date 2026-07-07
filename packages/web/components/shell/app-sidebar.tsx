"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { DASHBOARD_ITEM, filterNavGroups } from "@/components/shell/nav-config";
import { NavBadge } from "@/components/nav-badge";
import { AvatarStack } from "@/components/avatar-stack";
import { RosterDialog } from "@/components/roster-dialog";
import { formatPageName, type PresenceUser } from "@/hooks/use-presence";

const ACTIVE_CLASS =
  "data-active:bg-accent/10 data-active:text-accent-bright data-active:shadow-[inset_2px_0_0_var(--color-accent)]";

/** Adds `[` as a sidebar-collapse shortcut, alongside the built-in Cmd/Ctrl+B. */
function BracketShortcut() {
  const { toggleSidebar } = useSidebar();
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "[" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]"))
        return;
      e.preventDefault();
      toggleSidebar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
  return null;
}

/** Closes the mobile sheet whenever the route changes (parity with the old
 * drawer's close-on-navigation effect). */
function MobileAutoClose() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  React.useEffect(() => {
    if (isMobile) setOpenMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  return null;
}

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function PresenceBlock({ onlineUsers }: { onlineUsers: PresenceUser[] }) {
  const [open, setOpen] = React.useState(false);
  if (onlineUsers.length === 0) return null;

  const stackUsers = onlineUsers.map((u) => ({
    id: u.userId,
    name: u.displayName || u.userName,
    secondary: u.displayName ? `@${u.userName}` : undefined,
    meta: formatPageName(u.currentPage),
    avatarUrl: u.avatarUrl,
  }));

  return (
    <div className="border-t border-sidebar-border px-2 py-2">
      {/* Expanded: label + avatar stack */}
      <div className="group-data-[collapsible=icon]:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mb-1.5 block px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted transition-colors hover:text-accent"
        >
          Online ({onlineUsers.length})
        </button>
        <div className="px-2">
          <AvatarStack
            users={stackUsers}
            onClick={() => setOpen(true)}
            label={`View ${onlineUsers.length} online ${onlineUsers.length === 1 ? "user" : "users"}`}
          />
        </div>
      </div>
      {/* Collapsed rail: compact count button */}
      <div className="hidden group-data-[collapsible=icon]:block">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip={`${onlineUsers.length} online`}
              onClick={() => setOpen(true)}
            >
              <Users />
              <span>{onlineUsers.length} online</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </div>
      <RosterDialog
        open={open}
        onOpenChange={setOpen}
        title="Online"
        rows={stackUsers.map((u) => ({
          id: u.id,
          primary: u.name,
          secondary: u.secondary,
          meta: u.meta,
          avatarUrl: u.avatarUrl,
        }))}
      />
    </div>
  );
}

export function AppSidebar({
  permissions,
  badges = {},
  onlineUsers = [],
  userName,
}: {
  permissions: string[];
  badges?: Record<string, number>;
  onlineUsers?: PresenceUser[];
  userName: string;
}) {
  const pathname = usePathname();
  const groups = filterNavGroups(permissions);

  return (
    <Sidebar collapsible="icon">
      <BracketShortcut />
      <MobileAutoClose />
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 px-1 py-1">
          <Image
            src="/img/rb_newlion2024_4_RS.png"
            alt="Royal Battalion"
            width={24}
            height={24}
            className="shrink-0"
          />
          <span className="truncate font-display text-[11px] font-bold tracking-[0.16em] text-accent group-data-[collapsible=icon]:hidden">
            ROYAL BATTALION
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={isActiveHref(pathname, DASHBOARD_ITEM.href)}
                  tooltip={DASHBOARD_ITEM.label}
                  className={ACTIVE_CLASS}
                  render={
                    <Link href={DASHBOARD_ITEM.href}>
                      <DASHBOARD_ITEM.icon />
                      <span>{DASHBOARD_ITEM.label}</span>
                    </Link>
                  }
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[9px] tracking-[0.26em]">
              {group.label.toUpperCase()}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActiveHref(pathname, item.href)}
                      tooltip={item.label}
                      className={ACTIVE_CLASS}
                      render={
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                          <NavBadge count={badges[item.href] ?? 0} />
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-0">
        <PresenceBlock onlineUsers={onlineUsers} />
        <div className="px-2 pb-2 pt-1">
          <div className="truncate px-2 pb-1 text-sm text-text-secondary group-data-[collapsible=icon]:hidden">
            {userName}
          </div>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Settings"
                render={
                  <Link href="/settings">
                    <Settings />
                    <span>Settings</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Sign out"
                className="hover:text-danger"
                render={
                  <Link href="/signout">
                    <LogOut />
                    <span>Sign out</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
