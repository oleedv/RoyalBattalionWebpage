"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getSeedingConfig,
  updateSeedingConfig,
  getSeedingSessions,
  sendSeedingNow,
  getSeedingRapport,
  sendSeedingRapport,
  getSeedingServers,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type {
  SeedingConfig,
  SeedingSession,
  SeedingRapport as SeedingRapportType,
  SquadServerOption,
} from "shared";

function SessionBadge({ status }: { status: SeedingSession["status"] }) {
  const colors: Record<string, string> = {
    active: "bg-success/15 text-success border-success/30",
    completed: "bg-accent/15 text-accent border-accent/30",
    reset: "bg-text-muted/15 text-text-secondary border-text-muted/30",
    expired: "bg-danger/15 text-danger border-danger/30",
  };
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${colors[status] || colors.reset}`}>
      {status}
    </span>
  );
}

function formatMinutes(mins: number | null | undefined): string {
  if (mins == null) return "--";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  apiToken: string;
}

export function SeedingAdmin({ apiToken }: Props) {
  const [config, setConfig] = useState<SeedingConfig | null>(null);
  const [editConfig, setEditConfig] = useState<SeedingConfig | null>(null);
  const [servers, setServers] = useState<SquadServerOption[]>([]);
  const [sessions, setSessions] = useState<SeedingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // roleIds editor state
  const [roleIdInput, setRoleIdInput] = useState("");

  // Send Now state
  const [sendingNow, setSendingNow] = useState(false);
  const [sendNowMsg, setSendNowMsg] = useState<string | null>(null);

  // Rapport state
  const [rapportDate, setRapportDate] = useState(todayDateString());
  const [rapport, setRapport] = useState<SeedingRapportType | null>(null);
  const [rapportLoading, setRapportLoading] = useState(false);
  const [rapportError, setRapportError] = useState<string | null>(null);
  const [sendingRapport, setSendingRapport] = useState(false);
  const [rapportSendMsg, setRapportSendMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      getSeedingConfig(apiToken).then((res) => {
        if (res.success && res.data) {
          setConfig(res.data);
          setEditConfig(res.data);
        } else {
          setConfigError(res.error || "Failed to load seeding config");
        }
      }),
      getSeedingSessions(apiToken, 50).then((res) => {
        if (res.success && res.data) setSessions(res.data);
      }),
      getSeedingServers(apiToken).then((res) => {
        if (res.success && res.data) setServers(res.data);
      }),
    ]).finally(() => setLoading(false));
  }, [apiToken]);

  const isDirty = config && editConfig && JSON.stringify(config) !== JSON.stringify(editConfig);

  const refreshSeeding = useCallback(async () => {
    try {
      const [configRes, sessionsRes] = await Promise.all([
        getSeedingConfig(apiToken),
        getSeedingSessions(apiToken, 50),
      ]);
      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
        setEditConfig(configRes.data);
      }
      if (sessionsRes.success && sessionsRes.data) setSessions(sessionsRes.data);
    } catch { /* silent */ }
  }, [apiToken]);

  useAutoRefresh(refreshSeeding, 20_000, !isDirty && !saving);

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === "active") || null,
    [sessions]
  );

  async function handleSave() {
    if (!editConfig) return;
    setSaving(true);
    setSaveMsg(null);
    const res = await updateSeedingConfig(apiToken, editConfig);
    if (res.success) {
      setConfig(editConfig);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } else {
      setSaveMsg(res.error || "Save failed");
    }
    setSaving(false);
  }

  async function handleSendNow() {
    if (!confirm("Send seeding call now? This will ping the seeder role in Discord.")) return;
    setSendingNow(true);
    setSendNowMsg(null);
    const res = await sendSeedingNow(apiToken);
    if (res.success) {
      setSendNowMsg("Queued");
      setTimeout(() => setSendNowMsg(null), 3000);
    } else {
      setSendNowMsg(res.error || "Failed");
    }
    setSendingNow(false);
  }

  async function loadRapport(date: string) {
    setRapportLoading(true);
    setRapportError(null);
    const res = await getSeedingRapport(apiToken, date);
    if (res.success && res.data) {
      setRapport(res.data);
    } else {
      setRapportError(res.error || "Failed to load rapport");
      setRapport(null);
    }
    setRapportLoading(false);
  }

  async function handleSendRapport() {
    if (!rapport) return;
    if (!confirm(`Send seeding rapport for ${rapport.date} to the Discord seeding channel?`)) return;
    setSendingRapport(true);
    setRapportSendMsg(null);
    const res = await sendSeedingRapport(apiToken, rapport.date);
    if (res.success) {
      setRapportSendMsg("Queued");
      setTimeout(() => setRapportSendMsg(null), 3000);
    } else {
      setRapportSendMsg(res.error || "Failed");
    }
    setSendingRapport(false);
  }

  function addRoleId() {
    if (!editConfig) return;
    const trimmed = roleIdInput.trim();
    if (!trimmed || editConfig.roleIds.includes(trimmed)) return;
    setEditConfig({ ...editConfig, roleIds: [...editConfig.roleIds, trimmed] });
    setRoleIdInput("");
  }

  function removeRoleId(id: string) {
    if (!editConfig) return;
    setEditConfig({ ...editConfig, roleIds: editConfig.roleIds.filter((r) => r !== id) });
  }

  if (loading) return <div className="text-text-muted">Loading seeding admin data...</div>;

  return (
    <div className="space-y-8">
      {/* Config */}
      <section>
        <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Seeding Configuration
        </h2>

        {configError ? (
          <div className="facet-border rounded-sm bg-bg-card p-4 text-sm text-text-muted">{configError}</div>
        ) : editConfig ? (
          <div className="facet-border rounded-sm bg-bg-card p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Enabled */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Enabled</label>
                <button
                  onClick={() => setEditConfig({ ...editConfig, enabled: !editConfig.enabled })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${editConfig.enabled ? "bg-success" : "bg-bg-tertiary border border-border"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${editConfig.enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>

              {/* Tracker Enabled */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Tracker Enabled</label>
                <button
                  onClick={() => setEditConfig({ ...editConfig, trackerEnabled: !editConfig.trackerEnabled })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${editConfig.trackerEnabled ? "bg-success" : "bg-bg-tertiary border border-border"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${editConfig.trackerEnabled ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>

              {/* Seed Threshold */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Seed Threshold</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editConfig.seedThreshold}
                  onChange={(e) => setEditConfig({ ...editConfig, seedThreshold: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Reset Threshold */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Reset Threshold</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={editConfig.resetThreshold}
                  onChange={(e) => setEditConfig({ ...editConfig, resetThreshold: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Daily Time */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Daily Time</label>
                <input
                  type="text"
                  value={editConfig.dailyTime || ""}
                  onChange={(e) => setEditConfig({ ...editConfig, dailyTime: e.target.value || null })}
                  placeholder="e.g. 14:00"
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Timezone */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Timezone</label>
                <input
                  type="text"
                  value={editConfig.timezone || ""}
                  onChange={(e) => setEditConfig({ ...editConfig, timezone: e.target.value || null })}
                  placeholder="e.g. Europe/London"
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Channel ID */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Channel ID</label>
                <input
                  type="text"
                  value={editConfig.channelId || ""}
                  onChange={(e) => setEditConfig({ ...editConfig, channelId: e.target.value || null })}
                  placeholder="Discord channel ID"
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Announcer Server */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Announcer Server</label>
                <select
                  value={editConfig.announcerServerId ?? ""}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      announcerServerId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                >
                  <option value="">— none —</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tracker Server */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Tracker Server</label>
                <select
                  value={editConfig.trackerServerId ?? ""}
                  onChange={(e) =>
                    setEditConfig({
                      ...editConfig,
                      trackerServerId: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                >
                  <option value="">— none —</option>
                  {servers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Required Seed Days */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Required Seed Days</label>
                <input
                  type="number"
                  min={1}
                  value={editConfig.requiredSeedDays}
                  onChange={(e) => setEditConfig({ ...editConfig, requiredSeedDays: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Min Days for Progression Embed */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Min Days for Progression Embed</label>
                <input
                  type="number"
                  min={1}
                  value={editConfig.minProgressionDays}
                  onChange={(e) => setEditConfig({ ...editConfig, minProgressionDays: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Rolling Window Days */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Rolling Window (days)</label>
                <input
                  type="number"
                  min={1}
                  value={editConfig.rollingWindowDays}
                  onChange={(e) => setEditConfig({ ...editConfig, rollingWindowDays: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Whitelist Duration Days */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Whitelist Duration (days)</label>
                <input
                  type="number"
                  min={1}
                  value={editConfig.whitelistDurationDays}
                  onChange={(e) => setEditConfig({ ...editConfig, whitelistDurationDays: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Max Extension Days */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Max Extension (days)</label>
                <input
                  type="number"
                  min={0}
                  value={editConfig.maxExtensionDays}
                  onChange={(e) => setEditConfig({ ...editConfig, maxExtensionDays: Number(e.target.value) })}
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Progression Channel ID */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Progression Channel ID</label>
                <input
                  type="text"
                  value={editConfig.progressionChannelId || ""}
                  onChange={(e) => setEditConfig({ ...editConfig, progressionChannelId: e.target.value || null })}
                  placeholder="Discord channel ID"
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Leaderboard Channel ID */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Leaderboard Channel ID</label>
                <input
                  type="text"
                  value={editConfig.leaderboardChannelId || ""}
                  onChange={(e) => setEditConfig({ ...editConfig, leaderboardChannelId: e.target.value || null })}
                  placeholder="Discord channel ID"
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
                />
              </div>

              {/* Appreciation Channel ID */}
              <div>
                <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Seeder Appreciation Channel ID</label>
                <input
                  type="text"
                  value={editConfig.appreciationChannelId || ""}
                  onChange={(e) => setEditConfig({ ...editConfig, appreciationChannelId: e.target.value || null })}
                  placeholder="Discord channel ID"
                  className="w-full rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
                />
              </div>
            </div>

            {/* Role IDs editor */}
            <div className="mt-4">
              <label className="mb-2 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
                Seeder Role IDs
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={roleIdInput}
                  onChange={(e) => setRoleIdInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRoleId()}
                  placeholder="Discord role ID"
                  className="flex-1 rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent/50 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addRoleId}
                  disabled={!roleIdInput.trim()}
                  className="rounded-sm bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              {editConfig.roleIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {editConfig.roleIds.map((id) => (
                    <span
                      key={id}
                      className="flex items-center gap-1.5 rounded-sm border border-border bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary"
                    >
                      {id}
                      <button
                        type="button"
                        onClick={() => removeRoleId(id)}
                        className="text-text-muted transition-colors hover:text-danger"
                        aria-label={`Remove role ${id}`}
                      >
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 flex items-center gap-3 border-t border-border/50 pt-4">
              <button
                onClick={handleSave}
                disabled={saving || !isDirty}
                className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
              {isDirty && (
                <button
                  onClick={() => setEditConfig(config)}
                  className="rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-card-hover hover:text-text-primary"
                >
                  Reset
                </button>
              )}
              {saveMsg && (
                <span className={`text-xs font-medium ${saveMsg === "Saved" ? "text-success" : "text-danger"}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* Seeding Controls */}
      <section>
        <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Seeding Controls
        </h2>

        <div className="facet-border rounded-sm bg-bg-card p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Next Scheduled Call */}
            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Next Call</label>
              <div className="text-sm text-text-primary">
                {config?.dailyTime
                  ? `${config.dailyTime} ${config.timezone || "UTC"}`
                  : "Not configured"}
              </div>
            </div>

            {/* Active Session */}
            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Active Session</label>
              <div className="text-sm">
                {activeSession ? (
                  <span className="text-success">
                    Active - {activeSession.mapName || activeSession.layerName || "Unknown"} ({activeSession.peakPlayers ?? 0} peak)
                  </span>
                ) : (
                  <span className="text-text-muted">No active session</span>
                )}
              </div>
            </div>

            {/* Send Now */}
            <div className="flex items-end">
              <div>
                <button
                  onClick={handleSendNow}
                  disabled={sendingNow}
                  className="rounded-sm bg-success px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-success/90 disabled:opacity-50"
                >
                  {sendingNow ? "Sending..." : "Send Seeding Call Now"}
                </button>
                {sendNowMsg && (
                  <span className={`ml-2 text-xs font-medium ${sendNowMsg === "Queued" ? "text-success" : "text-danger"}`}>
                    {sendNowMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Seeding Rapport */}
      <section>
        <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Seeding Rapport
        </h2>

        <div className="facet-border rounded-sm bg-bg-card p-5">
          {/* Date picker + Load */}
          <div className="mb-4 flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Date</label>
              <input
                type="date"
                value={rapportDate}
                onChange={(e) => setRapportDate(e.target.value)}
                className="rounded-sm border border-border bg-bg-tertiary/50 px-3 py-2 text-sm text-text-primary focus:border-accent/50 focus:outline-none"
              />
            </div>
            <button
              onClick={() => loadRapport(rapportDate)}
              disabled={rapportLoading || !rapportDate}
              className="rounded-sm bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
            >
              {rapportLoading ? "Loading..." : "Load Rapport"}
            </button>
            {rapport && (
              <>
                <button
                  onClick={handleSendRapport}
                  disabled={sendingRapport}
                  className="rounded-sm border border-success bg-success/10 px-4 py-2 text-sm font-medium text-success transition-colors hover:bg-success/20 disabled:opacity-50"
                >
                  {sendingRapport ? "Sending..." : "Send to Discord"}
                </button>
                {rapportSendMsg && (
                  <span className={`text-xs font-medium ${rapportSendMsg === "Queued" ? "text-success" : "text-danger"}`}>
                    {rapportSendMsg}
                  </span>
                )}
              </>
            )}
          </div>

          {rapportError && (
            <div className="mb-4 text-sm text-danger">{rapportError}</div>
          )}

          {rapport && (
            <>
              {/* Summary Cards */}
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <div className="rounded-sm border border-border/50 bg-bg-tertiary/30 p-3">
                  <div className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Seeders</div>
                  <div className="mt-1 text-lg font-semibold text-text-primary">{rapport.totalSeeders}</div>
                </div>
                <div className="rounded-sm border border-border/50 bg-bg-tertiary/30 p-3">
                  <div className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Total Joins</div>
                  <div className="mt-1 text-lg font-semibold text-text-primary">{rapport.totalJoins}</div>
                </div>
                <div className="rounded-sm border border-border/50 bg-bg-tertiary/30 p-3">
                  <div className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Avg Seed Time</div>
                  <div className="mt-1 text-lg font-semibold text-text-primary">{formatMinutes(rapport.avgSeedMinutes)}</div>
                </div>
                <div className="rounded-sm border border-border/50 bg-bg-tertiary/30 p-3">
                  <div className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">Total Seed Time</div>
                  <div className="mt-1 text-lg font-semibold text-text-primary">{formatMinutes(rapport.totalSeedMinutes)}</div>
                </div>
              </div>

              {/* Seeders Table */}
              {rapport.seeders.length === 0 ? (
                <div className="py-6 text-center text-sm text-text-muted">No seeders found for this date</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Player</th>
                        <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Seed Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Session</th>
                        <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Joined</th>
                        <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rapport.seeders.map((s, i) => (
                        <tr key={`${s.playerName}-${s.joinTime ?? i}`} className="border-b border-border/30 last:border-0">
                          <td className="px-4 py-3 font-medium text-text-primary">{s.playerName}</td>
                          <td className="px-4 py-3 text-text-secondary">{formatMinutes(s.seedDurationMinutes)}</td>
                          <td className="px-4 py-3 text-text-secondary">{formatMinutes(s.sessionDurationMinutes)}</td>
                          <td className="px-4 py-3 text-text-muted">
                            {s.joinTime ? new Date(s.joinTime).toLocaleTimeString() : "--"}
                          </td>
                          <td className="px-4 py-3 text-text-muted">
                            {s.leaveTime ? new Date(s.leaveTime).toLocaleTimeString() : "--"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!rapport && !rapportLoading && !rapportError && (
            <div className="py-6 text-center text-sm text-text-muted">
              Select a date and click "Load Rapport" to view seeding data
            </div>
          )}
        </div>
      </section>

      {/* Session History */}
      <section>
        <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Session History
        </h2>

        {sessions.length === 0 ? (
          <div className="facet-border rounded-sm bg-bg-card px-5 py-8 text-center text-text-muted">
            No seeding sessions recorded
          </div>
        ) : (
          <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Map</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Layer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Started</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Start</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">Peak</th>
                    <th className="px-4 py-3 text-left text-xs font-medium tracking-[0.15em] text-text-muted uppercase">End</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr
                      key={s.id}
                      className={`border-b border-border/30 last:border-0 ${s.status === "active" ? "bg-success/5" : ""}`}
                    >
                      <td className="px-4 py-3"><SessionBadge status={s.status} /></td>
                      <td className="px-4 py-3 text-text-primary">{s.mapName || "--"}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.layerName || "--"}</td>
                      <td className="px-4 py-3 text-text-muted">{new Date(s.startedAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.durationMinutes != null ? `${s.durationMinutes}m` : "--"}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.startPlayers ?? "--"}</td>
                      <td className="px-4 py-3 font-medium text-text-primary">{s.peakPlayers ?? "--"}</td>
                      <td className="px-4 py-3 text-text-secondary">{s.endPlayers ?? "--"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
