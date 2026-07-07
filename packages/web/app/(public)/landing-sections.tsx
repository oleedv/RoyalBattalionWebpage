"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getPublicMatches,
  getServerStatus,
  type ServerStatus,
} from "@/lib/api-client";
import type { Match } from "shared";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { getMapThumbnailUrls } from "@/lib/map-thumbnails";
import { StatusBadge, type StatusVariant } from "@/components/status-badge";
import { DiscordIcon } from "@/components/public/discord-icon";
import { MapImg } from "@/app/(public)/matches/match-card";

const SERVER_LABELS = ["Main Server", "Battle Server"] as const;
const SERVER_NAMES = ["Royal Battalion", "RB Battle"] as const;

export function ServersSection() {
  const [servers, setServers] = useState<ServerStatus[] | null>(null);
  const load = useCallback(async () => {
    const res = await getServerStatus();
    if (res.success && res.data) setServers(res.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, 30_000);

  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="font-display mb-3 text-center text-3xl font-bold tracking-wide sm:text-4xl">
        Join the Fight
      </h2>
      <p className="mb-10 text-center text-text-secondary">
        Connect directly through Steam or search &quot;Royal Battalion&quot; in
        the server browser.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {SERVER_LABELS.map((label, i) => {
          const s = servers?.[i] ?? null;
          const online = s?.status === "online";
          return (
            <Link
              key={label}
              href="/server"
              className="facet-border group flex flex-col gap-3 rounded-sm bg-bg-card px-8 py-7 transition-colors hover:bg-bg-card-hover"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
                  {label}
                </span>
                {s !== null && (
                  <StatusBadge
                    variant={online ? "server-online" : "server-offline"}
                  />
                )}
              </div>
              <span className="font-display text-lg font-semibold tracking-wide text-text-primary">
                {SERVER_NAMES[i]}
              </span>
              <span className="font-mono text-sm tabular-nums text-text-secondary">
                {s ? `${s.players}/${s.maxPlayers} — ${s.map}` : "--"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function resultVariant(result: string): StatusVariant {
  const r = result.toLowerCase();
  if (r === "win") return "match-win";
  if (r === "loss") return "match-loss";
  return "match-draw";
}

export function RecentMatchesSection() {
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    getPublicMatches(1, 3).then((res) => {
      if (res.success && res.data) setMatches(res.data.items);
    });
  }, []);

  if (matches.length === 0) return null;

  return (
    <section className="border-t border-border bg-bg-secondary py-20">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="font-display mb-10 text-center text-3xl font-bold tracking-wide sm:text-4xl">
          Recent Matches
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {matches.map((m) => (
            <Link
              key={m.id}
              href="/matches"
              className="facet-border group overflow-hidden rounded-sm bg-bg-card transition-colors hover:bg-bg-card-hover"
            >
              <div className="graded-media h-28">
                <MapImg urls={getMapThumbnailUrls(m.layer)} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-display text-sm font-semibold tracking-wide text-text-primary">
                    {m.map}
                  </div>
                  <div className="font-mono text-[11px] text-text-muted">
                    {new Date(m.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </div>
                </div>
                <StatusBadge variant={resultVariant(m.result)} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const WHITELIST_STEPS = [
  {
    title: "Enter the Field",
    body: "Play on our servers and become part of the community.",
  },
  {
    title: "Support the Battalion",
    body: "Help keep the lights on — seed the servers or support the community.",
  },
  {
    title: "Earn Your Slot",
    body: "Receive priority whitelist and skip the queue.",
  },
];

export function WhitelistSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="font-display mb-10 text-center text-3xl font-bold tracking-wide sm:text-4xl">
        How Whitelist Works
      </h2>
      <ol className="grid gap-5 sm:grid-cols-3">
        {WHITELIST_STEPS.map((step, i) => (
          <li
            key={step.title}
            className="facet-border rounded-sm bg-bg-card px-6 py-7"
          >
            <div className="font-display mb-3 text-3xl font-bold text-accent/60">
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="font-display mb-2 text-base font-semibold tracking-wide text-text-primary">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DiscordCtaSection() {
  return (
    <section className="border-t border-border bg-bg-secondary py-20 text-center">
      <div className="mx-auto max-w-2xl px-6">
        <h2 className="font-display mb-4 text-3xl font-bold tracking-wide sm:text-4xl">
          Ready to Enlist?
        </h2>
        <p className="mb-8 text-text-secondary">
          The battalion organizes on Discord — events, squads and the community
          all live there.
        </p>
        <a
          href="https://discord.gg/royalbattalion"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 rounded-sm bg-(--color-discord) px-8 py-3.5 text-sm font-semibold tracking-wide text-white transition-colors hover:opacity-90"
        >
          <DiscordIcon className="h-5 w-5" />
          Join Discord
        </a>
      </div>
    </section>
  );
}
