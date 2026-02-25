"use client";

import type { Player } from "../lib/types";
import { formatRole } from "../lib/format-role";
import { CopyableField } from "./copyable-field";

interface PlayerCardProps {
  player: Player;
  showActions: boolean;
  onClose: () => void;
  onWarn: (p: Player) => void;
  onKick: (p: Player) => void;
  onSwitchTeam: (p: Player) => void;
  formatPlaytime: (s?: number) => string;
}

export function PlayerCard({
  player,
  showActions,
  onClose,
  onWarn,
  onKick,
  onSwitchTeam,
  formatPlaytime,
}: PlayerCardProps) {
  const pt = formatPlaytime(player.playtime);

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-xs rounded-sm border border-border bg-bg-secondary p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-text-primary">{player.name}</span>
                {typeof player.role === "string" && player.role.includes("_Cmd_") ? (
                  <svg className="h-3 w-3 text-accent" fill="currentColor" viewBox="0 0 20 20">
                    <title>Commander</title>
                    <path d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                  </svg>
                ) : player.isLeader ? (
                  <svg className="h-3 w-3 text-warning" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ) : null}
              </div>
              {player.role && (
                <span className="text-[10px] text-text-muted">{formatRole(player.role)}</span>
              )}
            </div>
            <button onClick={onClose} className="text-text-muted hover:text-text-primary">x</button>
          </div>

          <div className="mb-3 space-y-1.5 rounded-sm border border-border/50 bg-bg-tertiary/50 p-2">
            {player.steamID && <CopyableField label="Steam ID" value={player.steamID} />}
            {player.eosID && <CopyableField label="EOS ID" value={player.eosID} />}
            {pt && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Playtime</span>
                <span className="text-xs text-text-secondary">{pt}</span>
              </div>
            )}
            {player.squad && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-muted">Squad</span>
                <span className="text-xs text-text-secondary">
                  {player.squad.squadName}
                  {player.squad.creatorName && (
                    <span className="text-text-muted"> (by {player.squad.creatorName})</span>
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-muted">Team</span>
              <span className={`text-xs font-medium ${String(player.teamID) === "1" ? "text-blue-400" : String(player.teamID) === "2" ? "text-red-400" : "text-text-muted"}`}>
                Team {player.teamID}
              </span>
            </div>
          </div>

          {showActions && (
            <div className="flex gap-2">
              <button
                onClick={() => { onSwitchTeam(player); onClose(); }}
                className="flex-1 rounded-sm border border-accent/20 py-1.5 text-xs text-accent transition-colors hover:bg-accent/10"
              >
                Switch Team
              </button>
              <button
                onClick={() => { onWarn(player); onClose(); }}
                className="flex-1 rounded-sm border border-warning/20 py-1.5 text-xs text-warning transition-colors hover:bg-warning/10"
              >
                Warn
              </button>
              <button
                onClick={() => { onKick(player); onClose(); }}
                className="flex-1 rounded-sm border border-danger/20 py-1.5 text-xs text-danger transition-colors hover:bg-danger/10"
              >
                Kick
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
