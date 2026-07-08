"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table-v2";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import type { SeedingSession } from "shared";

type Tone = "success" | "accent" | "neutral" | "danger";

/** Map a seeding-session status to its StatusBadge tone. */
function sessionTone(status: SeedingSession["status"]): Tone {
  switch (status) {
    case "active":
      return "success";
    case "completed":
      return "accent";
    case "expired":
      return "danger";
    default:
      return "neutral"; // reset
  }
}

const columns: ColumnDef<SeedingSession, unknown>[] = [
  {
    id: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge tone={sessionTone(row.original.status)}>
        {row.original.status}
      </StatusBadge>
    ),
  },
  {
    id: "map",
    header: "Map",
    cell: ({ row }) => (
      <span className="text-text-primary">{row.original.mapName || "--"}</span>
    ),
  },
  {
    id: "layer",
    header: "Layer",
    cell: ({ row }) => (
      <span className="text-text-secondary">{row.original.layerName || "--"}</span>
    ),
  },
  {
    id: "started",
    header: "Started",
    cell: ({ row }) => (
      <span className="text-text-muted">
        {new Date(row.original.startedAt).toLocaleString()}
      </span>
    ),
  },
  {
    id: "duration",
    header: "Duration",
    cell: ({ row }) => (
      <span className="text-text-secondary">
        {row.original.durationMinutes != null ? `${row.original.durationMinutes}m` : "--"}
      </span>
    ),
  },
  {
    id: "start",
    header: "Start",
    cell: ({ row }) => (
      <span className="text-text-secondary">{row.original.startPlayers ?? "--"}</span>
    ),
  },
  {
    id: "peak",
    header: "Peak",
    cell: ({ row }) => (
      <span className="font-medium text-text-primary">
        {row.original.peakPlayers ?? "--"}
      </span>
    ),
  },
  {
    id: "end",
    header: "End",
    cell: ({ row }) => (
      <span className="text-text-secondary">{row.original.endPlayers ?? "--"}</span>
    ),
  },
];

export function SeedingSessionHistory({ sessions }: { sessions: SeedingSession[] }) {
  return (
    <DataTable
      columns={columns}
      data={sessions}
      getRowId={(s) => String(s.id)}
      rowClassName={(row) => (row.status === "active" ? "bg-success/5" : undefined)}
      emptyState={<EmptyState message="No seeding sessions recorded" />}
    />
  );
}
