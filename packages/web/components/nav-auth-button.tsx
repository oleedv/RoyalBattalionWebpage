"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";

export function NavAuthButton({ className }: { className?: string }) {
  const { status } = useSession();

  if (status === "authenticated") {
    return (
      <Link
        href="/dashboard"
        className={className}
      >
        Dashboard
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className={className}
    >
      Login
    </Link>
  );
}
