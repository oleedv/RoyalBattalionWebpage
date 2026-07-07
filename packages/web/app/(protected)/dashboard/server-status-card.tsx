"use client";

import type { ServerStatus } from "@/lib/api-client";
import { StatusBadge } from "@/components/status-badge";
import { CapacityBar } from "@/components/capacity-bar";
import { MultiSparkline } from "@/components/sparkline";

const CONNECT_URLS: Record<string, string> = {
  "37.153.157.204:27050": "steam://connect/37.153.157.204:27050",
  "37.153.157.204:27060": "steam://connect/37.153.157.204:27060",
};

export default function ServerStatusCard({ server }: { server: ServerStatus }) {
  const isOnline = server.status === "online";
  const connectUrl = CONNECT_URLS[`${server.ip}:${server.port}`] ?? "#";
  const queue = server.publicQueue + server.reserveQueue;

  const playerData = server.metricHistory?.map((s) => s.playerCount) || [];
  const queueData =
    server.metricHistory?.map((s) => s.publicQueue + s.reserveQueue) || [];
  const hasTrend = playerData.length >= 2 || queueData.length >= 2;

  return (
    <div className="facet-border group rounded-sm bg-bg-card transition-colors hover:bg-bg-card-hover">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-medium tracking-[0.15em] text-text-muted uppercase">
            {server.name}
          </div>
          <StatusBadge variant={isOnline ? "server-online" : "server-offline"} />
        </div>

        <div className="mb-3 flex items-baseline gap-2">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-3xl font-bold tabular-nums text-text-primary">
              {server.players}
            </span>
            <span className="text-sm text-text-muted">/ {server.maxPlayers}</span>
          </div>
          {queue > 0 && (
            <span className="rounded-sm bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
              +{queue} queue
            </span>
          )}
        </div>

        <CapacityBar
          value={server.players}
          max={server.maxPlayers}
          className="mb-3"
        />

        <div className="flex items-center justify-between">
          <span className="text-sm text-text-secondary">{server.map}</span>
          <a
            href={connectUrl}
            className="text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100"
          >
            Connect
          </a>
        </div>
      </div>

      {hasTrend && (
        <div className="border-t border-border/30 px-4 pt-3 pb-3">
          <MultiSparkline
            series={[
              { values: playerData, label: "Players", className: "text-accent" },
              { values: queueData, label: "Queue", className: "text-warning" },
            ]}
            fixedMax={server.maxPlayers || 100}
          />
        </div>
      )}
    </div>
  );
}
