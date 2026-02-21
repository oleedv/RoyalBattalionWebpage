"use client";

import { useState, useEffect } from "react";
import {
  getSquadJSEnvironments,
  getSquadJSPlugins,
  updateSquadJSPlugins,
} from "@/lib/api-client";
import { usePermissions } from "@/lib/permission-context";
import type { SquadJSPlugin, SquadJSPluginOptionValue } from "shared";

export default function SquadJSConfigPage() {
  const { apiToken, hasPermission } = usePermissions();

  const [environments, setEnvironments] = useState<string[]>([]);
  const [activeEnv, setActiveEnv] = useState<string | null>(null);
  const [plugins, setPlugins] = useState<SquadJSPlugin[]>([]);
  const [originalPlugins, setOriginalPlugins] = useState<SquadJSPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [search, setSearch] = useState("");

  // Load environments
  useEffect(() => {
    async function loadEnvs() {
      if (!apiToken) return;
      try {
        const res = await getSquadJSEnvironments(apiToken);
        if (res.success && res.data) {
          setEnvironments(res.data.environments);
          if (res.data.environments.length > 0) {
            setActiveEnv(res.data.environments[0]);
          }
        } else if (res.error?.includes("not configured")) {
          setNotConfigured(true);
          setLoading(false);
        } else {
          setError(res.error || "Failed to load environments");
          setLoading(false);
        }
      } catch {
        setError("Failed to load environments");
        setLoading(false);
      }
    }
    loadEnvs();
  }, [apiToken]);

  // Load plugins when env changes
  useEffect(() => {
    async function loadPlugins() {
      if (!apiToken || !activeEnv) return;
      setLoading(true);
      setError(null);
      setSaveSuccess(false);
      setSaveError(null);
      try {
        const res = await getSquadJSPlugins(apiToken, activeEnv);
        if (res.success && res.data) {
          setPlugins(res.data.plugins);
          setOriginalPlugins(res.data.plugins);
        } else {
          setError(res.error || "Failed to load config");
        }
      } catch {
        setError("Failed to load config");
      } finally {
        setLoading(false);
      }
    }
    loadPlugins();
  }, [apiToken, activeEnv]);

  function handlePluginChange(index: number, updated: SquadJSPlugin) {
    setPlugins((prev) => prev.map((p, i) => (i === index ? updated : p)));
    setSaveSuccess(false);
  }

  async function handleSave() {
    if (!apiToken || !activeEnv) return;
    setSaving(true);
    setSaveError(null);
    const res = await updateSquadJSPlugins(apiToken, activeEnv, plugins);
    if (res.success) {
      setOriginalPlugins(plugins);
      setSaveSuccess(true);
      setShowDiff(false);
    } else {
      setSaveError(res.error || "Failed to save");
    }
    setSaving(false);
  }

  const isDirty =
    JSON.stringify(plugins) !== JSON.stringify(originalPlugins);

  if (!hasPermission("admin")) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  if (notConfigured) {
    return (
      <div>
        <h1 className="font-display mb-4 text-3xl font-bold tracking-wide">
          SquadJS Config
        </h1>
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <p className="text-text-secondary">
            GitHub integration is not configured. Set{" "}
            <code className="text-accent">GITHUB_CONFIG_TOKEN</code> in the API
            environment variables.
          </p>
        </div>
      </div>
    );
  }

  if (error && !plugins.length) {
    return (
      <div>
        <h1 className="font-display mb-4 text-3xl font-bold tracking-wide">
          SquadJS Config
        </h1>
        <div className="text-danger">{error}</div>
      </div>
    );
  }

  const filtered = search
    ? plugins
        .map((p, i) => ({ plugin: p, index: i }))
        .filter(({ plugin }) =>
          plugin.plugin.toLowerCase().includes(search.toLowerCase())
        )
    : plugins.map((p, i) => ({ plugin: p, index: i }));

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide">
            SquadJS Config
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Edit plugin configuration. Saving commits to GitHub and triggers CI/CD.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="text-xs text-warning">Unsaved changes</span>
          )}
          <button
            onClick={() => setShowDiff(true)}
            disabled={!isDirty || saving}
            className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-40"
          >
            Review & Save
          </button>
        </div>
      </div>

      {/* Environment tabs */}
      {environments.length > 1 && (
        <div className="mb-6 flex gap-1 border-b border-border">
          {environments.map((env) => (
            <button
              key={env}
              onClick={() => {
                if (isDirty && !confirm("You have unsaved changes. Switch environment?")) return;
                setActiveEnv(env);
              }}
              className={`relative px-5 py-2.5 text-sm font-medium tracking-wide capitalize transition-colors ${
                activeEnv === env
                  ? "text-accent"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {env}
              {activeEnv === env && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Deploy notice */}
      <div className="mb-6 rounded-sm border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent">
        Saving commits to the GitHub repo and triggers CI/CD deployment automatically.
        SquadJS will restart with the updated config.
      </div>

      {saveSuccess && (
        <div className="mb-4 rounded-sm border border-success/20 bg-success/5 px-4 py-2.5 text-sm text-success">
          Configuration saved and committed to GitHub. CI/CD deployment triggered.
        </div>
      )}
      {saveError && (
        <div className="mb-4 rounded-sm border border-danger/20 bg-danger/5 px-4 py-2.5 text-sm text-danger">
          {saveError}
        </div>
      )}

      {loading ? (
        <div className="text-text-secondary">Loading plugins...</div>
      ) : (
        <>
          {/* Search */}
          <div className="mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plugins..."
              className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none sm:w-80"
            />
          </div>

          {/* Plugin summary */}
          <div className="mb-4 flex gap-3 text-xs text-text-muted">
            <span>{plugins.filter((p) => p.enabled).length} enabled</span>
            <span className="text-border">|</span>
            <span>{plugins.filter((p) => !p.enabled).length} disabled</span>
            <span className="text-border">|</span>
            <span>{plugins.length} total</span>
          </div>

          <div className="space-y-4">
            {filtered.map(({ plugin, index }) => (
              <PluginCard
                key={`${activeEnv}-${plugin.plugin}`}
                plugin={plugin}
                onChange={(updated) => handlePluginChange(index, updated)}
              />
            ))}
          </div>
        </>
      )}

      {showDiff && (
        <DiffModal
          original={originalPlugins}
          updated={plugins}
          environment={activeEnv || ""}
          onConfirm={handleSave}
          onCancel={() => setShowDiff(false)}
          saving={saving}
          saveError={saveError}
        />
      )}
    </div>
  );
}

// ============================================================
// PLUGIN CARD
// ============================================================

function PluginCard({
  plugin,
  onChange,
}: {
  plugin: SquadJSPlugin;
  onChange: (updated: SquadJSPlugin) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);

  const optionKeys = Object.keys(plugin).filter(
    (k) => k !== "plugin" && k !== "enabled"
  );

  function handleFieldChange(key: string, value: SquadJSPluginOptionValue) {
    onChange({ ...plugin, [key]: value });
  }

  function toggleEnabled() {
    onChange({ ...plugin, enabled: !plugin.enabled });
  }

  return (
    <div
      className={`facet-border rounded-sm bg-bg-card transition-opacity ${
        !plugin.enabled ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex h-5 w-5 items-center justify-center rounded-sm text-text-muted transition-colors hover:text-text-primary"
          >
            <svg
              className={`h-3.5 w-3.5 transition-transform ${
                collapsed ? "" : "rotate-90"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
          <h3 className="font-display font-semibold tracking-wide text-text-primary">
            {plugin.plugin}
          </h3>
          {!plugin.enabled && (
            <span className="rounded-sm border border-danger/20 bg-danger/5 px-2 py-0.5 text-[10px] font-medium text-danger">
              DISABLED
            </span>
          )}
          {optionKeys.length > 0 && (
            <span className="text-[10px] text-text-muted">
              {optionKeys.length} option{optionKeys.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {/* Enabled toggle */}
        <button
          onClick={toggleEnabled}
          className={`relative h-5 w-9 rounded-full transition-colors ${
            plugin.enabled
              ? "bg-accent"
              : "border border-border bg-bg-tertiary"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              plugin.enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Body */}
      {!collapsed && optionKeys.length > 0 && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <div className="space-y-3">
            {optionKeys.map((key) => (
              <PluginField
                key={key}
                fieldKey={key}
                value={plugin[key] as SquadJSPluginOptionValue}
                onChange={(v) => handleFieldChange(key, v)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// PLUGIN FIELD
// ============================================================

function PluginField({
  fieldKey,
  value,
  onChange,
}: {
  fieldKey: string;
  value: SquadJSPluginOptionValue;
  onChange: (value: SquadJSPluginOptionValue) => void;
}) {
  const isComplex = typeof value === "object" && value !== null;
  const [jsonText, setJsonText] = useState(
    isComplex ? JSON.stringify(value, null, 2) : ""
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  function handleJsonChange(text: string) {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      onChange(parsed);
    } catch {
      setJsonError("Invalid JSON");
    }
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
        {fieldKey}
      </label>
      {typeof value === "boolean" ? (
        <button
          onClick={() => onChange(!value)}
          className={`rounded-sm border px-3 py-1 text-xs font-medium transition-colors ${
            value
              ? "border-accent/30 bg-accent/10 text-accent"
              : "border-border bg-bg-tertiary text-text-muted"
          }`}
        >
          {value ? "true" : "false"}
        </button>
      ) : typeof value === "number" ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full max-w-xs rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
        />
      ) : isComplex ? (
        <div>
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={Math.min(10, Math.max(3, jsonText.split("\n").length + 1))}
            className={`w-full rounded-sm border bg-bg-tertiary px-3 py-2 font-mono text-xs text-text-primary focus:outline-none ${
              jsonError
                ? "border-danger focus:border-danger"
                : "border-border focus:border-accent"
            }`}
          />
          {jsonError && (
            <p className="mt-1 text-xs text-danger">{jsonError}</p>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={value === null ? "" : String(value)}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : e.target.value)
          }
          placeholder={value === null ? "null" : ""}
          className="w-full rounded-sm border border-border bg-bg-tertiary px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
      )}
    </div>
  );
}

// ============================================================
// DIFF MODAL
// ============================================================

function DiffModal({
  original,
  updated,
  environment,
  onConfirm,
  onCancel,
  saving,
  saveError,
}: {
  original: SquadJSPlugin[];
  updated: SquadJSPlugin[];
  environment: string;
  onConfirm: () => void;
  onCancel: () => void;
  saving: boolean;
  saveError: string | null;
}) {
  const changedPlugins = updated
    .filter((p, i) => JSON.stringify(p) !== JSON.stringify(original[i]))
    .map((p) => p.plugin);

  const diffEntries = changedPlugins.map((name) => {
    const origIdx = original.findIndex((p) => p.plugin === name);
    const updIdx = updated.findIndex((p) => p.plugin === name);
    return {
      name,
      before: origIdx >= 0 ? JSON.stringify(original[origIdx], null, 2) : "",
      after: updIdx >= 0 ? JSON.stringify(updated[updIdx], null, 2) : "",
    };
  });

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="flex w-full max-w-5xl flex-col rounded-sm border border-border bg-bg-secondary"
          style={{ maxHeight: "90vh" }}
        >
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-semibold tracking-wide">
                Review Changes
              </h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                <span className="capitalize">{environment}</span> --{" "}
                {changedPlugins.length} plugin
                {changedPlugins.length !== 1 ? "s" : ""} modified:{" "}
                {changedPlugins.join(", ")}
              </p>
            </div>
            <button
              onClick={onCancel}
              className="text-text-muted hover:text-text-primary"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Deploy notice */}
          <div className="border-b border-accent/20 bg-accent/5 px-6 py-3 text-xs text-accent">
            This will commit to the <strong>main</strong> branch and trigger
            CI/CD deployment for <strong className="capitalize">{environment}</strong>.
          </div>

          {/* Diff view */}
          <div className="flex-1 overflow-auto px-6 py-4">
            {diffEntries.map((entry) => (
              <div key={entry.name} className="mb-6">
                <h3 className="mb-2 font-display text-sm font-semibold tracking-wide text-text-primary">
                  {entry.name}
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                      Before
                    </p>
                    <pre className="rounded-sm border border-border bg-bg-tertiary p-3 font-mono text-xs text-text-secondary whitespace-pre-wrap">
                      {entry.before}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.15em] text-text-muted">
                      After
                    </p>
                    <pre className="rounded-sm border border-accent/20 bg-bg-tertiary p-3 font-mono text-xs text-text-primary whitespace-pre-wrap">
                      {entry.after}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {saveError && (
            <div className="border-t border-danger/20 bg-danger/5 px-6 py-3 text-xs text-danger">
              {saveError}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
            <button
              onClick={onCancel}
              className="rounded-sm border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={saving}
              className="rounded-sm bg-accent px-5 py-2 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-muted disabled:opacity-50"
            >
              {saving ? "Committing..." : "Commit & Deploy"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
