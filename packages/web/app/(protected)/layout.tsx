"use client";

import { useSession } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { Permission, UserWithRoles } from "shared";
import { syncAuth } from "@/lib/api-client";
import { PermissionProvider } from "@/lib/permission-context";

interface NavItem {
  label: string;
  href: string;
  requiredPermissions?: Permission[];
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  {
    label: "Whitelist",
    href: "/whitelist",
    requiredPermissions: ["view:whitelist", "manage:whitelist"],
  },
  {
    label: "Members",
    href: "/members",
    requiredPermissions: ["view:members", "manage:members"],
  },
  { label: "Tickets", href: "/tickets", requiredPermissions: ["admin"] },
  {
    label: "Roles",
    href: "/roles",
    requiredPermissions: ["manage:roles"],
  },
];

function canSeeNavItem(item: NavItem, permissions: Permission[]): boolean {
  if (!item.requiredPermissions) return true;
  if (permissions.includes("admin")) return true;
  return item.requiredPermissions.some((p) => permissions.includes(p));
}

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [apiToken, setApiToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserWithRoles | null>(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    async function init() {
      if (!session?.accessToken) return;
      try {
        const res = await syncAuth(session.accessToken);
        if (res.success && res.data) {
          setApiToken(res.data.token);
          setPermissions(res.data.permissions);
          setUser(res.data.user);
        }
      } catch {
        // sync failed silently
      } finally {
        setSynced(true);
      }
    }
    init();
  }, [session]);

  if (status === "loading" || !synced) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <PermissionProvider permissions={permissions} apiToken={apiToken} user={user}>
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="fixed left-0 top-0 flex h-full w-56 flex-col border-r border-border bg-bg-secondary">
          <div className="flex h-16 items-center gap-3 border-b border-border px-5">
            <Image
              src="/img/rb_newlion2024_4_RS.png"
              alt="Royal Battalion"
              width={28}
              height={28}
              className="rounded-sm"
            />
            <Link
              href="/"
              className="font-display text-base font-semibold tracking-[0.12em] text-accent"
            >
              ROYAL BATTALION
            </Link>
          </div>

          <nav className="flex-1 px-3 py-4">
            {NAV_ITEMS.filter((item) => canSeeNavItem(item, permissions)).map(
              (item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`mb-1 flex items-center rounded-sm px-3 py-2.5 text-sm tracking-wide transition-colors ${
                      isActive
                        ? "bg-accent/10 text-accent border border-accent/20"
                        : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              }
            )}
          </nav>

          <div className="border-t border-border px-4 py-4">
            <div className="truncate text-sm text-text-secondary">
              {session.user?.name || "User"}
            </div>
            <Link
              href="/signout"
              className="mt-1 block text-xs text-text-muted transition-colors hover:text-danger"
            >
              Sign out
            </Link>
          </div>
        </aside>

        {/* Main content */}
        <main className="ml-56 flex-1 p-8">{children}</main>
      </div>
    </PermissionProvider>
  );
}
