"use client";

import { useState, useEffect } from "react";
import { getServerStatus, getAdminTeamCount } from "@/lib/api-client";
import type { ServerStatus } from "@/lib/api-client";
import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/skeleton";
import { PublicPageHeading } from "@/components/public/page-heading";
import { ServerCard } from "./server-card";

const SERVERS = [
  { label: "Main Server", displayName: "Royal Battalion" },
  { label: "Battle Server", displayName: "RB Battle" },
];

export default function ServerPage() {
  const [statuses, setStatuses] = useState<ServerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminCount, setAdminCount] = useState<number | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      const res = await getServerStatus();
      if (res.success && res.data) {
        setStatuses(res.data);
      }
      setLoading(false);
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    getAdminTeamCount().then((res) => {
      if (res.success && res.data) setAdminCount(res.data.count);
    });
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-16 pt-28">
      <PublicPageHeading
        title="Server Status"
        lede="Live information for the Royal Battalion Squad servers."
      />

      <section className="mb-16">
        {loading && statuses.length === 0 ? (
          <SkeletonRegion
            className="grid gap-6 lg:grid-cols-2"
            label="Loading server status…"
          >
            {SERVERS.map((config) => (
              <SkeletonCard key={config.label} pad="p-0">
                <div className="flex items-center justify-between border-b border-border/50 px-6 py-5">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="px-6 py-4">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Skeleton className="h-2.5 w-12" />
                      <Skeleton className="h-7 w-16" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-2.5 w-16" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="col-span-2 space-y-2 sm:col-span-1">
                      <Skeleton className="h-2.5 w-14" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </div>
                  <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
                </div>
              </SkeletonCard>
            ))}
          </SkeletonRegion>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {SERVERS.map((config, i) => (
              <ServerCard
                key={config.label}
                config={config}
                status={statuses[i] || null}
              />
            ))}
          </div>
        )}
        <div className="mt-6 text-center text-sm text-text-muted">
          Search for &quot;Royal Battalion&quot; in the Squad server browser to
          connect.
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-accent/20 to-transparent" />
          <h2 className="font-display text-xl font-semibold tracking-wide text-text-primary">
            Server Details
          </h2>
          <div className="h-px flex-1 bg-gradient-to-l from-accent/20 to-transparent" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Game", value: "Squad" },
            { label: "Max Players", value: "100" },
            { label: "Region", value: "Europe" },
            { label: "Tickrate", value: "64" },
            {
              label: "Admin Team",
              value: adminCount === null ? "--" : `${adminCount} on duty`,
            },
            { label: "Reserved Slots", value: "Whitelist" },
          ].map((item) => (
            <div
              key={item.label}
              className="facet-border rounded-sm bg-bg-card p-5 transition-colors hover:bg-bg-card-hover"
            >
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                {item.label}
              </div>
              <div className="font-display text-lg font-semibold tracking-wide text-text-primary">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
