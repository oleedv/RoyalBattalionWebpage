"use client";

import { useEffect, useState } from "react";
import { getBirthdayConfig, updateBirthdayConfig } from "@/lib/api-client";
import type { ApiResponse, BirthdayConfig } from "shared";
import { toastError, toastSuccess } from "@/lib/toast";
import { ConfigCard } from "@/components/config-card";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/skeleton";

const DEFAULT_LOUNGE_CHANNEL_ID = "460898033794809856";

export interface BirthdayApi {
  get: (token: string) => Promise<ApiResponse<BirthdayConfig>>;
  update: (
    token: string,
    data: Partial<BirthdayConfig>,
  ) => Promise<ApiResponse<BirthdayConfig>>;
}

export interface BirthdayNotify {
  success: (message: string) => void;
  error: (error: string | null | undefined, fallback?: string) => void;
}

const defaultApi: BirthdayApi = {
  get: getBirthdayConfig,
  update: updateBirthdayConfig,
};
const defaultNotify: BirthdayNotify = {
  success: toastSuccess,
  error: toastError,
};

function withDefaultChannel(config: BirthdayConfig): BirthdayConfig {
  // Pre-fill the royal-lounge default when no channel is set yet.
  return { ...config, channelId: config.channelId ?? DEFAULT_LOUNGE_CHANNEL_ID };
}

export default function BirthdayAdminCard({
  token,
  api = defaultApi,
  notify = defaultNotify,
}: {
  token: string;
  api?: BirthdayApi;
  notify?: BirthdayNotify;
}) {
  const [config, setConfig] = useState<BirthdayConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(token).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setConfig(withDefaultChannel(res.data));
      } else {
        setLoadError(res.error || "Failed to load birthday config");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, api]);

  function handleEnabledChange(next: boolean) {
    setConfig((prev) =>
      prev ? { ...prev, enabled: next } : null,
    );
  }

  async function save() {
    if (!config || saving) return;
    setSaving(true);
    const res = await api.update(token, config);
    setSaving(false);
    if (res.success && res.data) {
      setConfig(withDefaultChannel(res.data));
      notify.success("Birthday settings saved.");
    } else {
      notify.error(res.error, "Failed to save birthday settings");
    }
  }

  return (
    <ConfigCard
      title="Birthday announcements"
      headerAction={
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Switch
            checked={config?.enabled ?? false}
            onCheckedChange={handleEnabledChange}
            disabled={!config}
            aria-label="Birthday announcements enabled"
          />
          Enabled
        </div>
      }
      footer={
        config ? (
          <Button variant="gold" size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        ) : undefined
      }
    >
      {!config ? (
        loadError ? (
          <p className="text-sm text-text-muted">{loadError}</p>
        ) : (
          <div
            className="grid gap-4 sm:grid-cols-3"
            role="status"
            aria-label="Loading birthday settings"
          >
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Channel ID
            </span>
            <Input
              type="text"
              value={config.channelId ?? ""}
              onChange={(e) =>
                setConfig((prev) =>
                  prev
                    ? {
                        ...prev,
                        channelId: e.target.value.trim() || null,
                      }
                    : null,
                )
              }
              placeholder={DEFAULT_LOUNGE_CHANNEL_ID}
              className="font-mono text-xs"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Post time
            </span>
            <Input
              type="time"
              value={config.postTime}
              onChange={(e) =>
                setConfig((prev) =>
                  prev ? { ...prev, postTime: e.target.value } : null,
                )
              }
              className="font-mono text-xs"
            />
          </label>
          <div>
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Timezone
            </span>
            <TimezoneCombobox
              value={config.timezone}
              onChange={(tz) =>
                setConfig((prev) =>
                  prev ? { ...prev, timezone: tz } : null,
                )
              }
            />
          </div>
        </div>
      )}
    </ConfigCard>
  );
}
