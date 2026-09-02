"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { GiveawayConfig, GiveawaySnapshot } from "shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  updateGiveawayConfig,
  updateActiveGiveaway,
  startGiveaway,
  openGiveawayVote,
  drawGiveaway,
  cancelGiveaway,
  addGiveawayEntry,
  adjustGiveawayTickets,
} from "@/lib/api-client";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function currentMonthLabel(): string {
  const now = new Date();
  return `${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
}

function lastDayOfMonthLocal(): string {
  const now = new Date();
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}T${pad(last.getHours())}:${pad(last.getMinutes())}`;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none";

export function GiveawayManage({
  apiToken,
  config,
  snapshot,
  onChanged,
  canManage,
  canAdjustTickets,
}: {
  apiToken: string;
  config: GiveawayConfig | null;
  snapshot: GiveawaySnapshot | null;
  onChanged: () => Promise<void>;
  canManage: boolean;
  canAdjustTickets: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [defaults, setDefaults] = useState<GiveawayConfig | null>(config);
  useEffect(() => setDefaults(config), [config]);

  const [prize, setPrize] = useState("");
  const [monthLabel, setMonthLabel] = useState(currentMonthLabel());
  const [drawAt, setDrawAt] = useState(lastDayOfMonthLocal());
  const [entryChannelId, setEntryChannelId] = useState(config?.defaultEntryChannelId || "");
  useEffect(() => {
    if (config?.defaultEntryChannelId) setEntryChannelId(config.defaultEntryChannelId);
  }, [config?.defaultEntryChannelId]);

  const [activePrize, setActivePrize] = useState(snapshot?.giveaway.prize || "");
  const [activeDraw, setActiveDraw] = useState(
    snapshot ? toLocalInput(snapshot.giveaway.drawAt) : "",
  );
  const [activeRules, setActiveRules] = useState({
    windowDays: snapshot?.giveaway.windowDays ?? 30,
    minHours: snapshot?.giveaway.minHours ?? 5,
    hoursWeight: snapshot?.giveaway.hoursWeight ?? 1,
    seedWeight: snapshot?.giveaway.seedWeight ?? 2,
    voteWeight: snapshot?.giveaway.voteWeight ?? 5,
    votesPerVoter: snapshot?.giveaway.votesPerVoter ?? 2,
  });
  useEffect(() => {
    if (!snapshot) return;
    setActivePrize(snapshot.giveaway.prize);
    setActiveDraw(toLocalInput(snapshot.giveaway.drawAt));
    setActiveRules({
      windowDays: snapshot.giveaway.windowDays,
      minHours: snapshot.giveaway.minHours,
      hoursWeight: snapshot.giveaway.hoursWeight,
      seedWeight: snapshot.giveaway.seedWeight,
      voteWeight: snapshot.giveaway.voteWeight,
      votesPerVoter: snapshot.giveaway.votesPerVoter,
    });
  }, [snapshot]);

  const [entryUserId, setEntryUserId] = useState("");
  const [entryHours, setEntryHours] = useState("0");
  const [entrySeed, setEntrySeed] = useState("0");
  const [ticketUserId, setTicketUserId] = useState("");
  const [ticketAmount, setTicketAmount] = useState("1");
  const [voteChannelId, setVoteChannelId] = useState(config?.defaultVoteChannelId || "");
  const [confirm, setConfirm] = useState<"draw" | "cancel" | null>(null);

  async function run(label: string, fn: () => Promise<{ success: boolean; error?: string }>) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      if (res.success) {
        setMsg(label);
        await onChanged();
      } else {
        setMsg(res.error || "Request failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-8">
      <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
        Manage
      </h2>

      {msg && <p className="text-sm text-text-secondary">{msg}</p>}

      {!snapshot && canManage && (
        <div className="facet-border rounded-sm bg-bg-card p-5 space-y-4">
          <div className="text-sm font-medium text-text-primary">Start giveaway</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Prize">
              <input className={inputClass} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Helldivers 2" />
            </Field>
            <Field label="Month label">
              <input className={inputClass} value={monthLabel} onChange={(e) => setMonthLabel(e.target.value)} />
            </Field>
            <Field label="Draw at">
              <input type="datetime-local" className={inputClass} value={drawAt} onChange={(e) => setDrawAt(e.target.value)} />
            </Field>
            <Field label="Entry channel ID">
              <input
                className={inputClass}
                value={entryChannelId}
                onChange={(e) => setEntryChannelId(e.target.value)}
                placeholder="Defaults from settings"
              />
            </Field>
          </div>
          <button
            type="button"
            disabled={busy || !prize.trim()}
            onClick={() =>
              run("Queued. The bot will post the entry message shortly.", () =>
                startGiveaway(apiToken, {
                  prize: prize.trim(),
                  monthLabel: monthLabel.trim() || undefined,
                  drawAt: drawAt ? new Date(drawAt).toISOString() : undefined,
                  entryChannelId: entryChannelId.trim() || undefined,
                }),
              )
            }
            className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-bg-primary hover:bg-accent-bright disabled:opacity-50"
          >
            Start giveaway
          </button>
        </div>
      )}

      {snapshot && canManage && (
        <div className="facet-border rounded-sm bg-bg-card p-5 space-y-4">
          <div className="text-sm font-medium text-text-primary">Actions</div>
          <div className="flex flex-wrap gap-2">
            {snapshot.giveaway.status === "open" && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run("Vote post queued.", () =>
                    openGiveawayVote(apiToken, voteChannelId.trim() || undefined),
                  )
                }
                className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-bg-primary hover:bg-accent-bright disabled:opacity-50"
              >
                Open vote
              </button>
            )}
            {(snapshot.giveaway.status === "open" || snapshot.giveaway.status === "voting") && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm("draw")}
                className="rounded-sm border border-border px-4 py-2 text-sm text-text-primary hover:border-accent/50 disabled:opacity-50"
              >
                Draw winner
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirm("cancel")}
              className="rounded-sm border border-danger/40 px-4 py-2 text-sm text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {snapshot.giveaway.status === "open" && (
            <Field label="Vote channel ID (optional)">
              <input
                className={`${inputClass} max-w-sm`}
                value={voteChannelId}
                onChange={(e) => setVoteChannelId(e.target.value)}
                placeholder="Defaults from settings or entry channel"
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="This giveaway prize">
              <input className={inputClass} value={activePrize} onChange={(e) => setActivePrize(e.target.value)} />
            </Field>
            <Field label="Draw at">
              <input type="datetime-local" className={inputClass} value={activeDraw} onChange={(e) => setActiveDraw(e.target.value)} />
            </Field>
            <Field label="Min hours">
              <input type="number" className={inputClass} value={activeRules.minHours} onChange={(e) => setActiveRules({ ...activeRules, minHours: Number(e.target.value) })} />
            </Field>
            <Field label="Window days">
              <input type="number" className={inputClass} value={activeRules.windowDays} onChange={(e) => setActiveRules({ ...activeRules, windowDays: Number(e.target.value) })} />
            </Field>
            <Field label="Hours weight">
              <input type="number" className={inputClass} value={activeRules.hoursWeight} onChange={(e) => setActiveRules({ ...activeRules, hoursWeight: Number(e.target.value) })} />
            </Field>
            <Field label="Seed weight">
              <input type="number" className={inputClass} value={activeRules.seedWeight} onChange={(e) => setActiveRules({ ...activeRules, seedWeight: Number(e.target.value) })} />
            </Field>
            <Field label="Vote weight">
              <input type="number" className={inputClass} value={activeRules.voteWeight} onChange={(e) => setActiveRules({ ...activeRules, voteWeight: Number(e.target.value) })} />
            </Field>
            <Field label="Votes per voter">
              <input type="number" className={inputClass} value={activeRules.votesPerVoter} onChange={(e) => setActiveRules({ ...activeRules, votesPerVoter: Number(e.target.value) })} />
            </Field>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run("Giveaway settings saved. Entry post will refresh.", () =>
                updateActiveGiveaway(apiToken, {
                  prize: activePrize.trim(),
                  drawAt: activeDraw ? new Date(activeDraw).toISOString() : undefined,
                  ...activeRules,
                }),
              )
            }
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-primary hover:border-accent/50 disabled:opacity-50"
          >
            Save this giveaway
          </button>

          <div className="border-t border-border pt-4">
            <div className="mb-3 text-sm font-medium text-text-primary">Add manual entry</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Discord user ID">
                <input className={inputClass} value={entryUserId} onChange={(e) => setEntryUserId(e.target.value)} placeholder="17–19 digit ID" />
              </Field>
              <Field label="Hours">
                <input type="number" className={inputClass} value={entryHours} onChange={(e) => setEntryHours(e.target.value)} />
              </Field>
              <Field label="Seed hours">
                <input type="number" className={inputClass} value={entrySeed} onChange={(e) => setEntrySeed(e.target.value)} />
              </Field>
            </div>
            <button
              type="button"
              disabled={busy || !entryUserId.trim()}
              onClick={() =>
                run("Manual entry queued.", () =>
                  addGiveawayEntry(apiToken, {
                    userId: entryUserId.trim(),
                    hours: Number(entryHours) || 0,
                    seed: Number(entrySeed) || 0,
                  }),
                )
              }
              className="mt-3 rounded-sm border border-border px-4 py-2 text-sm text-text-primary hover:border-accent/50 disabled:opacity-50"
            >
              Add entry
            </button>
          </div>
        </div>
      )}

      {snapshot && canAdjustTickets && (
        <div className="facet-border rounded-sm bg-bg-card p-5 space-y-4">
          <div className="text-sm font-medium text-text-primary">Give or take tickets</div>
          <p className="text-xs text-text-muted">
            Adds or subtracts from their current total. Playtime is left alone. Cannot go below zero.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Discord user ID">
              <input
                className={inputClass}
                value={ticketUserId}
                onChange={(e) => setTicketUserId(e.target.value)}
                placeholder="17–19 digit ID"
              />
            </Field>
            <Field label="Tickets">
              <input
                type="number"
                min={1}
                step={1}
                className={inputClass}
                value={ticketAmount}
                onChange={(e) => setTicketAmount(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !ticketUserId.trim()}
              onClick={() => {
                const n = Math.trunc(Number(ticketAmount));
                if (!Number.isFinite(n) || n < 1) {
                  setMsg("Amount must be a whole number of 1 or more");
                  return;
                }
                run(`Gave ${n} ticket${n === 1 ? "" : "s"}.`, () =>
                  adjustGiveawayTickets(apiToken, { userId: ticketUserId.trim(), delta: n }),
                );
              }}
              className="rounded-sm border border-border px-4 py-2 text-sm text-text-primary hover:border-accent/50 disabled:opacity-50"
            >
              Give tickets
            </button>
            <button
              type="button"
              disabled={busy || !ticketUserId.trim()}
              onClick={() => {
                const n = Math.trunc(Number(ticketAmount));
                if (!Number.isFinite(n) || n < 1) {
                  setMsg("Amount must be a whole number of 1 or more");
                  return;
                }
                run(`Took ${n} ticket${n === 1 ? "" : "s"}.`, () =>
                  adjustGiveawayTickets(apiToken, { userId: ticketUserId.trim(), delta: -n }),
                );
              }}
              className="rounded-sm border border-border px-4 py-2 text-sm text-text-primary hover:border-accent/50 disabled:opacity-50"
            >
              Take tickets
            </button>
          </div>
        </div>
      )}

      {defaults && canManage && (
        <div className="facet-border rounded-sm bg-bg-card p-5 space-y-4">
          <div className="text-sm font-medium text-text-primary">Defaults for next giveaway</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Default entry channel ID">
              <input
                className={inputClass}
                value={defaults.defaultEntryChannelId || ""}
                onChange={(e) => setDefaults({ ...defaults, defaultEntryChannelId: e.target.value || null })}
              />
            </Field>
            <Field label="Default vote channel ID">
              <input
                className={inputClass}
                value={defaults.defaultVoteChannelId || ""}
                onChange={(e) => setDefaults({ ...defaults, defaultVoteChannelId: e.target.value || null })}
              />
            </Field>
            <Field label="Min hours">
              <input type="number" className={inputClass} value={defaults.minHours} onChange={(e) => setDefaults({ ...defaults, minHours: Number(e.target.value) })} />
            </Field>
            <Field label="Window days">
              <input type="number" className={inputClass} value={defaults.windowDays} onChange={(e) => setDefaults({ ...defaults, windowDays: Number(e.target.value) })} />
            </Field>
            <Field label="Hours weight">
              <input type="number" className={inputClass} value={defaults.hoursWeight} onChange={(e) => setDefaults({ ...defaults, hoursWeight: Number(e.target.value) })} />
            </Field>
            <Field label="Seed weight">
              <input type="number" className={inputClass} value={defaults.seedWeight} onChange={(e) => setDefaults({ ...defaults, seedWeight: Number(e.target.value) })} />
            </Field>
            <Field label="Vote weight">
              <input type="number" className={inputClass} value={defaults.voteWeight} onChange={(e) => setDefaults({ ...defaults, voteWeight: Number(e.target.value) })} />
            </Field>
            <Field label="Votes per voter">
              <input type="number" className={inputClass} value={defaults.votesPerVoter} onChange={(e) => setDefaults({ ...defaults, votesPerVoter: Number(e.target.value) })} />
            </Field>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run("Defaults saved.", () =>
                updateGiveawayConfig(apiToken, {
                  ...defaults,
                  defaultEntryChannelId: defaults.defaultEntryChannelId || null,
                  defaultVoteChannelId: defaults.defaultVoteChannelId || null,
                }),
              )
            }
            className="rounded-sm border border-border px-4 py-2 text-sm text-text-primary hover:border-accent/50 disabled:opacity-50"
          >
            Save defaults
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirm === "draw"}
        onClose={() => setConfirm(null)}
        title="Draw the winner?"
        message="This posts the winner in Discord and cannot be undone. Run this when you are ready to close the month."
        confirmLabel="Draw winner"
        loading={busy}
        onConfirm={() => {
          setConfirm(null);
          run("Draw queued. The bot will post the winner shortly.", () => drawGiveaway(apiToken));
        }}
      />
      <ConfirmDialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        title="Cancel this giveaway?"
        message="The giveaway is marked cancelled and its Discord entry/vote posts are deleted. There is no undo."
        confirmLabel="Cancel giveaway"
        loading={busy}
        onConfirm={() => {
          setConfirm(null);
          run("Cancel queued.", () => cancelGiveaway(apiToken));
        }}
      />
    </section>
  );
}
