"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getSquadJSEnvironments,
  getSquadJSPlugins,
  updateSquadJSPlugins,
  getSquadJSDescriptions,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { cn } from "@/lib/utils";
import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/skeleton";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { SearchInput } from "@/components/search-input";
import { StatusBadge } from "@/components/status-badge";
import { ConfigDiffDialog } from "@/components/config-diff-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { PluginField } from "./plugin-field";
import type { SquadJSPlugin, SquadJSPluginOptionValue } from "shared";

// ---------------------------------------------------------------------------
// DI contract
// ---------------------------------------------------------------------------

export type SquadJSConfigApi = {
  getSquadJSEnvironments: typeof getSquadJSEnvironments;
  getSquadJSPlugins: typeof getSquadJSPlugins;
  updateSquadJSPlugins: typeof updateSquadJSPlugins;
  getSquadJSDescriptions: typeof getSquadJSDescriptions;
};

export const defaultApi: SquadJSConfigApi = {
  getSquadJSEnvironments,
  getSquadJSPlugins,
  updateSquadJSPlugins,
  getSquadJSDescriptions,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SquadJSConfigView({
  token,
  permissions,
  api = defaultApi,
}: {
  token: string;
  permissions: string[];
  api?: SquadJSConfigApi;
}) {
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
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [fieldDescriptions, setFieldDescriptions] = useState<
    Record<string, Record<string, string>>
  >({});

  // Env-switch discard confirmation
  const [switchConfirmOpen, setSwitchConfirmOpen] = useState(false);
  const [pendingEnv, setPendingEnv] = useState<string | null>(null);

  const isDeveloper = permissions.includes("developer");
  const canView =
    isDeveloper ||
    permissions.includes("view:squadjs") ||
    permissions.includes("manage:squadjs");
  const canManage = isDeveloper || permissions.includes("manage:squadjs");

  // Load descriptions (optional / non-critical)
  useEffect(() => {
    async function loadDescriptions() {
      if (!token) return;
      try {
        const res = await api.getSquadJSDescriptions(token);
        if (res.success && res.data) {
          setDescriptions(res.data.descriptions);
          if (res.data.fieldDescriptions) {
            setFieldDescriptions(res.data.fieldDescriptions);
          }
        }
      } catch {
        // Non-critical, descriptions are optional
      }
    }
    loadDescriptions();
  }, [token, api]);

  // Load environments
  useEffect(() => {
    async function loadEnvs() {
      if (!token) return;
      try {
        const res = await api.getSquadJSEnvironments(token);
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
  }, [token, api]);

  // Load plugins when env changes
  useEffect(() => {
    async function loadPlugins() {
      if (!token || !activeEnv) return;
      setLoading(true);
      setError(null);
      setSaveSuccess(false);
      setSaveError(null);
      try {
        const res = await api.getSquadJSPlugins(token, activeEnv);
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
  }, [token, activeEnv, api]);

  function handlePluginChange(index: number, updated: SquadJSPlugin) {
    setPlugins((prev) => prev.map((p, i) => (i === index ? updated : p)));
    setSaveSuccess(false);
  }

  async function handleSave() {
    if (!token || !activeEnv) return;
    setSaving(true);
    setSaveError(null);
    const res = await api.updateSquadJSPlugins(token, activeEnv, plugins);
    if (res.success) {
      setOriginalPlugins(plugins);
      setSaveSuccess(true);
      setShowDiff(false);
    } else {
      setSaveError(res.error || "Failed to save");
    }
    setSaving(false);
  }

  const isDirty = JSON.stringify(plugins) !== JSON.stringify(originalPlugins);

  const refreshPlugins = useCallback(async () => {
    if (!token || !activeEnv) return;
    try {
      const res = await api.getSquadJSPlugins(token, activeEnv);
      if (res.success && res.data) {
        setPlugins(res.data.plugins);
        setOriginalPlugins(res.data.plugins);
      }
    } catch {
      /* silent */
    }
  }, [token, activeEnv, api]);

  useAutoRefresh(
    refreshPlugins,
    20_000,
    !!token && !!activeEnv && !isDirty && !saving && !showDiff,
  );

  // Environment switching (with unsaved-changes guard)
  function switchEnv(next: string) {
    setActiveEnv(next);
  }

  function handleEnvSelect(next: string) {
    if (next === activeEnv) return;
    if (isDirty) {
      setPendingEnv(next);
      setSwitchConfirmOpen(true);
    } else {
      switchEnv(next);
    }
  }

  function confirmEnvSwitch() {
    const n = pendingEnv;
    setPendingEnv(null);
    setSwitchConfirmOpen(false);
    if (n) switchEnv(n);
  }

  function cancelEnvSwitch() {
    setPendingEnv(null);
    setSwitchConfirmOpen(false);
  }

  // -----------------------------------------------------------------------
  // Gated / empty states
  // -----------------------------------------------------------------------

  if (!canView) {
    return (
      <AccessDeniedCard message="You do not have permission to view SquadJS configuration." />
    );
  }

  if (notConfigured) {
    return (
      <div>
        <PageHeader title="SquadJS Config" />
        <EmptyState message="GitHub integration is not configured. Set GITHUB_CONFIG_TOKEN in the API environment variables." />
      </div>
    );
  }

  if (error && !plugins.length) {
    return (
      <div>
        <PageHeader title="SquadJS Config" />
        <EmptyState message={error} />
      </div>
    );
  }

  const filtered = search
    ? plugins
        .map((p, i) => ({ plugin: p, index: i }))
        .filter(({ plugin }) =>
          plugin.plugin.toLowerCase().includes(search.toLowerCase()),
        )
    : plugins.map((p, i) => ({ plugin: p, index: i }));

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div>
      <PageHeader
        title="SquadJS Config"
        description="Edit plugin configuration. Saving commits to GitHub and triggers CI/CD."
        actions={
          canManage ? (
            <Button
              variant={isDirty ? "gold" : "outlineGold"}
              disabled={!isDirty || saving}
              onClick={() => setShowDiff(true)}
            >
              Review & Save
            </Button>
          ) : undefined
        }
      />

      {/* Environment switcher */}
      {environments.length > 1 && (
        <Tabs value={activeEnv ?? undefined} className="mb-6">
          <TabsList variant="line">
            {environments.map((env) => (
              <TabsTrigger
                key={env}
                value={env}
                className="capitalize"
                onClick={() => handleEnvSelect(env)}
              >
                {env}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      {/* Deploy notice */}
      <div className="mb-6 rounded-sm border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent">
        Saving commits to the GitHub repo and triggers CI/CD deployment
        automatically. SquadJS will restart with the updated config.
      </div>

      {saveSuccess && (
        <div className="mb-4 rounded-sm border border-success/20 bg-success/5 px-4 py-2.5 text-sm text-success">
          Configuration saved and committed to GitHub. CI/CD deployment
          triggered.
        </div>
      )}
      {saveError && (
        <div className="mb-4 rounded-sm border border-danger/20 bg-danger/5 px-4 py-2.5 text-sm text-danger">
          {saveError}
        </div>
      )}

      {loading && !plugins.length ? (
        <div>
          <div className="mb-6">
            <Skeleton className="h-8 w-full rounded-lg sm:w-80" />
          </div>
          <div className="mb-4">
            <Skeleton className="h-3 w-48" />
          </div>
          <SkeletonRegion className="space-y-4" label="Loading plugins…">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} pad="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded-sm" />
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-14" />
                  </div>
                  <Skeleton className="h-5 w-8 rounded-full" />
                </div>
              </SkeletonCard>
            ))}
          </SkeletonRegion>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="mb-6">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search plugins..."
              className="w-full sm:w-80"
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
                description={descriptions[plugin.plugin] || null}
                fieldDescs={fieldDescriptions[plugin.plugin] || {}}
                canManage={canManage}
                onChange={(updated) => handlePluginChange(index, updated)}
              />
            ))}
          </div>
        </>
      )}

      {/* Review + commit dialog */}
      <ConfigDiffDialog
        open={showDiff}
        onOpenChange={setShowDiff}
        original={originalPlugins}
        updated={plugins}
        environment={activeEnv ?? ""}
        onConfirm={handleSave}
        saving={saving}
        saveError={saveError}
      />

      {/* Discard-unsaved-changes confirmation on env switch */}
      <AlertDialog
        open={switchConfirmOpen}
        onOpenChange={(o) => {
          if (!o) cancelEnvSwitch();
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes to this environment&apos;s config.
              Switching will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmEnvSwitch}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ============================================================
// PLUGIN CARD
// ============================================================

function PluginCard({
  plugin,
  description,
  fieldDescs,
  canManage,
  onChange,
}: {
  plugin: SquadJSPlugin;
  description: string | null;
  fieldDescs: Record<string, string>;
  canManage: boolean;
  onChange: (updated: SquadJSPlugin) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const readOnly = !canManage;

  const optionKeys = Object.keys(plugin).filter(
    (k) => k !== "plugin" && k !== "enabled",
  );

  function handleFieldChange(key: string, value: SquadJSPluginOptionValue) {
    onChange({ ...plugin, [key]: value });
  }

  return (
    <div
      className={cn(
        "facet-border rounded-sm bg-bg-card transition-opacity",
        !plugin.enabled && "opacity-60",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`${collapsed ? "Expand" : "Collapse"} ${plugin.plugin}`}
            onClick={() => setCollapsed((c) => !c)}
            className="text-text-muted"
          >
            <svg
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                !collapsed && "rotate-90",
              )}
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
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display font-semibold tracking-wide text-text-primary">
                {plugin.plugin}
              </h3>
              {!plugin.enabled && (
                <StatusBadge tone="danger">Disabled</StatusBadge>
              )}
              {optionKeys.length > 0 && (
                <span className="text-[10px] text-text-muted">
                  {optionKeys.length} option{optionKeys.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            {description && (
              <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">
                {description}
              </p>
            )}
          </div>
        </div>
        {/* Enabled toggle */}
        <Switch
          aria-label={`Toggle ${plugin.plugin} enabled`}
          checked={plugin.enabled}
          onCheckedChange={(checked) => onChange({ ...plugin, enabled: checked })}
          disabled={!canManage}
        />
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
                description={fieldDescs[key] || null}
                readOnly={readOnly}
                onChange={(v) => handleFieldChange(key, v)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
