import React from "react";
import type { Player } from "../lib/types";
import { PlayerRow } from "./player-row";

interface TeamColumnProps {
  label: string;
  players: Player[];
  totalCount: number;
  className?: string;
  showActions?: boolean;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  faction?: { name: string; flag: string } | null;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
  onDisbandSquad: (teamID: string, squadID: string) => void;
  onSwitchSquad: (squadName: string, players: Player[]) => void;
  onSelectPlayer: (p: Player) => void;
  formatPlaytime: (s?: number) => string;
  teamId?: string;
}

export const TeamColumn = React.memo(function TeamColumn({
  label,
  players,
  totalCount,
  className = "",
  showActions = false,
  searchValue,
  onSearchChange,
  faction,
  onWarn,
  onKick,
  onSwitchTeam,
  onDisbandSquad,
  onSwitchSquad,
  onSelectPlayer,
  formatPlaytime,
}: TeamColumnProps) {
  // Group by squad
  const squads = new Map<string, Player[]>();
  const noSquad: Player[] = [];

  for (const p of players) {
    if (p.squadID && p.squad) {
      const key = `${p.teamID}-${p.squadID}`;
      if (!squads.has(key)) squads.set(key, []);
      squads.get(key)!.push(p);
    } else {
      noSquad.push(p);
    }
  }

  // Sort SLs to top within each squad
  for (const members of squads.values()) {
    members.sort((a, b) => (a.isLeader === b.isLeader ? 0 : a.isLeader ? -1 : 1));
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
        <div className="flex items-center gap-2">
          {faction?.flag && (
            <img src={faction.flag} alt={faction.name} className="h-4 w-4 object-contain" />
          )}
          <div className="flex flex-col">
            <span className="text-xs font-medium tracking-wide text-text-muted uppercase">
              {label} ({totalCount})
            </span>
            {faction && (
              <span className="text-[10px] text-text-muted/70">{faction.name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onSearchChange && (
            <div className="relative">
              <input
                type="text"
                value={searchValue || ""}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search..."
                className="w-28 rounded-sm border border-border/50 bg-bg-tertiary px-2 py-0.5 pr-5 text-[10px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              {searchValue && (
                <button
                  onClick={() => onSearchChange("")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {Array.from(squads.entries()).map(([key, members]) => (
          <div key={key}>
            <div className="flex items-center justify-between bg-bg-tertiary/50 px-4 py-1">
              <span className="text-[10px] font-medium tracking-wide text-accent uppercase">
                {members[0].squad?.squadName || `Squad ${members[0].squadID}`} ({members.length})
              </span>
              {showActions && members[0].squadID && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onSwitchSquad(members[0].squad?.squadName || `Squad ${members[0].squadID}`, members)}
                    className="rounded-sm px-1.5 py-0.5 text-[9px] text-warning/70 transition-colors hover:bg-warning/10 hover:text-warning"
                    title="Switch entire squad to the other team"
                  >
                    Switch
                  </button>
                  <button
                    onClick={() => onDisbandSquad(String(members[0].teamID), String(members[0].squadID))}
                    className="rounded-sm px-1.5 py-0.5 text-[9px] text-danger/70 transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    Disband
                  </button>
                </div>
              )}
            </div>
            {members.map((p) => (
              <PlayerRow key={p.steamID || p.eosID} player={p} showActions={showActions} onWarn={onWarn} onKick={onKick} onSwitchTeam={onSwitchTeam} onSelect={onSelectPlayer} formatPlaytime={formatPlaytime} />
            ))}
          </div>
        ))}
        {noSquad.length > 0 && (
          <div>
            {squads.size > 0 && (
              <div className="bg-bg-tertiary/50 px-4 py-1 text-[10px] font-medium tracking-wide text-text-muted uppercase">
                Unassigned ({noSquad.length})
              </div>
            )}
            {noSquad.map((p) => (
              <PlayerRow key={p.steamID || p.eosID} player={p} showActions={showActions} onWarn={onWarn} onKick={onKick} onSwitchTeam={onSwitchTeam} onSelect={onSelectPlayer} formatPlaytime={formatPlaytime} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
