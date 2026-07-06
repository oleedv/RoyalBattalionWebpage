"use client";

import { type HTMLAttributes, type ReactNode } from "react";

/**
 * Skeleton loading primitives.
 *
 * Opacity-pulse placeholders that mirror the app's card recipe
 * (`facet-border rounded-sm bg-bg-card`) with `bg-bg-tertiary` bars. Bars use
 * the semantic theme tokens only (never `dark:` variants) so they track the
 * light/dark class on <html> automatically.
 *
 * Usage rule: render skeletons on INITIAL load only. Gate on the data hook's
 * `initialLoading` (or `loading && !data` for ad-hoc pages) so the 20s
 * background auto-refresh keeps stale data on screen instead of re-flashing.
 *
 * The atom self-animates; composed containers do not add `animate-pulse`, so
 * opacity never compounds. Composed pieces expose an accessible loading region
 * (`role="status"` + visually-hidden label); atoms are decorative
 * (`aria-hidden`).
 */

/** Single pulsing placeholder bar. Decorative. Size/shape via className. */
export function Skeleton({
  className = "",
  ...props
}: { className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded bg-bg-tertiary ${className}`}
      {...props}
    />
  );
}

/** Accessible wrapper announcing an in-progress load to screen readers. */
export function SkeletonRegion({
  children,
  label = "Loading…",
  className = "",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** N stacked text lines; the last line is shorter for a natural look. */
export function SkeletonText({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <SkeletonRegion className={`space-y-2 ${className}`} label="Loading content…">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </SkeletonRegion>
  );
}

/** Card shell matching `facet-border rounded-sm bg-bg-card`. Holds skeletons. */
export function SkeletonCard({
  children,
  className = "",
  pad = "p-5",
}: {
  children?: ReactNode;
  className?: string;
  pad?: string;
}) {
  return (
    <div className={`facet-border rounded-sm bg-bg-card ${pad} ${className}`}>
      {children}
    </div>
  );
}

/** A single stat/status card: uppercase label bar, value bar, thin footer bar. */
export function SkeletonStatCard() {
  return (
    <SkeletonCard>
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-3 h-8 w-16" />
      <Skeleton className="h-1 w-full rounded-full" />
    </SkeletonCard>
  );
}

/**
 * Grid of stat cards. Pass a grid className to control columns; defaults to the
 * common two-up layout.
 */
export function SkeletonStatGrid({
  count = 4,
  className = "grid gap-4 sm:grid-cols-2",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <SkeletonRegion className={className} label="Loading stats…">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </SkeletonRegion>
  );
}

/** List of cards, each an optional avatar block + two text bars. */
export function SkeletonList({
  rows = 3,
  avatar = false,
  className = "space-y-3",
}: {
  rows?: number;
  avatar?: boolean;
  className?: string;
}) {
  return (
    <SkeletonRegion className={className} label="Loading…">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonCard key={i}>
          <div className="flex items-center gap-5">
            {avatar && (
              <Skeleton className="hidden h-14 w-14 rounded-sm sm:block" />
            )}
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </SkeletonCard>
      ))}
    </SkeletonRegion>
  );
}

const CELL_WIDTHS = ["w-24", "w-16", "w-32", "w-20", "w-12", "w-28"];

/**
 * `<tr>` skeleton rows for use inside a `<tbody>` (e.g. DataTable). Returns a
 * fragment of rows (no wrapper) so it stays valid table markup; put
 * `aria-busy` on the surrounding table container for a11y.
 */
export function SkeletonTableRows({
  rows = 6,
  columns,
}: {
  rows?: number;
  columns: { key: string; className?: string }[];
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border/50">
          {columns.map((col, c) => (
            <td key={col.key} className={`px-4 py-3 ${col.className || ""}`}>
              <Skeleton
                className={`h-4 ${CELL_WIDTHS[(r + c) % CELL_WIDTHS.length]}`}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
