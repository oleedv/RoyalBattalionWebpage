"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ServerStatus } from "@/lib/api-client";
import { StatusBadge } from "@/components/status-badge";

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ServerCard({
  config,
  status,
}: {
  config: { label: string; displayName: string };
  status: ServerStatus | null;
}) {
  const [showPlayers, setShowPlayers] = useState(false);
  const isOnline = status?.status === "online";

  return (
    <div className="facet-border w-full rounded-sm bg-bg-card">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-5">
        <div>
          <div className="mb-0.5 text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
            {config.label}
          </div>
          <div className="font-display text-lg font-semibold tracking-wide text-text-primary">
            {config.displayName}
          </div>
        </div>
        <StatusBadge variant={isOnline ? "server-online" : "server-offline"} />
      </div>

      {status && (
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                Players
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums text-text-primary">
                {status.players}
                <span className="text-base font-normal text-text-muted">
                  /{status.maxPlayers}
                </span>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                Current Map
              </div>
              <div className="font-mono text-sm text-text-primary">
                {status.map}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                Address
              </div>
              <div className="font-mono text-sm tabular-nums text-text-secondary">
                {status.ip}:{status.port}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{
                  width: `${(status.players / status.maxPlayers) * 100}%`,
                }}
              />
            </div>
          </div>

          {status.playerList.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPlayers(!showPlayers)}
                className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-accent"
              >
                <ChevronDown
                  className={`size-4 transition-transform duration-200 ${showPlayers ? "rotate-180" : ""}`}
                />
                {showPlayers
                  ? "Hide Players"
                  : `Show Players (${status.playerList.length})`}
              </button>

              {showPlayers && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-sm border border-border/50 bg-bg-primary/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                          Player
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.playerList.map((p, i) => (
                        <tr key={i} className="border-b border-border/20">
                          <td className="px-3 py-1.5 text-text-primary">
                            {p.name}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-text-secondary">
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
    </div>
  );
}
