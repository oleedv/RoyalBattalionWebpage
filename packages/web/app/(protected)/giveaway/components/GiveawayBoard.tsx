"use client";

import { useMemo, useState } from "react";
import type { GiveawaySnapshot } from "shared";
import { SearchInput } from "@/components/search-input";
import { buildLeaderboardCsv } from "@/lib/giveaway-csv";
import {
  buildProgressCopy,
  buildVoteReminderCopy,
  buildWinnerCopy,
} from "@/lib/giveaway-copy";

type SortKey = "tickets" | "hours" | "seed" | "votes" | "name";

function CopyButton({ label, text, disabled }: { label: string; text: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!text || disabled) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      disabled={disabled || !text}
      className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent/50 hover:text-text-primary disabled:opacity-40"
    >
      {copied ? "Copied" : label}
    </button>
  );
}

export function GiveawayBoard({
  snapshot,
  displayName,
}: {
  snapshot: GiveawaySnapshot;
  displayName: (id: string) => string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tickets");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggle(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = snapshot.leaderboard.filter((r) => {
      if (!q) return true;
      const name = displayName(r.userId).toLowerCase();
      return name.includes(q) || r.userId.includes(q) || (r.steamId || "").includes(q);
    });
    list = [...list].sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "name") return displayName(a.userId).localeCompare(displayName(b.userId)) * dir;
      return (a[sortKey] - b[sortKey]) * dir;
    });
    return list;
  }, [snapshot.leaderboard, search, sortKey, sortDir, displayName]);

  const copyInput = {
    prize: snapshot.giveaway.prize,
    monthLabel: snapshot.giveaway.monthLabel,
    drawAt: snapshot.giveaway.drawAt,
    entries: snapshot.leaderboard.length,
    totalTickets: snapshot.totalTickets,
    votesCast: snapshot.votesCast,
    votesPerVoter: snapshot.giveaway.votesPerVoter,
    voteWeight: snapshot.giveaway.voteWeight,
    winnerUserId: snapshot.giveaway.winnerUserId,
    winnerTickets: snapshot.leaderboard.find((r) => r.userId === snapshot.giveaway.winnerUserId)?.tickets ?? null,
    top: snapshot.leaderboard,
  };

  function downloadCsv() {
    const csv = buildLeaderboardCsv(snapshot.leaderboard);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `giveaway-${snapshot.giveaway.monthLabel.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = (key: SortKey, label: string) => (
    <th className="px-3 py-2 font-medium">
      <button type="button" onClick={() => toggle(key)} className="hover:text-text-primary">
        {label}
        {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Leaderboard
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton label="Copy progress" text={buildProgressCopy(copyInput)} />
          <CopyButton
            label="Copy vote reminder"
            text={buildVoteReminderCopy(copyInput)}
            disabled={snapshot.giveaway.status === "open"}
          />
          <CopyButton
            label="Copy winner"
            text={buildWinnerCopy(copyInput)}
            disabled={!snapshot.giveaway.winnerUserId}
          />
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent/50 hover:text-text-primary"
          >
            Download CSV
          </button>
        </div>
      </div>

      <SearchInput value={search} onChange={setSearch} placeholder="Search name or ID" className="max-w-sm" />

      <div className="facet-border overflow-x-auto rounded-sm bg-bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              {th("name", "Name")}
              {th("hours", "Hours")}
              {th("seed", "Seed")}
              {th("votes", "Votes")}
              {th("tickets", "Tickets")}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-text-muted">
                  No entries yet
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.userId} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 text-text-muted">
                    {snapshot.leaderboard.findIndex((x) => x.userId === r.userId) + 1}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-text-primary">{displayName(r.userId)}</div>
                    {r.manual && <div className="text-[10px] uppercase tracking-wider text-text-muted">Manual</div>}
                  </td>
                  <td className="px-3 py-2">{r.hours}</td>
                  <td className="px-3 py-2">{r.seed}</td>
                  <td className="px-3 py-2">{r.votes}</td>
                  <td className="px-3 py-2 font-medium text-accent">{r.tickets}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
