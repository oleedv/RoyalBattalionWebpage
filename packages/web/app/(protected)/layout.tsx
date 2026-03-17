"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
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
    requiredPermissions: ["view:tickets", "manage:tickets", "view:tickets:normal", "view:tickets:community_officer", "view:tickets:admin_officer", "view:tickets:comp_team", "view:tickets:whitelist"],
  },
  {
    label: "Discord Bot",
    href: "/discord-bot",
    requiredPermissions: ["view:discord-bot", "manage:discord-bot"],
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
  {
    label: "Audit Logs",
    href: "/audit-logs",
    requiredPermissions: ["view:audit-logs"],
  },
  {
    label: "Observability",
    href: "/observability",
    requiredPermissions: ["view:live-server", "manage:live-server"],
  },
  {
    label: "Lobby API",
    href: "/lobby-monitor",
    requiredPermissions: ["developer"],
  },
];

function canSeeNavItem(item: NavItem, permissions: Permission[]): boolean {
  if (!item.requiredPermissions) return true;
  if (permissions.includes("developer")) return true;
  return item.requiredPermissions.some((p) => permissions.includes(p));
}

function formatPageName(path: string): string {
  const name = path.replace(/^\//, "") || "dashboard";
  return name.split(/[-/]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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
  const [onlineUsers, setOnlineUsers] = useState<{ userId: string; userName: string; avatarUrl: string | null; currentPage: string }[]>([]);
  const presenceWsRef = useRef<WebSocket | null>(null);
  const apiTokenRef = useRef(apiToken);
  apiTokenRef.current = apiToken;
  const hasConnectedPresence = useRef(false);

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
            // Count candidates across all servers (no server filter)
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
        }
      } catch {
        // Silently fail - the next navigation or tab focus will retry
      }
    }, 2 * 60 * 1000); // every 2 minutes
    return () => clearInterval(interval);
  }, [apiToken, session?.accessToken, session?.error]);

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Presence WebSocket -- connect once when first token arrives, read token from ref on reconnect
  useEffect(() => {
    if (!apiToken || hasConnectedPresence.current) return;
    hasConnectedPresence.current = true;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (cancelled) return;
      const token = apiTokenRef.current;
      if (!token) return;
      const wsBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/^http/, "ws");
      const ws = new WebSocket(`${wsBase}/presence/ws?page=${encodeURIComponent(pathname)}`, [`auth-${token}`]);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "presence") {
            setOnlineUsers(msg.users);
          }
        } catch {}
      };
      ws.onclose = () => {
        presenceWsRef.current = null;
        if (!cancelled) reconnectTimer = setTimeout(connect, 5000);
      };
      presenceWsRef.current = ws;
    }

    connect();
    return () => {
      cancelled = true;
      hasConnectedPresence.current = false;
      clearTimeout(reconnectTimer);
      const ws = presenceWsRef.current;
      if (ws) {
        ws.onclose = null;
        ws.close();
        presenceWsRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiToken]);

  // Send page changes to presence WS
  useEffect(() => {
    const ws = presenceWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ page: pathname }));
    }
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

      {onlineUsers.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Online ({onlineUsers.length})
          </div>
          <div className="flex items-center">
            {onlineUsers.slice(0, 15).map((u, i) => (
              <div
                key={u.userId}
                className="group relative"
                style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 15 - i }}
              >
                {u.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={u.avatarUrl}
                    alt={u.userName}
                    className="h-6 w-6 rounded-full object-cover ring-2 ring-bg-secondary"
                  />
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent ring-2 ring-bg-secondary">
                    {u.userName.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="absolute bottom-0 right-0 h-1.5 w-1.5 rounded-full bg-green-500 ring-1 ring-bg-secondary" />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 rounded bg-bg-primary px-2 py-1 text-xs whitespace-nowrap opacity-0 shadow-lg ring-1 ring-border transition-opacity group-hover:opacity-100">
                  <div className="font-medium text-text-primary">{u.userName}</div>
                  <div className="text-text-muted">{formatPageName(u.currentPage)}</div>
                </div>
              </div>
            ))}
            {onlineUsers.length > 15 && (
              <div
                className="flex h-6 w-6 items-center justify-center rounded-full bg-bg-tertiary text-[9px] font-bold text-text-muted ring-2 ring-bg-secondary"
                style={{ marginLeft: -6, zIndex: 0 }}
              >
                +{onlineUsers.length - 15}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="border-t border-border px-4 py-4">
        <div className="truncate text-sm text-text-secondary">
          {session.user?.name || "User"}
        </div>
        <div className="mt-1 flex items-center gap-3">
          <Link
            href="/settings"
            className="flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-accent"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </Link>
          <Link
            href="/signout"
            className="flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-danger"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3-3l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign out
          </Link>
        </div>
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
