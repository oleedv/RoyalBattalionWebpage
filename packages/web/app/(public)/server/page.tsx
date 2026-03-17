"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { NavAuthButton } from "@/components/nav-auth-button";
import { getServerStatus, createLobby } from "@/lib/api-client";
import type { ServerStatus } from "@/lib/api-client";

const SERVERS = [
  {
    label: "Main Server",
    displayName: "Royal Battalion",
    lobbyName: "Royal Battalion",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-accent">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7" />
      </svg>
    ),
  },
  {
    label: "Battle Server",
    displayName: "RB Battle",
    lobbyName: "RB Battle",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-accent">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
      </svg>
    ),
  },
];

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function ServerCard({
  config,
  status,
}: {
  config: (typeof SERVERS)[number];
  status: ServerStatus | null;
}) {
  const [showPlayers, setShowPlayers] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const isOnline = status?.status === "online";

  const handleJoin = useCallback(async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const res = await createLobby(config.lobbyName);
      if (res.success && res.data) {
        window.location.href = res.data.url;
      } else {
        setJoinError("Join service is currently unavailable, please try again later");
      }
    } catch {
      setJoinError("Join service is currently unavailable, please try again later");
    } finally {
      setJoining(false);
    }
  }, [config.lobbyName]);

  return (
    <div className="facet-border w-full rounded-sm bg-bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/20 bg-accent/10">
            {config.icon}
          </div>
          <div>
            <div className="text-xs font-medium tracking-[0.2em] text-text-muted uppercase mb-0.5">
              {config.label}
            </div>
            <div className="font-display text-lg font-semibold tracking-wide text-text-primary">
              {config.displayName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${isOnline ? "bg-success animate-pulse" : "bg-text-muted"}`} />
          <span className={`text-sm font-medium ${isOnline ? "text-success" : "text-text-muted"}`}>
            {status ? (isOnline ? "Online" : "Offline") : "Loading..."}
          </span>
        </div>
      </div>

      {/* Status info */}
      {status && (
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <div className="text-[10px] font-medium tracking-[0.2em] text-text-muted uppercase mb-1">
                Players
              </div>
              <div className="font-display text-2xl font-bold tracking-wide text-text-primary">
                {status.players}
                <span className="text-base font-normal text-text-muted">/{status.maxPlayers}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium tracking-[0.2em] text-text-muted uppercase mb-1">
                Current Map
              </div>
              <div className="text-sm font-medium text-text-primary">
                {status.map}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="text-[10px] font-medium tracking-[0.2em] text-text-muted uppercase mb-1">
                Address
              </div>
              <div className="text-sm text-text-secondary">
                {status.ip}:{status.port}
              </div>
            </div>
          </div>

          {/* Player count bar */}
          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${(status.players / status.maxPlayers) * 100}%` }}
              />
            </div>
          </div>

          {/* Player list toggle */}
          {status.playerList.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPlayers(!showPlayers)}
                className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-accent"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 transition-transform duration-200 ${showPlayers ? "rotate-180" : ""}`}
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
                {showPlayers ? "Hide Players" : `Show Players (${status.playerList.length})`}
              </button>

              {showPlayers && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-sm border border-border/50 bg-bg-primary/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
                          Player
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.playerList.map((p, i) => (
                        <tr key={i} className="border-b border-border/20">
                          <td className="px-3 py-1.5 text-text-primary">{p.name}</td>
                          <td className="px-3 py-1.5 text-right text-text-secondary">
                            {formatDuration(p.duration)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Connect button */}
      <div className="border-t border-border/50 px-6 py-4">
        <button
          onClick={handleJoin}
          disabled={joining}
          className="inline-flex items-center gap-2 rounded-sm border border-accent/30 bg-accent/10 px-6 py-2.5 text-sm font-semibold tracking-wide text-accent transition-colors hover:bg-accent/20 hover:border-accent/50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {joining ? (
            <>
              <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Creating lobby...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
              </svg>
              Join Server
            </>
          )}
        </button>
        {joinError && (
          <p className="mt-2 text-sm text-danger">{joinError}</p>
        )}
      </div>
    </div>
  );
}

export default function ServerPage() {
  const [statuses, setStatuses] = useState<ServerStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const res = await getServerStatus();
      if (res.success && res.data) {
        setStatuses(res.data);
      }
      setLoading(false);
    }

    fetch();
    const interval = setInterval(fetch, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="border-b border-border/50 bg-bg-primary/60 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-18 sm:px-6">
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <Image
              src="/img/rb_newlion2024_4_RS.png"
              alt="Royal Battalion"
              width={32}
              height={32}
              className="rounded-sm sm:h-9 sm:w-9"
            />
            <span className="font-display text-sm font-semibold tracking-[0.15em] text-accent sm:text-lg">
              ROYAL BATTALION
            </span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/"
              className="hidden text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent sm:block"
            >
              Home
            </Link>
            <Link
              href="/matches"
              className="hidden text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent sm:block"
            >
              Matches
            </Link>
            <NavAuthButton className="glow-button rounded-sm border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-accent transition-all hover:bg-accent/20 hover:border-accent/60 sm:px-5 sm:py-2 sm:text-sm" />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <section className="mb-14 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/40" />
            <div className="h-1.5 w-1.5 rotate-45 bg-accent/50" />
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/40" />
          </div>
          <h1 className="font-display mb-4 text-4xl font-bold tracking-wide sm:text-5xl">
            Server Status
          </h1>
          <p className="text-text-secondary text-lg">
            Live information for the Royal Battalion Squad servers.
          </p>
        </section>

        {/* Server Cards */}
        <section className="mb-16">
          {loading ? (
            <div className="text-center text-text-secondary">Loading server status...</div>
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
            Or search for &quot;Royal Battalion&quot; in the Squad server browser
          </div>
        </section>

        {/* Server Details */}
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
              { label: "Administration", value: "Active" },
              { label: "Whitelist", value: "Discord Linked" },
            ].map((item) => (
              <div
                key={item.label}
                className="facet-border rounded-sm bg-bg-card p-5 transition-colors hover:bg-bg-card-hover"
              >
                <div className="mb-1 text-[10px] font-medium tracking-[0.2em] text-text-muted uppercase">
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
    </div>
  );
}
