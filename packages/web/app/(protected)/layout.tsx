"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { Permission, UserWithRoles } from "shared";
import { syncAuth, getWhitelistCandidates } from "@/lib/api-client";
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
  {
    label: "Tickets",
    href: "/tickets",
    requiredPermissions: ["view:tickets", "manage:tickets"],
  },
  {
    label: "Matches",
    href: "/match-manager",
    requiredPermissions: ["manage:matches"],
  },
  {
    label: "Roles",
    href: "/roles",
    requiredPermissions: ["manage:roles"],
  },
  {
    label: "SquadJS Config",
    href: "/squadjs-config",
    requiredPermissions: ["view:squadjs", "manage:squadjs"],
  },
  {
    label: "Live Server",
    href: "/live-server",
    requiredPermissions: ["view:live-server", "manage:live-server"],
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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [candidateCount, setCandidateCount] = useState(0);

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
          // Fetch whitelist candidate count for nav badge
          const perms = res.data.permissions;
          if (perms.includes("admin") || perms.includes("manage:whitelist")) {
            getWhitelistCandidates(res.data.token).then((r) => {
              if (r.success && r.data) setCandidateCount(r.data.length);
            }).catch(() => {});
          }
        } else if (!res.success) {
          setSyncError(res.error === "NOT_IN_GUILD" ? "NOT_IN_GUILD" : res.error || "Failed to sync");
        }
      } catch {
        setSyncError("Failed to sync");
      } finally {
        setSynced(true);
      }
    }
    init();
  }, [session, retryCount]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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

  if (syncError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <div className="w-full max-w-md rounded-sm border border-border bg-bg-card p-8 text-center">
          {syncError === "NOT_IN_GUILD" ? (
            <>
              <h1 className="font-display mb-3 text-xl font-bold tracking-wide text-text-primary">
                Not a Member
              </h1>
              <p className="mb-6 text-sm text-text-secondary">
                You need to join the Royal Battalion Discord server to access this page.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href="https://discord.gg/royalbattalion"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted"
                >
                  Join Discord Server
                </a>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-sm border border-border px-6 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                >
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-display mb-3 text-xl font-bold tracking-wide text-text-primary">
                Sync Failed
              </h1>
              <p className="mb-6 text-sm text-text-secondary">
                {syncError}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    setSyncError(null);
                    setSynced(false);
                    setRetryCount((c) => c + 1);
                  }}
                  className="rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted"
                >
                  Retry
                </button>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-sm border border-border px-6 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
                >
                  Sign Out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const navContent = (
    <>
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
                className={`mb-1 flex items-center justify-between rounded-sm px-3 py-2.5 text-sm tracking-wide transition-colors ${
                  isActive
                    ? "bg-accent/10 text-accent border border-accent/20"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                }`}
              >
                {item.label}
                {item.href === "/whitelist" && candidateCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {candidateCount}
                  </span>
                )}
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
    </>
  );

  return (
    <PermissionProvider permissions={permissions} apiToken={apiToken} user={user}>
      <div className="flex min-h-screen">
        {/* Mobile header */}
        <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-bg-secondary px-4 md:hidden">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/img/rb_newlion2024_4_RS.png"
              alt="Royal Battalion"
              width={24}
              height={24}
              className="rounded-sm"
            />
            <span className="font-display text-sm font-semibold tracking-[0.12em] text-accent">
              ROYAL BATTALION
            </span>
          </Link>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10zm0 5.25a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        </header>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Mobile sidebar drawer */}
        <aside
          className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col bg-bg-secondary transition-transform duration-200 md:hidden ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {navContent}
        </aside>

        {/* Desktop sidebar */}
        <aside className="fixed left-0 top-0 hidden h-full w-56 flex-col border-r border-border bg-bg-secondary md:flex">
          {navContent}
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 pt-14 md:ml-56 md:pt-0">
          <div className="p-4 sm:p-6 md:p-8">{children}</div>
        </main>
      </div>
    </PermissionProvider>
  );
}
