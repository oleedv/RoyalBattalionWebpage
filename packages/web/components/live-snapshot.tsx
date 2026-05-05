"use client";

import { useEffect, useState } from "react";
import {
  getServerStatus,
  getAdminTeamCount,
  type ServerStatus,
} from "@/lib/api-client";

export function LiveSnapshot() {
  const [servers, setServers] = useState<ServerStatus[] | null>(null);
  const [admins, setAdmins] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [s, a] = await Promise.all([
        getServerStatus(),
        getAdminTeamCount(),
      ]);
      if (cancelled) return;
      if (s.success && s.data) setServers(s.data);
      if (a.success && a.data) setAdmins(a.data.count);
    }
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const playersOnline = servers
    ? servers.reduce((sum, s) => sum + (s.players || 0), 0)
    : null;
  const serversOnline = servers
    ? servers.filter((s) => s.status === "online").length
    : null;
  const totalServers = servers?.length ?? 2;

  const tiles: { label: string; value: string | number | null }[] = [
    { label: "Players Online", value: playersOnline },
    { label: "Admins on Duty", value: admins },
    {
      label: "Servers Live",
      value:
        serversOnline === null ? null : `${serversOnline} / ${totalServers}`,
    },
  ];

  return (
    <div className="grid gap-5 sm:grid-cols-3">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="facet-border rounded-sm bg-bg-card px-6 py-8 text-center transition-colors hover:bg-bg-card-hover"
        >
          <div className="mb-3 text-[10px] font-medium tracking-[0.25em] text-text-muted uppercase">
            {t.label}
          </div>
          <div className="font-display text-4xl font-bold tracking-wide text-accent sm:text-5xl">
            {t.value === null ? (
              <span className="text-text-muted">--</span>
            ) : (
              t.value
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
