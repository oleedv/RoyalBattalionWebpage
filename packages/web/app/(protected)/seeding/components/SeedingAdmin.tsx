"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
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
import { SeedingConfigForm } from "./seeding-config-form";
import { SeedingControls } from "./seeding-controls";
import { SeedingRapportPanel } from "./seeding-rapport";
import { SeedingSessionHistory } from "./seeding-session-history";

export type SeedingAdminApi = {
  getSeedingConfig: typeof getSeedingConfig;
  updateSeedingConfig: typeof updateSeedingConfig;
  getSeedingSessions: typeof getSeedingSessions;
  sendSeedingNow: typeof sendSeedingNow;
  getSeedingRapport: typeof getSeedingRapport;
  sendSeedingRapport: typeof sendSeedingRapport;
  getSeedingServers: typeof getSeedingServers;
};

export type SeedingNotify = {
  success: (msg: string) => void;
  error: (msg: string) => void;
};

const defaultApi: SeedingAdminApi = {
  getSeedingConfig,
  updateSeedingConfig,
  getSeedingSessions,
  sendSeedingNow,
  getSeedingRapport,
  sendSeedingRapport,
  getSeedingServers,
};

const defaultNotify: SeedingNotify = {
  success: (m) => toast.success(m),
  error: (m) => toast.error(m),
};

function todayDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
      {children}
    </h2>
  );
}

export function SeedingAdmin({
  apiToken,
  api = defaultApi,
  notify = defaultNotify,
}: {
  apiToken: string;
  api?: SeedingAdminApi;
  notify?: SeedingNotify;
}) {
  const [config, setConfig] = useState<SeedingConfig | null>(null);
  const [editConfig, setEditConfig] = useState<SeedingConfig | null>(null);
  const [servers, setServers] = useState<SquadServerOption[]>([]);
  const [sessions, setSessions] = useState<SeedingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // Send Now state
  const [sendingNow, setSendingNow] = useState(false);

  // Rapport state
  const [rapportDate, setRapportDate] = useState(todayDateString());
  const [rapport, setRapport] = useState<SeedingRapportType | null>(null);
  const [rapportLoading, setRapportLoading] = useState(false);
  const [rapportError, setRapportError] = useState<string | null>(null);
  const [sendingRapport, setSendingRapport] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getSeedingConfig(apiToken).then((res) => {
        if (res.success && res.data) {
          setConfig(res.data);
          setEditConfig(res.data);
        } else {
          setConfigError(res.error || "Failed to load seeding config");
        }
      }),
      api.getSeedingSessions(apiToken, 50).then((res) => {
        if (res.success && res.data) setSessions(res.data);
      }),
      api.getSeedingServers(apiToken).then((res) => {
        if (res.success && res.data) setServers(res.data);
      }),
    ]).finally(() => setLoading(false));
  }, [apiToken, api]);

  const isDirty =
    config && editConfig && JSON.stringify(config) !== JSON.stringify(editConfig);

  const refreshSeeding = useCallback(async () => {
    try {
      const [configRes, sessionsRes] = await Promise.all([
        api.getSeedingConfig(apiToken),
        api.getSeedingSessions(apiToken, 50),
      ]);
      if (configRes.success && configRes.data) {
        setConfig(configRes.data);
        setEditConfig(configRes.data);
      }
      if (sessionsRes.success && sessionsRes.data) setSessions(sessionsRes.data);
    } catch {
      /* silent */
    }
  }, [apiToken, api]);

  useAutoRefresh(refreshSeeding, 20_000, !isDirty && !saving);

  const activeSession = useMemo(
    () => sessions.find((s) => s.status === "active") || null,
    [sessions],
  );

  async function handleSave() {
    if (!editConfig) return;
    setSaving(true);
    const res = await api.updateSeedingConfig(apiToken, editConfig);
    if (res.success) {
      setConfig(editConfig);
      notify.success("Saved");
    } else {
      notify.error(res.error || "Save failed");
    }
    setSaving(false);
  }

  async function confirmSendNow() {
    setSendingNow(true);
    const res = await api.sendSeedingNow(apiToken);
    if (res.success) {
      notify.success("Queued");
    } else {
      notify.error(res.error || "Failed");
    }
    setSendingNow(false);
  }

  async function loadRapport() {
    setRapportLoading(true);
    setRapportError(null);
    const res = await api.getSeedingRapport(apiToken, rapportDate);
    if (res.success && res.data) {
      setRapport(res.data);
    } else {
      setRapportError(res.error || "Failed to load rapport");
      setRapport(null);
    }
    setRapportLoading(false);
  }

  async function confirmSendRapport() {
    if (!rapport) return;
    setSendingRapport(true);
    const res = await api.sendSeedingRapport(apiToken, rapport.date);
    if (res.success) {
      notify.success("Queued");
    } else {
      notify.error(res.error || "Failed");
    }
    setSendingRapport(false);
  }

  if (loading)
    return <div className="text-text-muted">Loading seeding admin data...</div>;

  return (
    <div className="space-y-8">
      {/* Config */}
      <section>
        <SectionTitle>Seeding Configuration</SectionTitle>
        {configError ? (
          <div className="facet-border rounded-sm bg-bg-card p-4 text-sm text-text-muted">
            {configError}
          </div>
        ) : editConfig ? (
          <SeedingConfigForm
            config={editConfig}
            servers={servers}
            onChange={(patch) =>
              setEditConfig((prev) => (prev ? { ...prev, ...patch } : prev))
            }
            onSave={handleSave}
            onReset={() => setEditConfig(config)}
            saving={saving}
            isDirty={!!isDirty}
          />
        ) : null}
      </section>

      {/* Seeding Controls */}
      <section>
        <SectionTitle>Seeding Controls</SectionTitle>
        <SeedingControls
          config={config}
          activeSession={activeSession}
          onSendNow={confirmSendNow}
          sending={sendingNow}
        />
      </section>

      {/* Seeding Rapport */}
      <section>
        <SectionTitle>Seeding Rapport</SectionTitle>
        <SeedingRapportPanel
          date={rapportDate}
          onDateChange={setRapportDate}
          onLoad={loadRapport}
          loading={rapportLoading}
          error={rapportError}
          rapport={rapport}
          onSend={confirmSendRapport}
          sending={sendingRapport}
        />
      </section>

      {/* Session History */}
      <section>
        <SectionTitle>Session History</SectionTitle>
        <SeedingSessionHistory sessions={sessions} />
      </section>
    </div>
  );
}
