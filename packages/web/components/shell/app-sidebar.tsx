"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

function isActiveHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar({
  permissions,
  footer,
}: {
  permissions: string[];
  footer?: React.ReactNode;
}) {
  const pathname = usePathname();
  const groups = filterNavGroups(permissions);

  return (
    <Sidebar collapsible="icon">
      <BracketShortcut />
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

      {footer && (
        <SidebarFooter className="border-t border-sidebar-border">
          {footer}
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
