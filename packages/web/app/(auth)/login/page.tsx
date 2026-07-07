"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { EmberHero } from "@/components/public/ember-hero";
import { DiscordIcon } from "@/components/public/discord-icon";
import { Skeleton } from "@/components/skeleton";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-bg-primary"
        role="status"
        aria-label="Checking session"
      >
        <div className="w-full max-w-sm space-y-3 px-6">
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return null;
  }

  function handleSignIn() {
    setSigningIn(true);
    signIn("discord", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg-primary px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-bg-primary)_75%)]" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <EmberHero size={180} motes={28} />
        </div>
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-display text-2xl font-bold tracking-[0.12em] text-text-primary"
          >
            ROYAL <span className="text-accent">BATTALION</span>
          </Link>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in to access your clan dashboard
          </p>
        </div>

        <div className="facet-border rounded-sm bg-bg-card p-8">
          <h1 className="font-display mb-6 text-center text-xl font-semibold tracking-wide">
            Sign In
          </h1>

          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="flex w-full items-center justify-center gap-3 rounded-sm bg-(--color-discord) px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-70"
          >
            <DiscordIcon className="h-5 w-5" />
            {signingIn ? "Redirecting to Discord…" : "Continue with Discord"}
          </button>

          <p className="mt-6 text-center text-xs text-text-muted">
            By signing in, you agree to link your Discord account with Royal
            Battalion.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
