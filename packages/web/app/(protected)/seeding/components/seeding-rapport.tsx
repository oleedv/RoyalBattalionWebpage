"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table-v2";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SeedingRapport, SeedingRapportSeeder } from "shared";

export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null) return "--";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const seederColumns: ColumnDef<SeedingRapportSeeder, unknown>[] = [
  {
    id: "player",
    header: "Player",
    cell: ({ row }) => (
      <span className="font-medium text-text-primary">{row.original.playerName}</span>
    ),
  },
  {
    id: "seed",
    header: "Seed Time",
    cell: ({ row }) => (
      <span className="text-text-secondary">
        {formatMinutes(row.original.seedDurationMinutes)}
      </span>
    ),
  },
  {
    id: "session",
    header: "Session",
    cell: ({ row }) => (
      <span className="text-text-secondary">
        {formatMinutes(row.original.sessionDurationMinutes)}
      </span>
    ),
  },
  {
    id: "joined",
    header: "Joined",
    cell: ({ row }) => (
      <span className="text-text-muted">
        {row.original.joinTime
          ? new Date(row.original.joinTime).toLocaleTimeString()
          : "--"}
      </span>
    ),
  },
  {
    id: "left",
    header: "Left",
    cell: ({ row }) => (
      <span className="text-text-muted">
        {row.original.leaveTime
          ? new Date(row.original.leaveTime).toLocaleTimeString()
          : "--"}
      </span>
    ),
  },
];

export function SeedingRapportPanel({
  date,
  onDateChange,
  onLoad,
  loading,
  error,
  rapport,
  onSend,
  sending,
}: {
  date: string;
  onDateChange: (date: string) => void;
  onLoad: () => void;
  loading: boolean;
  error: string | null;
  rapport: SeedingRapport | null;
  onSend: () => void;
  sending: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      {/* Date picker + Load + Send */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
            Date
          </span>
          <Input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-auto"
          />
        </label>
        <Button onClick={onLoad} disabled={loading || !date}>
          {loading ? "Loading..." : "Load Rapport"}
        </Button>
        {rapport && (
          <Button
            variant="outlineGold"
            onClick={() => setConfirmOpen(true)}
            disabled={sending}
          >
            {sending ? "Sending..." : "Send to Discord"}
          </Button>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      {rapport && (
        <>
          {/* Summary Cards */}
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Seeders" value={rapport.totalSeeders} />
            <StatCard label="Total Joins" value={rapport.totalJoins} />
            <StatCard label="Avg Seed Time" value={formatMinutes(rapport.avgSeedMinutes)} />
            <StatCard label="Total Seed Time" value={formatMinutes(rapport.totalSeedMinutes)} />
          </div>

          {/* Seeders Table */}
          <DataTable
            columns={seederColumns}
            data={rapport.seeders}
            emptyState={<EmptyState message="No seeders found for this date" />}
          />
        </>
      )}

      {!rapport && !loading && !error && (
        <EmptyState message={'Select a date and click "Load Rapport" to view seeding data'} />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Send seeding rapport?</AlertDialogTitle>
            <AlertDialogDescription>
              {rapport
                ? `Send seeding rapport for ${rapport.date} to the Discord seeding channel?`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onSend();
              }}
            >
              Send rapport
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
