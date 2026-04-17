"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { NavAuthButton } from "@/components/nav-auth-button";
import { getPublicMatches } from "@/lib/api-client";
import type { Match, MatchDetail, MatchPlayer } from "shared";

const THUMBNAILS_BASE =
  "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/maps/thumbnails";

const FLAG_BASE = "https://raw.githubusercontent.com/mahtoid/SquadMaps/master/img/icons";
const FACTION_FLAGS: Record<string, string> = {
  USA:    `${FLAG_BASE}/flag_USA.png`,
  USMC:   `${FLAG_BASE}/flag_USMC.png`,
  RUS:    `${FLAG_BASE}/flag_RUS.png`,
  VDV:    `${FLAG_BASE}/flag_VDV.png`,
  GB:     `${FLAG_BASE}/flag_GB.png`,
  BAF:    `${FLAG_BASE}/flag_GB.png`,
  CAF:    `${FLAG_BASE}/flag_CAF.png`,
  AUS:    `${FLAG_BASE}/flag_AUS.png`,
  ADF:    `${FLAG_BASE}/flag_AUS.png`,
  MEA:    `${FLAG_BASE}/flag_MEA.png`,
  INS:    `${FLAG_BASE}/flag_INS.png`,
  MIL:    `${FLAG_BASE}/flag_MIL.png`,
  PLA:    `${FLAG_BASE}/flag_PLA.png`,
  PLANMC: `${FLAG_BASE}/flag_PLANMC.png`,
};

function FactionFlag({ code, className = "h-4 w-4" }: { code: string; className?: string }) {
  const src = FACTION_FLAGS[code];
  if (!src) return null;
  return <img src={src} alt={code} className={`${className} object-contain`} />;
}

function getMapThumbnailUrls(layer: string): string[] {
  // Strip SquadJS prefixes like "SEC_26_"
  const stripped = layer.replace(/^SEC_?\d*_?/, "").trim();

  // The SquadMaps repo uses CamelCased map names with underscores only before
  // the game mode and version (e.g. "GooseBay_RAAS_v2.jpg", "AlBasrah_Invasion_v3.jpg").
  // Layer strings from SquadJS arrive as "Goose Bay RAAS v2" — so we need the
  // map-name portion collapsed (no spaces, no underscores) while keeping the
  // separators before mode and version.
  const parts = stripped.split(/\s+/).filter(Boolean);

  const candidates = new Set<string>();

  // Variant 1: every space -> underscore (legacy behavior, matches a few maps).
  candidates.add(parts.join("_"));

  // Variant 2: collapse map-name words, keep mode/version separated.
  // Match trailing "...<MODE> v<N>" (mode is last word before version).
  if (parts.length >= 3) {
    const versionPart = parts[parts.length - 1];
    const modePart = parts[parts.length - 2];
    const mapNamePart = parts.slice(0, -2).join("");
    if (mapNamePart && /^v\d+$/i.test(versionPart)) {
      candidates.add(`${mapNamePart}_${modePart}_${versionPart}`);
    }
  }

  // Variant 3: no trailing version — just "<Map> <MODE>".
  if (parts.length >= 2 && !/^v\d+$/i.test(parts[parts.length - 1])) {
    const modePart = parts[parts.length - 1];
    const mapNamePart = parts.slice(0, -1).join("");
    if (mapNamePart) candidates.add(`${mapNamePart}_${modePart}`);
  }

  // For each candidate, also try the zero-padded version number (v2 <-> v02).
  const urls: string[] = [];
  for (const name of candidates) {
    urls.push(`${THUMBNAILS_BASE}/${name}.jpg`);
    const m = name.match(/^(.+_v)(\d+)$/);
    if (m) {
      const padded = m[2].padStart(2, "0");
      if (padded !== m[2]) urls.push(`${THUMBNAILS_BASE}/${m[1]}${padded}.jpg`);
      const unpadded = String(parseInt(m[2], 10));
      if (unpadded !== m[2]) urls.push(`${THUMBNAILS_BASE}/${m[1]}${unpadded}.jpg`);
    }
  }
  return urls;
}

function MapImg({ urls, alt, className }: { urls: string[]; alt: string; className?: string }) {
  const [idx, setIdx] = useState(0);
  if (idx >= urls.length) return null;
  return (
    <img
      src={urls[idx]}
      alt={alt}
      className={className}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

function PlayerTable({ players, teamColor }: { players: MatchPlayer[]; teamColor: string }) {
  const squads: { name: string; players: MatchPlayer[] }[] = [];
  const squadMap = new Map<string, MatchPlayer[]>();

  for (const p of players) {
    if (!squadMap.has(p.squad)) {
      squadMap.set(p.squad, []);
      squads.push({ name: p.squad, players: squadMap.get(p.squad)! });
    }
    squadMap.get(p.squad)!.push(p);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">Player</th>
            <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">Role</th>
            <th className="px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">K</th>
            <th className="px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">D</th>
            <th className="px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">Rev</th>
            <th className="px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">TK</th>
          </tr>
        </thead>
        <tbody>
          {squads.map((squad) => (
            <React.Fragment key={squad.name}>
              <tr className="border-b border-border/30">
                <td colSpan={6} className="bg-bg-tertiary/40 px-3 py-1.5">
                  <span className="text-xs font-semibold tracking-[0.1em] text-accent uppercase">{squad.name}</span>
                  <span className="ml-2 text-xs text-text-secondary">{squad.players.length} players</span>
                </td>
              </tr>
              {squad.players.map((p, i) => (
                <tr key={`${squad.name}-${i}`} className="border-b border-border/20 transition-colors hover:bg-bg-tertiary/30">
                  <td className={`px-3 py-2 font-medium ${teamColor}`}>
                    <span className="flex items-center gap-1.5">
                      {p.isSquadLeader ? (
                        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-accent/20 text-[9px] font-bold leading-none text-accent" title="Squad Leader">
                          SL
                        </span>
                      ) : (
                        <span className="inline-block h-4 w-4 shrink-0" />
                      )}
                      {p.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{p.role}</td>
                  <td className="px-3 py-2 text-center text-text-primary">{p.kills}</td>
                  <td className="px-3 py-2 text-center text-text-primary">{p.deaths}</td>
                  <td className="px-3 py-2 text-center text-text-primary">{p.revives}</td>
                  <td className={`px-3 py-2 text-center ${p.teamkills > 0 ? "text-danger" : "text-text-secondary"}`}>{p.teamkills}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function resultBadge(result: string): string {
  switch (result) {
    case "WIN": return "bg-success/15 text-success";
    case "LOSS": return "bg-danger/15 text-danger";
    default: return "bg-text-muted/15 text-text-muted";
  }
}

function MatchRow({ match }: { match: Match }) {
  const [expanded, setExpanded] = useState(false);
  const detail = match.matchDetail;

  const thumbUrls = getMapThumbnailUrls(match.layer);

  const totalKills1 = detail?.team1Players.reduce((s, p) => s + p.kills, 0) ?? 0;
  const totalKills2 = detail?.team2Players.reduce((s, p) => s + p.kills, 0) ?? 0;
  const totalRevives1 = detail?.team1Players.reduce((s, p) => s + p.revives, 0) ?? 0;
  const totalRevives2 = detail?.team2Players.reduce((s, p) => s + p.revives, 0) ?? 0;

  return (
    <div className="facet-border relative overflow-hidden rounded-sm bg-bg-card transition-all">
      {/* Map thumbnail background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <MapImg
          urls={thumbUrls}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(90deg, transparent 0%, transparent 30%, var(--color-bg-card) 65%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, transparent 0%, transparent 60%, var(--color-bg-card) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(180deg, var(--color-bg-card) 0%, transparent 8%)",
          }}
        />
      </div>

      {/* Match summary row - clickable */}
      <button
        onClick={() => detail && setExpanded(!expanded)}
        className={`relative w-full text-left transition-colors ${detail ? "hover:bg-bg-card-hover/50 cursor-pointer" : "cursor-default"}`}
      >
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          {/* Match Info */}
          <div className="flex items-center gap-5">
            <div className="hidden shrink-0 overflow-hidden rounded-sm border border-border/50 sm:block">
              <MapImg
                urls={thumbUrls}
                alt={match.map}
                className="h-14 w-14 object-cover"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center gap-3">
                <span className="font-display text-base font-semibold tracking-wide text-text-primary">
                  {match.map}
                </span>
                <span className="text-xs text-text-secondary">
                  {match.layer}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-secondary">
                <span>
                  {new Date(match.date).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}{" "}
                  {new Date(match.date).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {detail && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-text-secondary" />
                    <span>{detail.duration}</span>
                    <span className="h-1 w-1 rounded-full bg-text-secondary" />
                    <span>{detail.players} players</span>
                  </>
                )}
                <span className="h-1 w-1 rounded-full bg-text-secondary" />
                <span>{match.server}</span>
                {match.vodUrl && (
                  <>
                    <span className="h-1 w-1 rounded-full bg-text-secondary" />
                    <a
                      href={match.vodUrl.startsWith("http") ? match.vodUrl : `https://${match.vodUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-sm border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-accent uppercase transition-all hover:bg-accent/20 hover:border-accent/50"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                        <path d="M3 3.732a1.5 1.5 0 0 1 2.305-1.265l6.706 4.267a1.5 1.5 0 0 1 0 2.531l-6.706 4.268A1.5 1.5 0 0 1 3 12.267V3.732z" />
                      </svg>
                      VOD
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Score + chevron */}
          <div className="flex items-center gap-4">
            {detail ? (
              <>
                <div className="text-right">
                  <div className="mb-0.5 flex items-center justify-end gap-1.5 text-xs font-medium tracking-[0.15em] text-text-secondary uppercase">
                    {detail.team1.faction}
                    <FactionFlag code={detail.team1.faction} className="h-3.5 w-3.5" />
                  </div>
                  <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${resultBadge(detail.team1.result)}`}>
                    {detail.team1.result}
                  </span>
                </div>
                <div className="flex h-8 w-8 items-center justify-center text-xs font-bold text-text-secondary">
                  vs
                </div>
                <div className="text-left">
                  <div className="mb-0.5 flex items-center gap-1.5 text-xs font-medium tracking-[0.15em] text-text-secondary uppercase">
                    <FactionFlag code={detail.team2.faction} className="h-3.5 w-3.5" />
                    {detail.team2.faction}
                  </div>
                  <span className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${resultBadge(detail.team2.result)}`}>
                    {detail.team2.result}
                  </span>
                </div>
                <div className="ml-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-5 w-5 text-text-secondary transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>
              </>
            ) : (
              <span className={`rounded-sm border px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase ${
                match.result.toLowerCase() === "win" ? "bg-success/10 border-success/30 text-success"
                : match.result.toLowerCase() === "loss" ? "bg-danger/10 border-danger/30 text-danger"
                : "bg-text-muted/10 border-text-muted/30 text-text-muted"
              }`}>
                {match.result}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && detail && (
        <div className="relative border-t border-border/50">
          <div className="relative px-5 pb-5">
            {/* Match overview stats */}
            <div className="grid grid-cols-2 gap-4 py-5 sm:grid-cols-4">
              <div className="rounded-sm border border-border/50 bg-bg-primary/70 p-3 text-center backdrop-blur-sm">
                <div className="mb-1 text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">Map</div>
                <div className="font-display text-sm font-semibold tracking-wide text-text-primary">{match.map}</div>
              </div>
              <div className="rounded-sm border border-border/50 bg-bg-primary/70 p-3 text-center backdrop-blur-sm">
                <div className="mb-1 text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">Layer</div>
                <div className="font-display text-sm font-semibold tracking-wide text-text-primary">{match.layer}</div>
              </div>
              <div className="rounded-sm border border-border/50 bg-bg-primary/70 p-3 text-center backdrop-blur-sm">
                <div className="mb-1 text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">Duration</div>
                <div className="font-display text-sm font-semibold tracking-wide text-text-primary">{detail.duration}</div>
              </div>
              <div className="rounded-sm border border-border/50 bg-bg-primary/70 p-3 text-center backdrop-blur-sm">
                <div className="mb-1 text-xs font-medium tracking-[0.1em] text-text-secondary uppercase">Players</div>
                <div className="font-display text-sm font-semibold tracking-wide text-text-primary">{detail.players}</div>
              </div>
            </div>

            {/* Team comparison */}
            <div className="mb-6 rounded-sm border border-border/50 bg-bg-primary/70 p-4 backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FactionFlag code={detail.team1.faction} />
                  <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                    {detail.team1.factionFull || detail.team1.faction}
                  </span>
                  <span className={`ml-1 rounded-sm px-2 py-0.5 text-xs font-semibold ${resultBadge(detail.team1.result)}`}>
                    {detail.team1.result}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`mr-1 rounded-sm px-2 py-0.5 text-xs font-semibold ${resultBadge(detail.team2.result)}`}>
                    {detail.team2.result}
                  </span>
                  <span className="font-display text-sm font-semibold tracking-wide text-text-primary">
                    {detail.team2.factionFull || detail.team2.faction}
                  </span>
                  <FactionFlag code={detail.team2.faction} />
                </div>
              </div>

              {/* Stats comparison */}
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div>
                  <span className="font-semibold text-[#4a90d9]">{totalKills1}</span>
                  <span className="mx-1 text-text-secondary">Kills</span>
                  <span className="font-semibold text-[#d94a4a]">{totalKills2}</span>
                </div>
                <div>
                  <span className="font-semibold text-[#4a90d9]">{totalRevives1}</span>
                  <span className="mx-1 text-text-secondary">Revives</span>
                  <span className="font-semibold text-[#d94a4a]">{totalRevives2}</span>
                </div>
              </div>
            </div>

            {/* Player tables */}
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-3 w-1 rounded-full bg-[#4a90d9]" />
                  <FactionFlag code={detail.team1.faction} />
                  <h3 className="font-display text-sm font-semibold tracking-wide text-text-primary">
                    {detail.team1.factionFull || detail.team1.faction}
                  </h3>
                </div>
                <div className="rounded-sm border border-border/50 bg-bg-primary/70 backdrop-blur-sm">
                  <PlayerTable players={detail.team1Players} teamColor="text-[#7ab3ef]" />
                </div>
              </div>
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-3 w-1 rounded-full bg-[#d94a4a]" />
                  <FactionFlag code={detail.team2.faction} />
                  <h3 className="font-display text-sm font-semibold tracking-wide text-text-primary">
                    {detail.team2.factionFull || detail.team2.faction}
                  </h3>
                </div>
                <div className="rounded-sm border border-border/50 bg-bg-primary/70 backdrop-blur-sm">
                  <PlayerTable players={detail.team2Players} teamColor="text-[#ef7a7a]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
              href="/server"
              className="hidden text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent sm:block"
            >
              Server
            </Link>
            <NavAuthButton className="glow-button rounded-sm border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-accent transition-all hover:bg-accent/20 hover:border-accent/60 sm:px-5 sm:py-2 sm:text-sm" />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Header */}
        <section className="mb-10 text-center sm:mb-12">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/40" />
            <div className="h-1.5 w-1.5 rotate-45 bg-accent/50" />
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/40" />
          </div>
          <h1 className="font-display mb-4 text-3xl font-bold tracking-wide sm:text-4xl lg:text-5xl">
            Match History
          </h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Recent matches played on Royal Battalion servers.
          </p>
        </section>

        {/* Match List */}
        <section>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="facet-border animate-pulse rounded-sm bg-bg-card p-5">
                  <div className="flex items-center gap-5">
                    <div className="hidden h-14 w-14 rounded-sm bg-bg-tertiary sm:block" />
                    <div className="flex-1">
                      <div className="mb-2 h-5 w-32 rounded bg-bg-tertiary" />
                      <div className="h-3 w-48 rounded bg-bg-tertiary" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : matches.length === 0 ? (
            <div className="py-16 text-center text-text-muted">
              No matches recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <MatchRow key={match.id} match={match} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-xs text-text-muted">
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
    </div>
  );
}
