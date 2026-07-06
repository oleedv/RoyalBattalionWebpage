"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAdminTeamCount,
  getPublicMatches,
  getServerStatus,
  type ServerStatus,
} from "@/lib/api-client";
import type { Match } from "shared";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { StatusBadge, type StatusVariant } from "@/components/status-badge";

export type TelemetryFetchers = {
  servers: typeof getServerStatus;
  admins: typeof getAdminTeamCount;
  matches: typeof getPublicMatches;
};

const DEFAULT_FETCHERS: TelemetryFetchers = {
  servers: getServerStatus,
  admins: getAdminTeamCount,
  matches: getPublicMatches,
};

function matchVariant(result: string): StatusVariant {
  const r = result.toLowerCase();
  if (r === "win") return "match-win";
  if (r === "loss") return "match-loss";
  return "match-draw";
}

function Dot({ online }: { online: boolean }) {
  return (
    <span aria-hidden="true" className="relative flex size-1.5">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
      )}
      <span
        className={`relative inline-flex size-1.5 rounded-full ${online ? "bg-success" : "bg-text-muted"}`}
      />
    </span>
  );
}

function Tile({
  label,
  dot,
  value,
  hint,
}: {
  label: string;
  dot?: boolean | null;
  value: React.ReactNode;
  hint?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3">
      <div className="flex items-center gap-2">
        {dot != null && <Dot online={dot} />}
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted">
          {label}
        </span>
      </div>
      <div className="font-mono text-lg font-semibold tabular-nums text-text-primary">
        {value}
      </div>
      {hint && (
        <div className="truncate font-mono text-[11px] text-text-secondary">
          {hint}
        </div>
      )}
    </div>
  );
}

/** Live telemetry strip pinned to the hero base. Replaces LiveSnapshot. */
export function HeroTelemetry({
  fetchers,
}: {
  fetchers?: Partial<TelemetryFetchers>;
}) {
  const f = { ...DEFAULT_FETCHERS, ...fetchers };
  const fRef = useRef(f);
  fRef.current = f;

  const [servers, setServers] = useState<ServerStatus[] | null>(null);
  const [admins, setAdmins] = useState<number | null>(null);
  const [lastMatch, setLastMatch] = useState<Match | null>(null);

  const load = useCallback(async () => {
    const [s, a, m] = await Promise.all([
      fRef.current.servers(),
      fRef.current.admins(),
      fRef.current.matches(1, 1),
    ]);
    if (s.success && s.data) setServers(s.data);
    if (a.success && a.data) setAdmins(a.data.count);
    if (m.success && m.data && m.data.items.length > 0)
      setLastMatch(m.data.items[0]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, 30_000);

  const main = servers?.[0] ?? null;
  const battle = servers?.[1] ?? null;

  return (
    <div className="border-t border-border/60 bg-bg-primary/70 backdrop-blur-md">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border/40 lg:grid-cols-4">
        <Tile
          label="Main Server"
          dot={main ? main.status === "online" : null}
          value={main ? `${main.players}/${main.maxPlayers}` : "--"}
          hint={main?.map}
        />
        <Tile
          label="Battle Server"
          dot={battle ? battle.status === "online" : null}
          value={battle ? `${battle.players}/${battle.maxPlayers}` : "--"}
          hint={battle?.map}
        />
        <Tile label="Admins on Duty" value={admins ?? "--"} />
        <Tile
          label="Last Match"
          value={
            lastMatch ? (
              <StatusBadge variant={matchVariant(lastMatch.result)} />
            ) : (
              "--"
            )
          }
          hint={lastMatch?.map}
        />
      </div>
    </div>
  );
}
