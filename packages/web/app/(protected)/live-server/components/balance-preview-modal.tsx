"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import type { BalancePlan, BalanceRosterPlayer, TeamSkill } from "../lib/types";
import { formatMatchDuration, matchElapsedSeconds } from "../lib/format-match-duration";

type RosterView = "current" | "planned";

interface BalancePreviewModalProps {
  open: boolean;
  onClose: () => void;
  plan: BalancePlan | null;
  nowMs: number;
  team1Name?: string;
  team2Name?: string;
  onQueue: () => void;
}

function skillGap(plan: BalancePlan, which: "before" | "after"): string {
  if (which === "before") {
    if (plan.skillGapBefore != null) return String(plan.skillGapBefore);
    if (!plan.current) return "—";
    return Math.abs(plan.current.team1.skill - plan.current.team2.skill).toFixed(2);
  }
  if (plan.skillGapAfter != null) return String(plan.skillGapAfter);
  return Math.abs(plan.team1.skill - plan.team2.skill).toFixed(2);
}

function ratingClass(rating: number): string {
  if (rating >= 2) return "text-warning";
  if (rating >= 1.4) return "text-text-primary";
  if (rating < 0.7) return "text-text-muted/70";
  return "text-text-secondary";
}

function TeamBlock({
  team,
  label,
  faction,
  skill,
  players,
  view,
}: {
  team: 1 | 2;
  label: string;
  faction?: string;
  skill?: TeamSkill;
  players: BalanceRosterPlayer[];
  view: RosterView;
}) {
  const tone = team === 1 ? "text-blue-400" : "text-red-400";
  const border = team === 1 ? "border-blue-500/30" : "border-red-500/30";
  return (
    <div className={`flex min-h-0 flex-col rounded-sm border ${border} bg-bg-tertiary/40`}>
      <div className="flex items-baseline justify-between border-b border-border/50 px-3 py-2">
        <div>
          <div className={`text-xs font-medium tracking-wide uppercase ${tone}`}>{label}</div>
          {faction && <div className="text-[10px] text-text-muted">{faction}</div>}
        </div>
        <div className="text-right">
          <div className="text-sm text-text-primary">{skill?.count ?? players.length}</div>
          <div className="text-[10px] text-text-muted">skill {skill?.skill ?? "—"}</div>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {players.length === 0 ? (
          <div className="px-3 py-4 text-xs text-text-muted">No players</div>
        ) : (
          players.map((p) => {
            const dest = view === "current" ? p.toTeam : p.fromTeam;
            return (
              <div
                key={p.eosID}
                className={`flex items-center justify-between gap-2 border-b border-border/20 px-3 py-1 ${
                  p.moving ? "bg-warning/5" : ""
                }`}
              >
                <div className="min-w-0 truncate text-xs text-text-primary">
                  {p.clan && <span className="mr-1 text-accent">[{p.clan}]</span>}
                  {p.name}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {p.moving && (
                    <span className="text-[10px] font-medium text-warning">
                      {view === "current" ? `→ T${dest}` : `from T${dest}`}
                    </span>
                  )}
                  <span className={`w-10 text-right font-mono text-[11px] tabular-nums ${ratingClass(p.rating)}`}>
                    {p.rating.toFixed(2)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function BalancePreviewModal({
  open,
  onClose,
  plan,
  nowMs,
  team1Name,
  team2Name,
  onQueue,
}: BalancePreviewModalProps) {
  const [view, setView] = useState<RosterView>("current");
  const [moversOnly, setMoversOnly] = useState(false);

  useEffect(() => {
    if (!open) return;
    setView("current");
    setMoversOnly(false);
  }, [open]);

  const duration = plan
    ? formatMatchDuration(matchElapsedSeconds(plan.matchStartedAt, nowMs, plan.matchDurationSeconds))
    : "unknown";

  const lists = useMemo(() => {
    const roster = plan?.roster ?? [];
    const filtered = moversOnly ? roster.filter((p) => p.moving) : roster;
    const pick = (team: 1 | 2) =>
      filtered.filter((p) => (view === "current" ? p.fromTeam : p.toTeam) === team);
    return { t1: pick(1), t2: pick(2) };
  }, [plan, view, moversOnly]);

  return (
    <Modal open={open} onClose={onClose} className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden bg-bg-secondary p-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-display text-base font-semibold tracking-wide">Balance Teams</h3>
        {plan && (
          <div className="text-xs text-text-muted">
            Match {duration}
            <span className="mx-2 text-border">·</span>
            {plan.totalPlayers} players
            {plan.ratingStats && (
              <>
                <span className="mx-2 text-border">·</span>
                ratings {plan.ratingStats.min}–{plan.ratingStats.max} (mean {plan.ratingStats.mean})
              </>
            )}
          </div>
        )}
      </div>

      {!plan ? (
        <p className="text-sm text-text-muted">Computing balance plan...</p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-0.5">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-sm border border-border bg-bg-tertiary p-3">
              <div className="mb-2 text-[10px] font-medium tracking-wide text-text-muted uppercase">Current score</div>
              {plan.current ? (
                <>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="text-center">
                      <div className="font-display text-3xl font-semibold tabular-nums text-blue-400">
                        {plan.current.team1.skill}
                      </div>
                      <div className="mt-0.5 text-[11px] text-text-muted">
                        T1 · {plan.current.team1.count}
                        {team1Name ? ` · ${team1Name}` : ""}
                      </div>
                    </div>
                    <div className="text-xs text-text-muted">vs</div>
                    <div className="text-center">
                      <div className="font-display text-3xl font-semibold tabular-nums text-red-400">
                        {plan.current.team2.skill}
                      </div>
                      <div className="mt-0.5 text-[11px] text-text-muted">
                        T2 · {plan.current.team2.count}
                        {team2Name ? ` · ${team2Name}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 text-center text-xs text-warning">gap {skillGap(plan, "before")}</div>
                </>
              ) : (
                <div className="text-xs text-text-muted">Current score not reported by this SquadJS build.</div>
              )}
            </div>
            <div className="rounded-sm border border-sky-500/30 bg-sky-500/5 p-3">
              <div className="mb-2 text-[10px] font-medium tracking-wide text-text-muted uppercase">After this plan</div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="text-center">
                  <div className="font-display text-3xl font-semibold tabular-nums text-blue-400">
                    {plan.team1.skill}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-muted">T1 · {plan.team1.count}</div>
                </div>
                <div className="text-xs text-text-muted">vs</div>
                <div className="text-center">
                  <div className="font-display text-3xl font-semibold tabular-nums text-red-400">
                    {plan.team2.skill}
                  </div>
                  <div className="mt-0.5 text-[11px] text-text-muted">T2 · {plan.team2.count}</div>
                </div>
              </div>
              <div className="mt-2 text-center text-xs text-text-muted">gap {skillGap(plan, "after")}</div>
            </div>
          </div>

          <div className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-xs leading-relaxed text-text-secondary">
            <div className="mb-1 text-[10px] font-medium tracking-wide text-text-muted uppercase">How it works</div>
            Each player gets a combat rating from the last 30 days: kills + 0.5×revives − 0.5×deaths − 2×teamkills,
            per minute of non-seed play. New or thin data shrinks toward <span className="text-text-primary">1.00</span> (average).
            A strong regular lands around 2+. Same-team clans of 9 or fewer stay together; bigger clans split by squad
            so a home stack can actually be shared. The search equalizes total rating without going over 50 a side.
            Nothing moves until round end (voting).
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex rounded-sm border border-border">
              <button
                type="button"
                onClick={() => setView("current")}
                className={`px-3 py-1.5 text-xs ${
                  view === "current" ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:text-text-primary"
                }`}
              >
                Old teams
              </button>
              <button
                type="button"
                onClick={() => setView("planned")}
                className={`px-3 py-1.5 text-xs ${
                  view === "planned" ? "bg-bg-tertiary text-text-primary" : "text-text-muted hover:text-text-primary"
                }`}
              >
                New teams
              </button>
            </div>
            <label className="flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={moversOnly}
                onChange={(e) => setMoversOnly(e.target.checked)}
                className="accent-sky-500"
              />
              Movers only ({plan.moves.length})
            </label>
          </div>

          {plan.roster && plan.roster.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <TeamBlock
                team={1}
                label="Team 1"
                faction={team1Name}
                skill={view === "current" ? plan.current?.team1 : plan.team1}
                players={lists.t1}
                view={view}
              />
              <TeamBlock
                team={2}
                label="Team 2"
                faction={team2Name}
                skill={view === "current" ? plan.current?.team2 : plan.team2}
                players={lists.t2}
                view={view}
              />
            </div>
          ) : (
            <div>
              <div className="mb-1 text-xs text-text-muted">
                {plan.moves.length} of {plan.totalPlayers} players would move
              </div>
              {plan.moves.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-sm border border-border bg-bg-tertiary p-2 text-xs">
                  {plan.moves.map((m) => (
                    <div key={m.eosID} className="flex justify-between py-0.5">
                      <span className="truncate text-text-secondary">{m.name}</span>
                      <span className="ml-2 shrink-0 text-text-muted">
                        T{m.fromTeam} &rarr; T{m.toTeam}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-text-muted">
            Rating column is the balancer score (not Steam/TrueSkill). Recomputed fresh at round end; the list may
            change if people join or leave before then.
          </p>
        </div>
      )}

      <div className="mt-4 flex justify-end gap-3">
        <button
          onClick={onClose}
          className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
        >
          Cancel
        </button>
        <button
          onClick={onQueue}
          disabled={!plan}
          className="rounded-sm bg-sky-500 px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-sky-500/80 disabled:opacity-50"
          title="Queue this balance to run at the end of the current round"
        >
          Queue for round end
        </button>
      </div>
    </Modal>
  );
}
