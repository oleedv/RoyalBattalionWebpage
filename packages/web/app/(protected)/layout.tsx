"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Whitelist", href: "/whitelist" },
  { label: "Members", href: "/members" },
  { label: "Roles", href: "/roles" },
];

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
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
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 flex h-full w-56 flex-col border-r border-border bg-bg-secondary">
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-wide text-accent"
          >
            ROYAL BATTALION
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="mb-1 flex items-center rounded px-3 py-2.5 text-sm text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-border px-4 py-4">
          <div className="truncate text-sm text-text-secondary">
            {session.user?.name || "User"}
          </div>
          <Link
            href="/api/auth/signout"
            className="mt-1 block text-xs text-text-muted transition-colors hover:text-danger"
          >
            Sign out
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="ml-56 flex-1 p-8">{children}</main>
    </div>
  );
}
