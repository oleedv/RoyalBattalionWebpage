"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import type { SeedingConfig, SquadServerOption } from "shared";

/** Sentinel Select value for "no server" — Base UI treats "" as no selection. */
const NONE = "__none__";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
      {children}
    </span>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel>{label}</FieldLabel>
      <Input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function ServerSelect({
  label,
  value,
  servers,
  onChange,
}: {
  label: string;
  value: number | null;
  servers: SquadServerOption[];
  onChange: (v: number | null) => void;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value == null ? NONE : String(value)}
        onValueChange={(v) => {
          if (v == null) return;
          onChange(v === NONE ? null : Number(v));
        }}
      >
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— none —</SelectItem>
          {servers.map((s) => (
            <SelectItem key={s.id} value={String(s.id)}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SeedingConfigForm({
  config,
  servers,
  onChange,
  onSave,
  onReset,
  saving,
  isDirty,
}: {
  config: SeedingConfig;
  servers: SquadServerOption[];
  onChange: (patch: Partial<SeedingConfig>) => void;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
  isDirty: boolean;
}) {
  const [roleIdInput, setRoleIdInput] = useState("");

  function addRoleId() {
    const trimmed = roleIdInput.trim();
    if (!trimmed || config.roleIds.includes(trimmed)) return;
    onChange({ roleIds: [...config.roleIds, trimmed] });
    setRoleIdInput("");
  }

  function removeRoleId(id: string) {
    onChange({ roleIds: config.roleIds.filter((r) => r !== id) });
  }

  return (
    <div className="facet-border rounded-sm bg-bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Enabled */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
            Enabled
          </span>
          <Switch
            aria-label="Enabled"
            checked={config.enabled}
            onCheckedChange={(v) => onChange({ enabled: v })}
          />
        </div>

        {/* Tracker Enabled */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
            Tracker Enabled
          </span>
          <Switch
            aria-label="Tracker Enabled"
            checked={config.trackerEnabled}
            onCheckedChange={(v) => onChange({ trackerEnabled: v })}
          />
        </div>

        <NumberField
          label="Seed Threshold"
          value={config.seedThreshold}
          min={1}
          max={100}
          onChange={(n) => onChange({ seedThreshold: n })}
        />
        <NumberField
          label="Reset Threshold"
          value={config.resetThreshold}
          min={1}
          max={100}
          onChange={(n) => onChange({ resetThreshold: n })}
        />

        <TextField
          label="Daily Time"
          value={config.dailyTime || ""}
          placeholder="e.g. 14:00"
          onChange={(v) => onChange({ dailyTime: v || null })}
        />

        {/* Timezone */}
        <div>
          <FieldLabel>Timezone</FieldLabel>
          <TimezoneCombobox
            value={config.timezone || ""}
            onChange={(tz) => onChange({ timezone: tz || null })}
          />
        </div>

        <TextField
          label="Channel ID"
          value={config.channelId || ""}
          placeholder="Discord channel ID"
          onChange={(v) => onChange({ channelId: v || null })}
        />

        <ServerSelect
          label="Announcer Server"
          value={config.announcerServerId}
          servers={servers}
          onChange={(v) => onChange({ announcerServerId: v })}
        />
        <ServerSelect
          label="Tracker Server"
          value={config.trackerServerId}
          servers={servers}
          onChange={(v) => onChange({ trackerServerId: v })}
        />

        <NumberField
          label="Required Seed Days"
          value={config.requiredSeedDays}
          min={1}
          onChange={(n) => onChange({ requiredSeedDays: n })}
        />
        <NumberField
          label="Min Days for Progression Embed"
          value={config.minProgressionDays}
          min={1}
          onChange={(n) => onChange({ minProgressionDays: n })}
        />
        <NumberField
          label="Rolling Window (days)"
          value={config.rollingWindowDays}
          min={1}
          onChange={(n) => onChange({ rollingWindowDays: n })}
        />
        <NumberField
          label="Whitelist Duration (days)"
          value={config.whitelistDurationDays}
          min={1}
          onChange={(n) => onChange({ whitelistDurationDays: n })}
        />
        <NumberField
          label="Max Extension (days)"
          value={config.maxExtensionDays}
          min={0}
          onChange={(n) => onChange({ maxExtensionDays: n })}
        />

        <TextField
          label="Progression Channel ID"
          value={config.progressionChannelId || ""}
          placeholder="Discord channel ID"
          onChange={(v) => onChange({ progressionChannelId: v || null })}
        />
        <TextField
          label="Leaderboard Channel ID"
          value={config.leaderboardChannelId || ""}
          placeholder="Discord channel ID"
          onChange={(v) => onChange({ leaderboardChannelId: v || null })}
        />
        <TextField
          label="Seeder Appreciation Channel ID"
          value={config.appreciationChannelId || ""}
          placeholder="Discord channel ID"
          onChange={(v) => onChange({ appreciationChannelId: v || null })}
        />
      </div>

      {/* Role IDs editor */}
      <div className="mt-4">
        <span className="mb-2 block text-xs font-medium tracking-[0.1em] text-text-muted uppercase">
          Seeder Role IDs
        </span>
        <div className="flex gap-2">
          <Input
            aria-label="Seeder Role IDs"
            type="text"
            value={roleIdInput}
            onChange={(e) => setRoleIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRoleId();
              }
            }}
            placeholder="Discord role ID"
            className="flex-1"
          />
          <Button type="button" onClick={addRoleId} disabled={!roleIdInput.trim()}>
            Add
          </Button>
        </div>
        {config.roleIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {config.roleIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary py-0.5 pr-0.5 pl-2 text-xs text-text-secondary"
              >
                <span className="font-mono">{id}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeRoleId(id)}
                  aria-label={`Remove role ${id}`}
                  className="text-text-muted hover:text-danger"
                >
                  <X className="size-3" />
                </Button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Save / Reset */}
      <div className="mt-5 flex items-center gap-3 border-t border-border/50 pt-4">
        <Button onClick={onSave} disabled={saving || !isDirty}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        {isDirty && (
          <Button variant="outline" onClick={onReset}>
            Reset
          </Button>
        )}
      </div>
    </div>
  );
}
