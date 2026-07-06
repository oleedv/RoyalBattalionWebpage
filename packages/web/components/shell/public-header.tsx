"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";

const LINKS = [
  { label: "Servers", href: "/server" },
  { label: "Matches", href: "/matches" },
];

function AuthButton() {
  const { status } = useSession();
  const authed = status === "authenticated";
  return (
    <Link
      href={authed ? "/dashboard" : "/login"}
      className="rounded-sm border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent transition-colors hover:border-accent/70 hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {authed ? "Dashboard" : "Login"}
    </Link>
  );
}

export function PublicHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-bg-primary/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/img/rb_newlion2024_4_RS.png"
            alt="Royal Battalion"
            width={28}
            height={28}
          />
          <span className="font-display text-sm font-bold tracking-[0.18em] text-text-primary">
            ROYAL <span className="text-accent">BATTALION</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hidden text-xs uppercase tracking-[0.16em] text-text-secondary transition-colors hover:text-accent sm:block"
            >
              {l.label}
            </Link>
          ))}
          <AuthButton />
        </nav>
      </div>
    </header>
  );
}
