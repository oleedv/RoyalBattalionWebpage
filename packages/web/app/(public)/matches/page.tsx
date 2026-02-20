"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

interface MatchTeam {
  name: string;
  faction: string;
  tickets: number;
  result: "WIN" | "LOSS";
}

interface MatchPlayer {
  name: string;
  squad: string;
  role: string;
  kills: number;
  deaths: number;
  revives: number;
  teamkills: number;
}

interface Match {
  id: string;
  date: string;
  map: string;
  layer: string;
  duration: string;
  team1: MatchTeam;
  team2: MatchTeam;
  players: number;
  team1Players: MatchPlayer[];
  team2Players: MatchPlayer[];
}

const MOCK_MATCHES: Match[] = [
  {
    id: "RB-1042",
    date: "Feb 18, 2026",
    map: "Gorodok",
    layer: "RAAS v1",
    duration: "1h 12m",
    team1: { name: "BLUFOR", faction: "USA", tickets: 182, result: "WIN" },
    team2: { name: "OPFOR", faction: "RUS", tickets: 0, result: "LOSS" },
    players: 98,
    team1Players: [
      { name: "Sgt.Miller", squad: "Squad 1", role: "Squad Leader", kills: 14, deaths: 3, revives: 0, teamkills: 0 },
      { name: "Pvt.Jackson", squad: "Squad 1", role: "Medic", kills: 4, deaths: 5, revives: 12, teamkills: 0 },
      { name: "Cpl.Davis", squad: "Squad 1", role: "Rifleman", kills: 9, deaths: 6, revives: 0, teamkills: 1 },
      { name: "SpecOps_Wolf", squad: "Squad 2", role: "Squad Leader", kills: 18, deaths: 4, revives: 0, teamkills: 0 },
      { name: "GhostReaper", squad: "Squad 2", role: "Marksman", kills: 22, deaths: 2, revives: 0, teamkills: 0 },
      { name: "MedicJoe", squad: "Squad 2", role: "Medic", kills: 3, deaths: 7, revives: 15, teamkills: 0 },
    ],
    team2Players: [
      { name: "CommanderIvan", squad: "Squad 1", role: "Squad Leader", kills: 11, deaths: 8, revives: 0, teamkills: 0 },
      { name: "Borislav", squad: "Squad 1", role: "Machine Gunner", kills: 8, deaths: 9, revives: 0, teamkills: 1 },
      { name: "Medik_RU", squad: "Squad 1", role: "Medic", kills: 2, deaths: 6, revives: 9, teamkills: 0 },
      { name: "TankHunter", squad: "Squad 2", role: "HAT", kills: 6, deaths: 10, revives: 0, teamkills: 0 },
      { name: "Sniper_East", squad: "Squad 2", role: "Marksman", kills: 15, deaths: 5, revives: 0, teamkills: 0 },
      { name: "DocPavel", squad: "Squad 3", role: "Medic", kills: 1, deaths: 8, revives: 11, teamkills: 0 },
    ],
  },
  {
    id: "RB-1041",
    date: "Feb 17, 2026",
    map: "Yehorivka",
    layer: "AAS v2",
    duration: "58m",
    team1: { name: "BLUFOR", faction: "CAF", tickets: 0, result: "LOSS" },
    team2: { name: "OPFOR", faction: "MIL", tickets: 96, result: "WIN" },
    players: 100,
    team1Players: [
      { name: "MapleLeaf_1", squad: "Squad 1", role: "Squad Leader", kills: 7, deaths: 11, revives: 0, teamkills: 0 },
      { name: "CanuckMedic", squad: "Squad 1", role: "Medic", kills: 2, deaths: 9, revives: 8, teamkills: 0 },
      { name: "Frostbite", squad: "Squad 2", role: "Rifleman", kills: 5, deaths: 12, revives: 0, teamkills: 0 },
    ],
    team2Players: [
      { name: "RebelCommander", squad: "Squad 1", role: "Squad Leader", kills: 19, deaths: 3, revives: 0, teamkills: 0 },
      { name: "RPG_King", squad: "Squad 1", role: "LAT", kills: 12, deaths: 5, revives: 0, teamkills: 1 },
      { name: "FieldDoc", squad: "Squad 2", role: "Medic", kills: 3, deaths: 4, revives: 14, teamkills: 0 },
    ],
  },
  {
    id: "RB-1040",
    date: "Feb 16, 2026",
    map: "Harju",
    layer: "Invasion v1",
    duration: "1h 04m",
    team1: { name: "BLUFOR", faction: "BAF", tickets: 312, result: "WIN" },
    team2: { name: "OPFOR", faction: "RUS", tickets: 0, result: "LOSS" },
    players: 96,
    team1Players: [
      { name: "TeaBag_SL", squad: "Squad 1", role: "Squad Leader", kills: 16, deaths: 5, revives: 0, teamkills: 0 },
      { name: "NHSMedic", squad: "Squad 1", role: "Medic", kills: 5, deaths: 3, revives: 18, teamkills: 0 },
      { name: "Warrior_IFV", squad: "Armour", role: "Crewman", kills: 24, deaths: 1, revives: 0, teamkills: 2 },
    ],
    team2Players: [
      { name: "Komrade_Lead", squad: "Squad 1", role: "Squad Leader", kills: 9, deaths: 12, revives: 0, teamkills: 0 },
      { name: "BTR_Driver", squad: "Armour", role: "Crewman", kills: 7, deaths: 8, revives: 0, teamkills: 0 },
      { name: "CombatMedic_3", squad: "Squad 2", role: "Medic", kills: 1, deaths: 10, revives: 6, teamkills: 0 },
    ],
  },
  {
    id: "RB-1039",
    date: "Feb 15, 2026",
    map: "Black Coast",
    layer: "RAAS v3",
    duration: "47m",
    team1: { name: "BLUFOR", faction: "USMC", tickets: 0, result: "LOSS" },
    team2: { name: "OPFOR", faction: "PLA", tickets: 224, result: "WIN" },
    players: 100,
    team1Players: [
      { name: "SemperFi_1", squad: "Squad 1", role: "Squad Leader", kills: 8, deaths: 9, revives: 0, teamkills: 0 },
      { name: "CorpsmanDoc", squad: "Squad 1", role: "Medic", kills: 3, deaths: 7, revives: 10, teamkills: 0 },
      { name: "LAV_Gunner", squad: "Armour", role: "Crewman", kills: 11, deaths: 6, revives: 0, teamkills: 1 },
    ],
    team2Players: [
      { name: "DragonLead", squad: "Squad 1", role: "Squad Leader", kills: 21, deaths: 2, revives: 0, teamkills: 0 },
      { name: "RedStar_MG", squad: "Squad 1", role: "Machine Gunner", kills: 17, deaths: 4, revives: 0, teamkills: 0 },
      { name: "PLA_Medic", squad: "Squad 2", role: "Medic", kills: 4, deaths: 3, revives: 16, teamkills: 0 },
    ],
  },
  {
    id: "RB-1038",
    date: "Feb 14, 2026",
    map: "Narva",
    layer: "AAS v1",
    duration: "1h 21m",
    team1: { name: "BLUFOR", faction: "USA", tickets: 54, result: "WIN" },
    team2: { name: "OPFOR", faction: "RUS", tickets: 0, result: "LOSS" },
    players: 94,
    team1Players: [
      { name: "AlphaLead", squad: "Squad 1", role: "Squad Leader", kills: 13, deaths: 7, revives: 0, teamkills: 0 },
      { name: "CombatDoc", squad: "Squad 1", role: "Medic", kills: 6, deaths: 4, revives: 13, teamkills: 0 },
      { name: "Bradley_Cmdr", squad: "Armour", role: "Crewman", kills: 19, deaths: 2, revives: 0, teamkills: 0 },
    ],
    team2Players: [
      { name: "SovietLead", squad: "Squad 1", role: "Squad Leader", kills: 10, deaths: 9, revives: 0, teamkills: 1 },
      { name: "Kalash_Pro", squad: "Squad 1", role: "Rifleman", kills: 8, deaths: 11, revives: 0, teamkills: 0 },
      { name: "BMP_Driver", squad: "Armour", role: "Crewman", kills: 14, deaths: 6, revives: 0, teamkills: 0 },
    ],
  },
];

function PlayerTable({ players, teamColor }: { players: MatchPlayer[]; teamColor: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/50">
            <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Player</th>
            <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Squad</th>
            <th className="px-3 py-2 text-left text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Role</th>
            <th className="px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-text-muted uppercase">K</th>
            <th className="px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-text-muted uppercase">D</th>
            <th className="px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Rev</th>
            <th className="px-3 py-2 text-center text-xs font-medium tracking-[0.1em] text-text-muted uppercase">TK</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p, i) => (
            <tr key={i} className="border-b border-border/20 transition-colors hover:bg-bg-tertiary/30">
              <td className={`px-3 py-2 font-medium ${teamColor}`}>{p.name}</td>
              <td className="px-3 py-2 text-text-secondary">{p.squad}</td>
              <td className="px-3 py-2 text-text-secondary">{p.role}</td>
              <td className="px-3 py-2 text-center text-text-primary">{p.kills}</td>
              <td className="px-3 py-2 text-center text-text-primary">{p.deaths}</td>
              <td className="px-3 py-2 text-center text-text-primary">{p.revives}</td>
              <td className={`px-3 py-2 text-center ${p.teamkills > 0 ? "text-danger" : "text-text-muted"}`}>{p.teamkills}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MatchRow({ match }: { match: Match }) {
  const [expanded, setExpanded] = useState(false);

  const totalKills1 = match.team1Players.reduce((s, p) => s + p.kills, 0);
  const totalDeaths1 = match.team1Players.reduce((s, p) => s + p.deaths, 0);
  const totalRevives1 = match.team1Players.reduce((s, p) => s + p.revives, 0);
  const totalKills2 = match.team2Players.reduce((s, p) => s + p.kills, 0);
  const totalDeaths2 = match.team2Players.reduce((s, p) => s + p.deaths, 0);
  const totalRevives2 = match.team2Players.reduce((s, p) => s + p.revives, 0);

  return (
    <div className="facet-border rounded-sm bg-bg-card transition-all">
      {/* Match summary row - clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-5 text-left transition-colors hover:bg-bg-card-hover"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Match Info */}
          <div className="flex items-center gap-5">
            <div className="hidden sm:block">
              <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-border bg-bg-tertiary">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-text-muted">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                </svg>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="font-display text-base font-semibold tracking-wide text-text-primary">
                  {match.map}
                </span>
                <span className="text-xs text-text-muted">
                  {match.layer}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span>{match.id}</span>
                <span className="h-1 w-1 rounded-full bg-text-muted" />
                <span>{match.date}</span>
                <span className="h-1 w-1 rounded-full bg-text-muted" />
                <span>{match.duration}</span>
                <span className="h-1 w-1 rounded-full bg-text-muted" />
                <span>{match.players} players</span>
              </div>
            </div>
          </div>

          {/* Score + chevron */}
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase mb-0.5">
                {match.team1.name}
              </div>
              <div className={`font-display text-lg font-bold tracking-wide ${match.team1.result === "WIN" ? "text-success" : "text-text-muted"}`}>
                {match.team1.tickets}
              </div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center text-xs font-bold text-text-muted">
              vs
            </div>
            <div className="text-left">
              <div className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase mb-0.5">
                {match.team2.name}
              </div>
              <div className={`font-display text-lg font-bold tracking-wide ${match.team2.result === "WIN" ? "text-success" : "text-text-muted"}`}>
                {match.team2.tickets}
              </div>
            </div>

            {/* Expand chevron */}
            <div className="ml-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className={`h-5 w-5 text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              >
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border/50 px-5 pb-5">
          {/* Match overview stats */}
          <div className="grid grid-cols-2 gap-4 py-5 sm:grid-cols-4">
            <div className="rounded-sm border border-border/50 bg-bg-tertiary/50 p-3 text-center">
              <div className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase mb-1">Map</div>
              <div className="font-display text-sm font-semibold tracking-wide text-text-primary">{match.map}</div>
            </div>
            <div className="rounded-sm border border-border/50 bg-bg-tertiary/50 p-3 text-center">
              <div className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase mb-1">Layer</div>
              <div className="font-display text-sm font-semibold tracking-wide text-text-primary">{match.layer}</div>
            </div>
            <div className="rounded-sm border border-border/50 bg-bg-tertiary/50 p-3 text-center">
              <div className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase mb-1">Duration</div>
              <div className="font-display text-sm font-semibold tracking-wide text-text-primary">{match.duration}</div>
            </div>
            <div className="rounded-sm border border-border/50 bg-bg-tertiary/50 p-3 text-center">
              <div className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase mb-1">Players</div>
              <div className="font-display text-sm font-semibold tracking-wide text-text-primary">{match.players}</div>
            </div>
          </div>

          {/* Team comparison bar */}
          <div className="mb-6 rounded-sm border border-border/50 bg-bg-tertiary/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="font-display text-sm font-semibold tracking-wide text-text-primary">{match.team1.faction}</span>
                <span className={`ml-2 rounded-sm px-2 py-0.5 text-xs font-semibold ${match.team1.result === "WIN" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                  {match.team1.result}
                </span>
              </div>
              <div>
                <span className={`mr-2 rounded-sm px-2 py-0.5 text-xs font-semibold ${match.team2.result === "WIN" ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
                  {match.team2.result}
                </span>
                <span className="font-display text-sm font-semibold tracking-wide text-text-primary">{match.team2.faction}</span>
              </div>
            </div>

            {/* Ticket bar */}
            <div className="mb-3">
              <div className="mb-1 flex justify-between text-xs text-text-muted">
                <span>Tickets: {match.team1.tickets}</span>
                <span>Tickets: {match.team2.tickets}</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-bg-tertiary">
                <div
                  className="bg-[#4a90d9] transition-all"
                  style={{ width: `${(match.team1.tickets / (match.team1.tickets + match.team2.tickets || 1)) * 100}%` }}
                />
                <div
                  className="bg-[#d94a4a] transition-all"
                  style={{ width: `${(match.team2.tickets / (match.team1.tickets + match.team2.tickets || 1)) * 100}%` }}
                />
              </div>
            </div>

            {/* Stats comparison */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <span className="text-[#4a90d9] font-semibold">{totalKills1}</span>
                <span className="text-text-muted mx-1">Kills</span>
                <span className="text-[#d94a4a] font-semibold">{totalKills2}</span>
              </div>
              <div>
                <span className="text-[#4a90d9] font-semibold">{totalDeaths1}</span>
                <span className="text-text-muted mx-1">Deaths</span>
                <span className="text-[#d94a4a] font-semibold">{totalDeaths2}</span>
              </div>
              <div>
                <span className="text-[#4a90d9] font-semibold">{totalRevives1}</span>
                <span className="text-text-muted mx-1">Revives</span>
                <span className="text-[#d94a4a] font-semibold">{totalRevives2}</span>
              </div>
            </div>
          </div>

          {/* Player tables */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="h-3 w-1 rounded-full bg-[#4a90d9]" />
                <h3 className="font-display text-sm font-semibold tracking-wide text-text-primary">
                  {match.team1.faction} -- {match.team1.name}
                </h3>
              </div>
              <div className="rounded-sm border border-border/50 bg-bg-tertiary/20">
                <PlayerTable players={match.team1Players} teamColor="text-[#7ab3ef]" />
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center gap-2">
                <div className="h-3 w-1 rounded-full bg-[#d94a4a]" />
                <h3 className="font-display text-sm font-semibold tracking-wide text-text-primary">
                  {match.team2.faction} -- {match.team2.name}
                </h3>
              </div>
              <div className="rounded-sm border border-border/50 bg-bg-tertiary/20">
                <PlayerTable players={match.team2Players} teamColor="text-[#ef7a7a]" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MatchesPage() {
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
            <Link
              href="/login"
              className="glow-button rounded-sm border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-accent transition-all hover:bg-accent/20 hover:border-accent/60 sm:px-5 sm:py-2 sm:text-sm"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-16">
        {/* Header */}
        <section className="mb-12 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/40" />
            <div className="h-1.5 w-1.5 rotate-45 bg-accent/50" />
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/40" />
          </div>
          <h1 className="font-display mb-4 text-4xl font-bold tracking-wide sm:text-5xl">
            Match History
          </h1>
          <p className="text-text-secondary text-lg mb-6">
            Recent matches played on Royal Battalion servers.
          </p>

          {/* Under Construction Banner */}
          <div className="mx-auto max-w-lg rounded-sm border border-accent/30 bg-accent/5 px-6 py-4">
            <div className="flex items-center justify-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-accent">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.049.58.025 1.193-.14 1.743" />
              </svg>
              <div>
                <span className="text-sm font-semibold text-accent tracking-wide">Under Construction</span>
                <span className="text-sm text-text-secondary ml-2">-- Live match data coming soon</span>
              </div>
            </div>
          </div>
        </section>

        {/* Match List */}
        <section>
          <div className="space-y-3">
            {MOCK_MATCHES.map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
