"use client";

import Link from "next/link";
import { useEffect } from "react";
import { logClientError } from "@/lib/log-actions";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientError({
      message: error.message,
      name: error.name,
      stack: error.stack,
      digest: error.digest,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg-primary px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-bg-primary)_70%)]" />

      <div className="relative z-10 mx-auto max-w-lg text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-danger/20 bg-danger/5 px-5 py-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-danger/80">
            Error
          </span>
        </div>

        <h1 className="font-display mb-4 text-4xl font-bold tracking-[0.08em] text-text-primary sm:text-5xl">
          SOMETHING WENT WRONG
        </h1>

        <div
          className="mx-auto mb-6 h-px w-32 bg-gradient-to-r from-transparent via-accent/50 to-transparent"
          aria-hidden="true"
        />

        <p className="mb-10 text-text-secondary">
          An unexpected error occurred. Please try again or return to the home
          page.
        </p>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="rounded-sm border border-border bg-bg-tertiary px-8 py-3 text-sm font-semibold tracking-wide text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-sm border border-accent bg-accent px-8 py-3 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
