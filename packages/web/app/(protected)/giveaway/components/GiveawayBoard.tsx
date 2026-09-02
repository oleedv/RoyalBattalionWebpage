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

const COPY_COUNTS = [5, 10, 15, 20, 25, 50] as const;

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
  onAdjustTickets,
}: {
  snapshot: GiveawaySnapshot;
  displayName: (id: string) => string;
  onAdjustTickets?: (userId: string, delta: number) => Promise<{ success: boolean; error?: string }>;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("tickets");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [amount, setAmount] = useState("1");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adjustMsg, setAdjustMsg] = useState<string | null>(null);
  const [copyCount, setCopyCount] = useState<number | "all">(10);

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

  const copyLimit = copyCount === "all" ? snapshot.leaderboard.length : copyCount;
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
    top: snapshot.leaderboard.map((r) => ({
      userId: r.userId,
      displayName: displayName(r.userId),
      tickets: r.tickets,
      hours: r.hours,
      seed: r.seed,
      votes: r.votes,
    })),
  };

  async function adjust(userId: string, sign: 1 | -1) {
    if (!onAdjustTickets) return;
    const n = Math.trunc(Number(amount));
    if (!Number.isFinite(n) || n < 1) {
      setAdjustMsg("Amount must be a whole number of 1 or more");
      return;
    }
    setBusyId(userId);
    setAdjustMsg(null);
    try {
      const res = await onAdjustTickets(userId, sign * n);
      if (res.success) {
        const noun = n === 1 ? "ticket" : "tickets";
        setAdjustMsg(sign > 0 ? `Gave ${n} ${noun}.` : `Took ${n} ${noun}.`);
      } else {
        setAdjustMsg(res.error || "Request failed");
      }
    } finally {
      setBusyId(null);
    }
  }

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
          {onAdjustTickets && (
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              Adjust by
              <input
                type="number"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-16 rounded-sm border border-border bg-bg-tertiary/50 px-2 py-1 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
              />
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            Copy
            <select
              value={copyCount === "all" ? "all" : String(copyCount)}
              onChange={(e) => {
                const v = e.target.value;
                setCopyCount(v === "all" ? "all" : Number(v));
              }}
              className="rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-xs text-text-primary"
            >
              {COPY_COUNTS.map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
              <option value="all">All</option>
            </select>
          </label>
          <CopyButton label="Copy progress" text={buildProgressCopy(copyInput, copyLimit)} />
          <CopyButton
            label="Copy vote reminder"
            text={buildVoteReminderCopy(copyInput, copyLimit)}
            disabled={snapshot.giveaway.status === "open"}
          />
          <CopyButton
            label="Copy winner"
            text={buildWinnerCopy(copyInput, copyLimit)}
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
      {adjustMsg && <p className="text-sm text-text-secondary">{adjustMsg}</p>}

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
                  <td className="px-3 py-2">
                    <div className="font-medium text-accent">{r.tickets}</div>
                    {(r.bonusTickets ?? 0) !== 0 && (
                      <div className="text-[10px] uppercase tracking-wider text-text-muted">
                        {(r.bonusTickets ?? 0) > 0 ? `+${r.bonusTickets} staff` : `${r.bonusTickets} staff`}
                      </div>
                    )}
                    {onAdjustTickets && (
                      <div className="mt-1 flex gap-1">
                        <button
                          type="button"
                          disabled={busyId != null}
                          onClick={() => adjust(r.userId, 1)}
                          className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-text-secondary hover:border-accent/50 hover:text-text-primary disabled:opacity-40"
                        >
                          Give
                        </button>
                        <button
                          type="button"
                          disabled={busyId != null || r.tickets <= 0}
                          onClick={() => adjust(r.userId, -1)}
                          className="rounded-sm border border-border px-2 py-0.5 text-[11px] text-text-secondary hover:border-accent/50 hover:text-text-primary disabled:opacity-40"
                        >
                          Take
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
