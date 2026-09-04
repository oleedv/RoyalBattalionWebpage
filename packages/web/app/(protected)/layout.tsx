"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import type { Permission, UserWithRoles } from "shared";
import {
  syncAuth,
  getWhitelistCandidateSummary,
  WHITELIST_CANDIDATES_CHANGED,
} from "@/lib/api-client";
import { PermissionProvider } from "@/lib/permission-context";
import { usePresence } from "@/hooks/use-presence";
import { AppSidebar } from "@/components/shell/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/skeleton";

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
  const [candidateCount, setCandidateCount] = useState(0);
  const onlineUsers = usePresence(apiToken, pathname);

  // Read the shadcn sidebar cookie once so collapse survives reloads.
  const [sidebarDefaultOpen] = useState(
    () =>
      typeof document === "undefined" ||
      !document.cookie.includes("sidebar_state=false"),
  );

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
    // If the Discord refresh token has expired, force a fresh login
    if (session?.error === "RefreshTokenError") {
      signIn("discord");
    }
  }, [status, session?.error, router]);

  useEffect(() => {
    async function init() {
      if (!session?.accessToken || session?.error) return;
      try {
        const res = await syncAuth(session.accessToken);
        if (res.success && res.data) {
          setApiToken(res.data.token);
          setPermissions(res.data.permissions);
          setUser(res.data.user);
          // Fetch whitelist candidate count for nav badge
          const perms = res.data.permissions;
          if (perms.includes("developer") || perms.includes("manage:whitelist")) {
            getWhitelistCandidateSummary(res.data.token).then((r) => {
              if (r.success && r.data) setCandidateCount(r.data.totalPending);
            }).catch(() => {});
          }
        } else if (!res.success) {
          if (res.error === "ACCOUNT_DISABLED" || res.error === "NOT_IN_GUILD") {
            setSyncError(res.error);
          } else {
            setSyncError(res.error || "Failed to sync");
          }
        }
      } catch {
        setSyncError("Failed to sync");
      } finally {
        setSynced(true);
      }
    }
    init();
  }, [session, retryCount]);

  useEffect(() => {
    if (!apiToken || (!permissions.includes("developer") && !permissions.includes("manage:whitelist"))) {
      return;
    }
    const token = apiToken;
    function refreshBadge() {
      getWhitelistCandidateSummary(token).then((r) => {
        if (r.success && r.data) setCandidateCount(r.data.totalPending);
      }).catch(() => {});
    }
    window.addEventListener(WHITELIST_CANDIDATES_CHANGED, refreshBadge);
    const interval = setInterval(refreshBadge, 60_000);
    return () => {
      window.removeEventListener(WHITELIST_CANDIDATES_CHANGED, refreshBadge);
      clearInterval(interval);
    };
  }, [apiToken, permissions]);

  // Periodically re-sync to keep the API token fresh (expires after 4h)
  useEffect(() => {
    if (!apiToken || !session?.accessToken || session?.error) return;
    const interval = setInterval(async () => {
      try {
        const res = await syncAuth(session.accessToken!);
        if (res.success && res.data) {
          setApiToken(res.data.token);
          setPermissions(res.data.permissions);
          setUser(res.data.user);
        } else if (!res.success && res.error === "ACCOUNT_DISABLED") {
          setSyncError("ACCOUNT_DISABLED");
        }
      } catch {
        // Silently fail - the next navigation or tab focus will retry
      }
    }, 2 * 60 * 1000); // every 2 minutes
    return () => clearInterval(interval);
  }, [apiToken, session?.accessToken, session?.error]);

  if (status === "loading" || !synced) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-5 bg-bg-primary"
        role="status"
        aria-label="Syncing session"
      >
        <Image
          src="/img/rb_newlion2024_4_RS.png"
          alt=""
          width={56}
          height={56}
          className="ember-lion-glow opacity-80"
        />
        <div className="w-56 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (syncError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary px-4">
        <div className="facet-border w-full max-w-md rounded-sm bg-bg-card p-8 text-center">
          {syncError === "ACCOUNT_DISABLED" ? (
            <>
              <h1 className="font-display mb-3 text-xl font-bold tracking-wide text-danger">
                Account Disabled
              </h1>
              <p className="mb-6 text-sm text-text-secondary">
                Your account has been disabled by an administrator. If you believe this is an error, please contact a developer.
              </p>
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="rounded-sm border border-border px-6 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
              >
                Sign Out
              </button>
            </>
          ) : syncError === "NOT_IN_GUILD" ? (
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
                  className="rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
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
                  className="rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
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

  return (
    <PermissionProvider permissions={permissions} apiToken={apiToken} user={user}>
      <SidebarProvider defaultOpen={sidebarDefaultOpen}>
        <AppSidebar
          permissions={permissions}
          badges={{ "/whitelist": candidateCount }}
          onlineUsers={onlineUsers}
          userName={session.user?.name || "User"}
        />
        <SidebarInset className="min-w-0">
          {/* Mobile header: 56px bar with hamburger trigger */}
          <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-bg-secondary px-4 md:hidden">
            <SidebarTrigger aria-label="Toggle menu" />
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
          </header>
          <div className="p-4 sm:p-6 md:p-8">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PermissionProvider>
  );
}
