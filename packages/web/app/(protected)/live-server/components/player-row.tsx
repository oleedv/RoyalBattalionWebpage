"use client";

import React, { useState } from "react";
import type { Player } from "../lib/types";
import { formatRole } from "../lib/format-role";

interface PlayerRowProps {
  player: Player;
  showActions?: boolean;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
  onSelect: (p: Player) => void;
  formatPlaytime: (s?: number) => string;
}

export const PlayerRow = React.memo(function PlayerRow({
  player,
  showActions = false,
  onWarn,
  onKick,
  onSwitchTeam,
  onSelect,
  formatPlaytime,
}: PlayerRowProps) {
  const [hovered, setHovered] = useState(false);
  const pt = formatPlaytime(player.playtime);

  return (
    <div
      className="group flex items-center justify-between border-b border-border/30 px-4 py-1.5 transition-colors hover:bg-bg-tertiary/30"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-2 overflow-hidden">
        {typeof player.role === "string" && player.role.includes("_Cmd_") ? (
          <svg className="h-3 w-3 flex-shrink-0 text-accent" fill="currentColor" viewBox="0 0 20 20">
            <title>Commander</title>
            <path d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
          </svg>
        ) : player.isLeader ? (
          <svg className="h-3 w-3 flex-shrink-0 text-warning" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        ) : null}
        <button
          onClick={() => onSelect(player)}
          className="truncate text-xs text-text-primary hover:text-accent hover:underline"
        >
          {player.name}
        </button>
        {player.role && (
          <span className="flex-shrink-0 text-[10px] text-text-muted">{formatRole(player.role)}</span>
        )}
        {pt && (
          <span className="flex-shrink-0 rounded-sm bg-bg-tertiary px-1 py-0.5 text-[9px] text-text-muted">{pt}</span>
        )}
      </div>
      {showActions && hovered && (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onSwitchTeam(player)}
            className="rounded-sm border border-transparent px-1.5 py-0.5 text-[10px] text-accent transition-all hover:border-accent/30 hover:bg-accent/10"
            title="Switch team"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </button>
          <button
            onClick={() => onWarn(player)}
            className="rounded-sm border border-transparent px-1.5 py-0.5 text-[10px] text-warning transition-all hover:border-warning/30 hover:bg-warning/10"
          >
            Warn
          </button>
          <button
            onClick={() => onKick(player)}
            className="rounded-sm border border-transparent px-1.5 py-0.5 text-[10px] text-danger transition-all hover:border-danger/30 hover:bg-danger/10"
          >
            Kick
          </button>
        </div>
      )}
    </div>
  );
});
