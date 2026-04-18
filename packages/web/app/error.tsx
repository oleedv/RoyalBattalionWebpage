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
    <div className="noise-overlay relative flex min-h-screen flex-col items-center justify-center px-6">
      {/* Background grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(200,168,78,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(200,168,78,0.5) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      {/* Radial vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#08080a_65%)]" />

      <div className="relative z-10 mx-auto max-w-lg text-center">
        {/* Label */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-danger/20 bg-danger/5 px-5 py-1.5">
          <span className="text-xs font-medium tracking-[0.2em] text-danger/80 uppercase">
            Error
          </span>
        </div>

        <h1 className="font-display mb-4 text-4xl font-bold tracking-[0.08em] text-text-primary sm:text-5xl">
          SOMETHING WENT WRONG
        </h1>

        {/* Decorative line */}
        <div className="mx-auto mb-6 w-32">
          <div className="geo-line" />
          <div className="mx-auto mt-2 flex items-center justify-center gap-1">
            <div className="h-1 w-1 rotate-45 bg-accent/40" />
            <div className="h-1.5 w-1.5 rotate-45 bg-accent/60" />
            <div className="h-1 w-1 rotate-45 bg-accent/40" />
          </div>
        </div>

        <p className="mb-10 text-text-secondary">
          An unexpected error occurred. Please try again or return to the home page.
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
            className="glow-button inline-flex items-center gap-2 rounded-sm border border-accent bg-accent px-8 py-3 text-sm font-semibold tracking-wide text-bg-primary transition-all hover:bg-accent-bright hover:shadow-[0_0_30px_rgba(200,168,78,0.3)]"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
