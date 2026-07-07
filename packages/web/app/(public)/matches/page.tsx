"use client";

import { useState, useEffect } from "react";
import { SkeletonList } from "@/components/skeleton";
import { getPublicMatches } from "@/lib/api-client";
import type { Match } from "shared";
import { PublicPageHeading } from "@/components/public/page-heading";
import { MatchCard } from "./match-card";

const PAGE_SIZE = 20;

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await getPublicMatches(page, PAGE_SIZE);
      if (res.success && res.data) {
        setMatches(res.data.items);
        setTotal(res.data.total);
      }
      setLoading(false);
    }
    load();
  }, [page]);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6">
      <PublicPageHeading
        title="Match History"
        lede="Recent matches played on Royal Battalion servers."
      />

      <section>
        {loading ? (
          <SkeletonList rows={3} avatar />
        ) : matches.length === 0 ? (
          <div className="py-16 text-center text-text-muted">
            No matches recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="font-mono text-xs tabular-nums text-text-muted">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
