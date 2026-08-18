"use client";

import { useEffect, useState } from "react";
import { getProspectConfig, updateProspectConfig } from "@/lib/api-client";
import {
  DEFAULT_PROSPECT_CONFIG,
  formatVoteVerdict,
  type ProspectConfig,
} from "shared";
import { InfoTip } from "./InfoTip";

const TOOLTIPS: Record<string, string> = {
  voteStartHours: "Minimum in-game hours on our server before the bot will post a membership vote. Staff can still force a vote from the ticket.",
  voteAcceptHours: "Minimum in-game hours required to be accepted when the vote ends. The vote can start earlier; they cannot pass without this many hours.",
  periodDays: "How long a prospect period lasts, from start to automatic vote end. Independent of the deny cooldown.",
  cooldownDays: "How long a newly denied applicant must wait before applying again. Does not change cooldowns already on the list.",
  minYesVotes: "The vote needs at least this many Yes ballots. Unsure does not count.",
  minYesRate: "Of Yes + No ballots, at least this percent must be Yes. Unsure does not count.",
};

function FieldLabel({ label, tipKey }: { label: string; tipKey: keyof typeof TOOLTIPS }) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">{label}</span>
      <InfoTip label={label} text={TOOLTIPS[tipKey]} />
    </div>
  );
}

export function SettingsCard({ apiToken, canManage }: { apiToken: string; canManage: boolean }) {
  const [draft, setDraft] = useState<ProspectConfig>(DEFAULT_PROSPECT_CONFIG);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getProspectConfig(apiToken).then((res) => {
      if (res.success && res.data) setDraft(res.data);
      else setError(res.error || "Failed to load settings");
      setLoaded(true);
    });
  }, [apiToken]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await updateProspectConfig(apiToken, draft);
    setSaving(false);
    if (res.success && res.data) {
      setDraft(res.data);
      setSaved(true);
    } else {
      setError(res.error || "Failed to save settings");
    }
  }

  if (!loaded) {
    return <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-sm text-text-muted">Loading settings…</div>;
  }

  const yesSharePct = Math.round(draft.minYesRate * 100);
  const verdict = formatVoteVerdict(draft.minYesVotes, draft.minYesRate);

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">Prospect settings</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <FieldLabel label="Hours to start vote" tipKey="voteStartHours" />
          <input
            type="number"
            min={0}
            disabled={!canManage}
            value={draft.voteStartHours}
            onChange={(e) => setDraft((d) => ({ ...d, voteStartHours: Number(e.target.value) }))}
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none disabled:opacity-60"
          />
        </label>
        <label className="block">
          <FieldLabel label="Hours to accept" tipKey="voteAcceptHours" />
          <input
            type="number"
            min={0}
            disabled={!canManage}
            value={draft.voteAcceptHours}
            onChange={(e) => setDraft((d) => ({ ...d, voteAcceptHours: Number(e.target.value) }))}
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none disabled:opacity-60"
          />
        </label>
        <label className="block">
          <FieldLabel label="Prospect length (days)" tipKey="periodDays" />
          <input
            type="number"
            min={1}
            disabled={!canManage}
            value={draft.periodDays}
            onChange={(e) => setDraft((d) => ({ ...d, periodDays: Number(e.target.value) }))}
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none disabled:opacity-60"
          />
        </label>
        <label className="block">
          <FieldLabel label="Deny cooldown (days)" tipKey="cooldownDays" />
          <input
            type="number"
            min={1}
            disabled={!canManage}
            value={draft.cooldownDays}
            onChange={(e) => setDraft((d) => ({ ...d, cooldownDays: Number(e.target.value) }))}
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none disabled:opacity-60"
          />
        </label>
        <label className="block">
          <FieldLabel label="Minimum yes votes" tipKey="minYesVotes" />
          <input
            type="number"
            min={1}
            disabled={!canManage}
            value={draft.minYesVotes}
            onChange={(e) => setDraft((d) => ({ ...d, minYesVotes: Number(e.target.value) }))}
            className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none disabled:opacity-60"
          />
        </label>
        <label className="block">
          <FieldLabel label="Yes share" tipKey="minYesRate" />
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={100}
              disabled={!canManage}
              value={yesSharePct}
              onChange={(e) => setDraft((d) => ({ ...d, minYesRate: Number(e.target.value) / 100 }))}
              className="flex-1 accent-accent"
            />
            <input
              type="number"
              min={1}
              max={100}
              disabled={!canManage}
              value={yesSharePct}
              onChange={(e) => setDraft((d) => ({ ...d, minYesRate: Number(e.target.value) / 100 }))}
              className="w-16 rounded-sm border border-border bg-bg-tertiary/50 px-2 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none disabled:opacity-60"
            />
            <span className="text-xs text-text-muted">%</span>
          </div>
        </label>
      </div>

      <p className="mt-4 rounded-sm border border-border/60 bg-bg-tertiary/40 px-3 py-2 text-sm text-text-secondary">
        {verdict}
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {saved && !error && <p className="mt-3 text-sm text-success">Settings saved. The bot uses them on the next apply or vote check.</p>}

      {canManage && (
        <div className="mt-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-sm bg-accent px-4 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      )}
    </div>
  );
}
