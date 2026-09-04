"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTempVoiceOverview,
  getTempVoiceEvents,
  getTempVoicePresets,
  updateTempVoiceConfig,
  queueTempVoiceAction,
  updateTempVoicePreset,
  createTempVoicePreset,
  clearTempVoicePreset,
} from "@/lib/api-client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useDiscordNameMap } from "@/hooks/use-discord-names";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton, SkeletonCard, SkeletonRegion, SkeletonStatCard } from "@/components/skeleton";
import { formatDateTime } from "@/lib/format";
import type {
  TempVoiceChannel,
  TempVoiceConfig,
  TempVoiceEvent,
  TempVoiceEventType,
  TempVoiceManageOp,
  TempVoiceOverview,
  TempVoicePreset,
  TempVoicePresetPatch,
} from "shared";
import {
  BITRATE_OPTIONS,
  EVENT_LABELS,
  REGION_LABELS,
  formatChannelAge,
  formatKbps,
  occupancyLabel,
} from "./labels";

type Filter = "all" | "live" | "idle" | "locked" | "invisible" | "dnd";

type FloorItem = {
  key: string;
  kind: "live" | "idle";
  ownerId: string;
  name: string;
  userLimit: number;
  bitrate: number | null;
  region: string | null;
  isLocked: boolean;
  isInvisible: boolean;
  isChatClosed: boolean;
  isDnd: boolean;
  memberCount: number;
  updatedAt: string;
  channel?: TempVoiceChannel;
  preset?: TempVoicePreset;
};

function OccupancyTrack({ count, limit }: { count: number; limit: number }) {
  const slots = limit > 0 ? Math.min(limit, 16) : Math.min(Math.max(count, 4), 12);
  const filled = Math.min(count, slots);
  return (
    <div className="flex items-center gap-1" title={occupancyLabel(count, limit)}>
      <div className="flex h-2.5 overflow-hidden rounded-sm border border-border">
        {Array.from({ length: slots }).map((_, i) => (
          <span
            key={i}
            className={`h-full w-2 ${i < filled ? "bg-accent" : "bg-bg-tertiary"}`}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] text-text-secondary">
        {occupancyLabel(count, limit)}
      </span>
    </div>
  );
}

function Flag({ on, label }: { on: boolean; label: string }) {
  if (!on) return null;
  return (
    <span className="rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent uppercase">
      {label}
    </span>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="facet-border rounded-sm bg-bg-card p-4">
      <div className="text-[10px] font-medium tracking-[0.18em] text-text-muted uppercase">
        {label}
      </div>
      <div className="font-display mt-1 text-2xl font-bold text-text-primary">{value}</div>
      {hint && <div className="mt-1 text-[11px] text-text-muted">{hint}</div>}
    </div>
  );
}

function HourStrip({ hours }: { hours: number[] }) {
  const max = Math.max(...hours, 1);
  return (
    <div className="flex h-10 items-end gap-px" title="Channels created per hour today">
      {hours.map((n, i) => (
        <div
          key={i}
          className="flex-1 bg-accent/80"
          style={{ height: `${Math.max(8, (n / max) * 100)}%`, opacity: n ? 1 : 0.2 }}
          title={`${String(i).padStart(2, "0")}:00 — ${n}`}
        />
      ))}
    </div>
  );
}

function discordChannelUrl(guildId: string | null, channelId: string): string | null {
  if (!guildId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

export function TempVoiceView({
  apiToken,
  canManage,
}: {
  apiToken: string;
  canManage: boolean;
}) {
  const [overview, setOverview] = useState<TempVoiceOverview | null>(null);
  const [events, setEvents] = useState<TempVoiceEvent[]>([]);
  const [eventTotal, setEventTotal] = useState(0);
  const [presets, setPresets] = useState<TempVoicePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { resolveNames, displayName } = useDiscordNameMap(apiToken);

  const loadOverview = useCallback(async () => {
    const res = await getTempVoiceOverview(apiToken);
    if (res.success && res.data) {
      setOverview(res.data);
      const ids = res.data.channels.flatMap((ch) => [
        ch.ownerId,
        ...ch.memberIds,
        ...ch.trustedIds,
        ...ch.blockedIds,
      ]);
      resolveNames(ids);
    } else {
      setError(res.error || "Failed to load temp voice");
    }
  }, [apiToken, resolveNames]);

  const loadEvents = useCallback(async () => {
    const res = await getTempVoiceEvents(apiToken, {
      limit: 40,
      page: 1,
      type: eventType || undefined,
      search: eventSearch || undefined,
    });
    if (res.success && res.data) {
      setEvents(res.data.items);
      setEventTotal(res.data.total);
      resolveNames(res.data.items.flatMap((e) => [e.actorId, e.ownerId].filter(Boolean) as string[]));
    }
  }, [apiToken, eventType, eventSearch, resolveNames]);

  const loadPresets = useCallback(async () => {
    const res = await getTempVoicePresets(apiToken);
    if (res.success && res.data) {
      setPresets(res.data);
      resolveNames(res.data.map((p) => p.userId));
    }
  }, [apiToken, resolveNames]);

  useEffect(() => {
    Promise.all([loadOverview(), loadEvents(), loadPresets()]).finally(() => setLoading(false));
  }, [loadOverview, loadEvents, loadPresets]);

  const silentRefresh = useCallback(async () => {
    try {
      await Promise.all([loadOverview(), loadEvents(), loadPresets()]);
    } catch {
      /* keep stale */
    }
  }, [loadOverview, loadEvents, loadPresets]);

  useAutoRefresh(silentRefresh, 10_000, !busy);

  const channels = overview?.channels ?? [];
  const stats = overview?.stats;
  const config = overview?.config ?? null;
  const now = Date.now();

  const floorItems = useMemo<FloorItem[]>(() => {
    const liveOwners = new Set(channels.map((ch) => ch.ownerId));
    const live: FloorItem[] = channels.map((ch) => ({
      key: `live:${ch.channelId}`,
      kind: "live",
      ownerId: ch.ownerId,
      name: ch.name,
      userLimit: ch.userLimit,
      bitrate: ch.bitrate,
      region: ch.region,
      isLocked: ch.isLocked,
      isInvisible: ch.isInvisible,
      isChatClosed: ch.isChatClosed,
      isDnd: ch.isDnd,
      memberCount: ch.memberCount,
      updatedAt: ch.lastActivity,
      channel: ch,
    }));
    const idle: FloorItem[] = presets
      .filter((p) => !liveOwners.has(p.userId))
      .map((p) => ({
        key: `idle:${p.userId}`,
        kind: "idle" as const,
        ownerId: p.userId,
        name: p.channelName || "Saved default",
        userLimit: p.userLimit ?? 0,
        bitrate: p.bitrate,
        region: p.region,
        isLocked: p.isLocked,
        isInvisible: p.isInvisible,
        isChatClosed: p.isChatClosed,
        isDnd: p.isDnd,
        memberCount: 0,
        updatedAt: p.updatedAt,
        preset: p,
      }));
    return [...live, ...idle];
  }, [channels, presets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return floorItems.filter((item) => {
      if (filter === "live" && item.kind !== "live") return false;
      if (filter === "idle" && item.kind !== "idle") return false;
      if (filter === "locked" && !item.isLocked) return false;
      if (filter === "invisible" && !item.isInvisible) return false;
      if (filter === "dnd" && !item.isDnd) return false;
      if (!q) return true;
      const owner = displayName(item.ownerId).toLowerCase();
      return item.name.toLowerCase().includes(q) || owner.includes(q) || item.ownerId.includes(q);
    });
  }, [floorItems, filter, search, displayName]);

  const selected = useMemo(() => {
    const fromFloor = filtered.find((item) => item.key === selectedKey)
      || floorItems.find((item) => item.key === selectedKey);
    if (fromFloor) return fromFloor;
    if (selectedKey?.startsWith("idle:")) {
      const userId = selectedKey.slice(5);
      const p = presets.find((preset) => preset.userId === userId);
      if (!p) return null;
      return {
        key: `idle:${p.userId}`,
        kind: "idle" as const,
        ownerId: p.userId,
        name: p.channelName || "Saved default",
        userLimit: p.userLimit ?? 0,
        bitrate: p.bitrate,
        region: p.region,
        isLocked: p.isLocked,
        isInvisible: p.isInvisible,
        isChatClosed: p.isChatClosed,
        isDnd: p.isDnd,
        memberCount: 0,
        updatedAt: p.updatedAt,
        preset: p,
      } satisfies FloorItem;
    }
    return null;
  }, [filtered, floorItems, selectedKey, presets]);

  useEffect(() => {
    if (!selectedKey && filtered[0]) setSelectedKey(filtered[0].key);
  }, [filtered, selectedKey]);

  async function queue(channelId: string, body: { op: TempVoiceManageOp } & Record<string, unknown>) {
    setBusy(true);
    setFlash(null);
    const res = await queueTempVoiceAction(apiToken, channelId, body);
    setBusy(false);
    if (res.success) {
      setFlash("Queued. The bot applies this within about 10 seconds.");
      setTimeout(() => silentRefresh(), 2500);
    } else {
      setFlash(res.error || "Failed to queue action");
    }
  }

  async function savePreset(userId: string, patch: TempVoicePresetPatch, create = false) {
    setBusy(true);
    setFlash(null);
    const res = create
      ? await createTempVoicePreset(apiToken, userId, patch)
      : await updateTempVoicePreset(apiToken, userId, patch);
    setBusy(false);
    if (res.success && res.data?.preset) {
      const saved = res.data.preset;
      setPresets((prev) => {
        const rest = prev.filter((p) => p.userId !== saved.userId);
        return [saved, ...rest];
      });
      const liveN = res.data.liveQueued;
      setFlash(
        liveN > 0
          ? "Default saved. Live channel updates are queued (~10s)."
          : "Default saved. It applies the next time they create a channel.",
      );
      if (liveN > 0) setTimeout(() => silentRefresh(), 2500);
    } else {
      setFlash(res.error || "Failed to save default");
    }
  }

  async function clearPreset(userId: string) {
    setBusy(true);
    setFlash(null);
    const res = await clearTempVoicePreset(apiToken, userId);
    setBusy(false);
    if (res.success) {
      setPresets((prev) => prev.filter((p) => p.userId !== userId));
      if (selectedKey === `idle:${userId}`) setSelectedKey(null);
      setFlash("Saved default cleared.");
    } else {
      setFlash(res.error || "Failed to clear default");
    }
  }

  if (loading) {
    return (
      <SkeletonRegion label="Loading temp voice…">
        <div className="mb-8">
          <Skeleton className="h-9 w-56" />
        </div>
        <div className="mb-6 grid gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
        <SkeletonCard pad="p-4">
          <Skeleton className="h-32 w-full" />
        </SkeletonCard>
      </SkeletonRegion>
    );
  }

  if (error && !overview) {
    return <div className="text-danger">{error}</div>;
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-wide">Temp Voice</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Live channels and idle saved defaults. Staff can edit either — idle changes apply the next time that person creates a channel.
        </p>
      </div>

      {flash && (
        <div className="rounded-sm border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">
          {flash}
        </div>
      )}

      {stats && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Active VCs" value={stats.activeChannels} hint={`${stats.peopleInVoice} people in them`} />
          <Stat label="Locked" value={stats.lockedChannels} />
          <Stat label="Today" value={stats.createdToday} hint={`${stats.deletedToday} closed`} />
          <Stat label="Owners" value={stats.uniqueOwners} />
          <div className="facet-border rounded-sm bg-bg-card p-4">
            <div className="text-[10px] font-medium tracking-[0.18em] text-text-muted uppercase">
              Created today
            </div>
            <div className="mt-3">
              <HourStrip hours={stats.hourlyCreated} />
            </div>
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
            Comms floor
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or owner"
              className="rounded-sm border border-border bg-bg-secondary px-3 py-1.5 text-sm"
            />
            {(["all", "live", "idle", "locked", "invisible", "dnd"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-sm border px-2.5 py-1.5 text-xs tracking-wide uppercase ${
                  filter === f
                    ? "border-accent/40 bg-accent/15 text-accent"
                    : "border-border text-text-muted hover:text-text-secondary"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="facet-border rounded-sm bg-bg-card px-4 py-10 text-center text-sm text-text-muted">
            {floorItems.length === 0
              ? "No live channels or saved defaults yet."
              : "No channels match that filter."}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
            <div className="space-y-2">
              {filtered.map((item) => {
                const active = selected?.key === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setSelectedKey(item.key)}
                    className={`w-full rounded-sm border p-3 text-left transition-colors ${
                      active
                        ? "border-accent/50 bg-bg-card"
                        : "border-border bg-bg-card/60 hover:bg-bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text-primary">{item.name}</div>
                        <div className="mt-0.5 truncate text-xs text-text-muted">
                          {displayName(item.ownerId)}
                          {item.kind === "live"
                            ? ` · ${formatChannelAge(item.channel?.createdAt || item.updatedAt, now)}`
                            : " · idle default"}
                        </div>
                      </div>
                      {item.kind === "live" ? (
                        <OccupancyTrack count={item.memberCount} limit={item.userLimit} />
                      ) : (
                        <span className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-text-muted uppercase">
                          Idle
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Flag on={item.isLocked} label="Locked" />
                      <Flag on={item.isInvisible} label="Hidden" />
                      <Flag on={item.isChatClosed} label="Chat closed" />
                      <Flag on={item.isDnd} label="DND" />
                    </div>
                  </button>
                );
              })}
            </div>

            <ChannelDetail
              item={selected}
              config={config}
              canManage={canManage}
              busy={busy}
              displayName={displayName}
              liveOwnerIds={new Set(channels.map((ch) => ch.ownerId))}
              onQueue={queue}
              onSavePreset={savePreset}
              onClearPreset={clearPreset}
              onDelete={() => setConfirmDelete(true)}
            />
          </div>
        )}
      </section>

      <ActivityLog
        events={events}
        total={eventTotal}
        eventType={eventType}
        eventSearch={eventSearch}
        onType={setEventType}
        onSearch={setEventSearch}
        displayName={displayName}
      />

      <PresetsTable
        presets={presets}
        liveOwnerIds={new Set(channels.map((ch) => ch.ownerId))}
        selectedKey={selectedKey}
        canManage={canManage}
        busy={busy}
        displayName={displayName}
        onSelect={(p) => setSelectedKey(`idle:${p.userId}`)}
        onSave={savePreset}
      />

      {canManage && config && (
        <ConfigPanel
          config={config}
          apiToken={apiToken}
          onSaved={(next) => {
            setOverview((prev) => (prev ? { ...prev, config: next } : prev));
            setFlash("Config saved. Bot reloads it within about 10 seconds.");
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this temp channel"
        message={selected?.channel ? `Delete “${selected.name}” and disconnect everyone in it?` : ""}
        confirmLabel="Delete channel"
        loading={busy}
        onConfirm={async () => {
          if (!selected?.channel) return;
          await queue(selected.channel.channelId, { op: "delete" });
          setConfirmDelete(false);
          setSelectedKey(null);
        }}
      />
    </div>
  );
}

function ChannelDetail({
  item,
  config,
  canManage,
  busy,
  displayName,
  liveOwnerIds,
  onQueue,
  onSavePreset,
  onClearPreset,
  onDelete,
}: {
  item: FloorItem | null;
  config: TempVoiceConfig | null;
  canManage: boolean;
  busy: boolean;
  displayName: (id: string | null) => string;
  liveOwnerIds: Set<string>;
  onQueue: (channelId: string, body: { op: TempVoiceManageOp } & Record<string, unknown>) => Promise<void>;
  onSavePreset: (userId: string, patch: TempVoicePresetPatch) => Promise<void>;
  onClearPreset: (userId: string) => Promise<void>;
  onDelete: () => void;
}) {
  const channel = item?.channel ?? null;
  const preset = item?.preset ?? null;
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("0");
  const [transferId, setTransferId] = useState("");
  const [applyLive, setApplyLive] = useState(true);

  useEffect(() => {
    if (!item) return;
    setName(item.name === "Saved default" ? "" : item.name);
    setLimit(String(item.userLimit || 0));
    setTransferId("");
    setApplyLive(true);
  }, [item?.key, item?.name, item?.userLimit]);

  if (!item) {
    return (
      <div className="facet-border rounded-sm bg-bg-card p-6 text-sm text-text-muted">
        Select a live channel or an idle saved default to inspect and edit settings.
      </div>
    );
  }

  const isIdle = item.kind === "idle";
  const jump = channel
    ? discordChannelUrl(config?.guildId || channel.guildId, channel.channelId)
    : null;

  function patchIdle(patch: TempVoicePresetPatch) {
    onSavePreset(item.ownerId, { ...patch, applyLive });
  }

  return (
    <div className="facet-border space-y-5 rounded-sm bg-bg-card p-4">
      <div>
        <div className="text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
          {isIdle ? "Saved default" : "Live channel"}
        </div>
        <h3 className="font-display mt-1 text-xl font-semibold">{item.name}</h3>
        <div className="mt-1 text-xs text-text-muted">
          Owner {displayName(item.ownerId)}
          {channel
            ? ` · last activity ${formatDateTime(channel.lastActivity)}`
            : preset
              ? ` · updated ${formatDateTime(preset.updatedAt)}`
              : ""}
        </div>
        {isIdle && (
          <p className="mt-2 text-xs text-text-secondary">
            Not in a temp channel right now. Edits here are their next-create defaults.
          </p>
        )}
        {jump && (
          <a
            href={jump}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-xs text-accent hover:underline"
          >
            Open in Discord
          </a>
        )}
      </div>

      {!isIdle && <OccupancyTrack count={item.memberCount} limit={item.userLimit} />}

      <div className="flex flex-wrap gap-1">
        <Flag on={item.isLocked} label="Locked" />
        <Flag on={item.isInvisible} label="Hidden" />
        <Flag on={item.isChatClosed} label="Chat closed" />
        <Flag on={item.isDnd} label="DND" />
        {!item.isLocked && !item.isInvisible && !item.isDnd && (
          <span className="text-xs text-text-muted">{isIdle ? "Open default" : "Open channel"}</span>
        )}
      </div>

      {channel && (
      <div>
        <div className="mb-1 text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
          In channel
        </div>
        {channel.memberIds.length === 0 ? (
          <div className="text-xs text-text-muted">Empty (stale snapshot or everyone just left).</div>
        ) : (
          <ul className="space-y-1">
            {channel.memberIds.map((id) => (
              <li key={id} className="flex items-center justify-between gap-2 text-sm">
                <span className={id === channel.ownerId ? "text-accent" : ""}>
                  {displayName(id)}
                  {id === channel.ownerId ? " · owner" : ""}
                </span>
                {canManage && id !== channel.ownerId && (
                  <button
                    disabled={busy}
                    onClick={() => onQueue(channel.channelId, { op: "kick", userId: id })}
                    className="text-xs text-danger hover:underline disabled:opacity-50"
                  >
                    Kick
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {channel && (channel.trustedIds.length > 0 || channel.blockedIds.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
              Trusted
            </div>
            {channel.trustedIds.length === 0 ? (
              <div className="text-xs text-text-muted">None</div>
            ) : (
              channel.trustedIds.map((id) => (
                <div key={id} className="text-xs text-text-secondary">{displayName(id)}</div>
              ))
            )}
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
              Blocked
            </div>
            {channel.blockedIds.length === 0 ? (
              <div className="text-xs text-text-muted">None</div>
            ) : (
              channel.blockedIds.map((id) => (
                <div key={id} className="text-xs text-danger">{displayName(id)}</div>
              ))
            )}
          </div>
        </div>
      )}

      {canManage && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
            {isIdle ? "Edit default" : "Staff controls"}
          </div>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="min-w-0 flex-1 rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm"
            />
            <button
              disabled={busy || name.trim().length < 2 || name.trim() === item.name}
              onClick={() => {
                if (isIdle) patchIdle({ channelName: name.trim() });
                else if (channel) onQueue(channel.channelId, { op: "rename", name: name.trim() });
              }}
              className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:text-accent disabled:opacity-40"
            >
              Rename
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-20 rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm"
            />
            <button
              disabled={busy}
              onClick={() => {
                const userLimit = Number(limit) || 0;
                if (isIdle) patchIdle({ userLimit });
                else if (channel) onQueue(channel.channelId, { op: "limit", userLimit });
              }}
              className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:text-accent disabled:opacity-40"
            >
              Set limit
            </button>
            <span className="self-center text-[11px] text-text-muted">0 = unlimited</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <ToggleBtn busy={busy} on={item.isLocked} onLabel="Unlock" offLabel="Lock" onClick={() => isIdle ? patchIdle({ isLocked: !item.isLocked }) : channel && onQueue(channel.channelId, { op: item.isLocked ? "unlock" : "lock" })} />
            <ToggleBtn busy={busy} on={item.isInvisible} onLabel="Show" offLabel="Hide" onClick={() => isIdle ? patchIdle({ isInvisible: !item.isInvisible }) : channel && onQueue(channel.channelId, { op: item.isInvisible ? "visible" : "invisible" })} />
            <ToggleBtn busy={busy} on={item.isChatClosed} onLabel="Open chat" offLabel="Close chat" onClick={() => isIdle ? patchIdle({ isChatClosed: !item.isChatClosed }) : channel && onQueue(channel.channelId, { op: item.isChatClosed ? "openchat" : "closechat" })} />
            <ToggleBtn busy={busy} on={item.isDnd} onLabel="Clear DND" offLabel="DND" onClick={() => isIdle ? patchIdle({ isDnd: !item.isDnd }) : channel && onQueue(channel.channelId, { op: "dnd", enabled: !item.isDnd })} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-text-muted">
              Bitrate
              <select
                value={item.bitrate || 64000}
                disabled={busy}
                onChange={(e) => {
                  const bitrate = Number(e.target.value);
                  if (isIdle) patchIdle({ bitrate });
                  else if (channel) onQueue(channel.channelId, { op: "bitrate", bitrate });
                }}
                className="mt-1 w-full rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary"
              >
                {BITRATE_OPTIONS.map((b) => (
                  <option key={b} value={b}>{formatKbps(b)}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-muted">
              Region
              <select
                value={item.region || "auto"}
                disabled={busy}
                onChange={(e) => {
                  const region = e.target.value;
                  if (isIdle) patchIdle({ region });
                  else if (channel) onQueue(channel.channelId, { op: "region", region });
                }}
                className="mt-1 w-full rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary"
              >
                {Object.entries(REGION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          {isIdle && liveOwnerIds.has(item.ownerId) && (
            <label className="flex items-center gap-2 text-xs text-text-secondary">
              <input type="checkbox" checked={applyLive} onChange={(e) => setApplyLive(e.target.checked)} />
              Also apply to their live channel
            </label>
          )}

          {!isIdle && channel && (
            <>
              <div className="flex gap-2">
                <input
                  value={transferId}
                  onChange={(e) => setTransferId(e.target.value)}
                  placeholder="New owner Discord ID"
                  className="min-w-0 flex-1 rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm"
                />
                <button
                  disabled={busy || !/^\d{5,25}$/.test(transferId.trim())}
                  onClick={() => onQueue(channel.channelId, { op: "transfer", newOwnerId: transferId.trim() })}
                  className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:text-accent disabled:opacity-40"
                >
                  Transfer
                </button>
              </div>
              <button
                disabled={busy}
                onClick={onDelete}
                className="rounded-sm border border-danger/40 px-3 py-1.5 text-xs uppercase tracking-wide text-danger hover:bg-danger/10 disabled:opacity-40"
              >
                Delete channel
              </button>
            </>
          )}

          {isIdle && (
            <button
              disabled={busy}
              onClick={() => onClearPreset(item.ownerId)}
              className="rounded-sm border border-danger/40 px-3 py-1.5 text-xs uppercase tracking-wide text-danger hover:bg-danger/10 disabled:opacity-40"
            >
              Clear default
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleBtn({
  busy,
  on,
  onLabel,
  offLabel,
  onClick,
}: {
  busy: boolean;
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={`rounded-sm border px-2.5 py-1 text-xs tracking-wide uppercase disabled:opacity-40 ${
        on
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-border text-text-secondary hover:text-accent"
      }`}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

function ActivityLog({
  events,
  total,
  eventType,
  eventSearch,
  onType,
  onSearch,
  displayName,
}: {
  events: TempVoiceEvent[];
  total: number;
  eventType: string;
  eventSearch: string;
  onType: (v: string) => void;
  onSearch: (v: string) => void;
  displayName: (id: string | null) => string;
}) {
  const types = Object.keys(EVENT_LABELS) as TempVoiceEventType[];
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
          Activity log
        </h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={eventType}
            onChange={(e) => onType(e.target.value)}
            className="rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm"
          >
            <option value="">All events</option>
            {types.map((t) => (
              <option key={t} value={t}>{EVENT_LABELS[t]}</option>
            ))}
          </select>
          <input
            value={eventSearch}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search log"
            className="rounded-sm border border-border bg-bg-secondary px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <div className="facet-border overflow-hidden rounded-sm bg-bg-card">
        {events.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            No events yet. Creates, locks, kicks, and blocked names land here.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((ev) => (
              <li key={ev.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 text-[10px] font-semibold tracking-wide text-accent uppercase">
                  {EVENT_LABELS[ev.eventType]}
                </span>
                <span className="min-w-0 flex-1 text-text-primary">
                  {ev.channelName || ev.channelId || "—"}
                  {ev.actorId && (
                    <span className="text-text-muted"> · {displayName(ev.actorId)}</span>
                  )}
                </span>
                <span className="text-xs text-text-muted">{formatDateTime(ev.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border px-4 py-2 text-[11px] text-text-muted">
          Showing {events.length} of {total}
        </div>
      </div>
    </section>
  );
}

function PresetsTable({
  presets,
  liveOwnerIds,
  selectedKey,
  canManage,
  busy,
  displayName,
  onSelect,
  onSave,
}: {
  presets: TempVoicePreset[];
  liveOwnerIds: Set<string>;
  selectedKey: string | null;
  canManage: boolean;
  busy: boolean;
  displayName: (id: string | null) => string;
  onSelect: (p: TempVoicePreset) => void;
  onSave: (userId: string, patch: TempVoicePresetPatch, create?: boolean) => Promise<void>;
}) {
  const [newUserId, setNewUserId] = useState("");
  const [newName, setNewName] = useState("");

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
        Saved defaults
      </h2>
      <p className="text-xs text-text-muted">
        Click a row to edit. Idle users have no live temp channel — changes apply on their next create.
      </p>
      <div className="facet-border overflow-x-auto rounded-sm bg-bg-card">
        {presets.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            No saved defaults yet. They appear when someone sets a name, lock, or limit on their channel.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-[10px] tracking-[0.15em] text-text-muted uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Limit</th>
                <th className="px-4 py-2 font-medium">Flags</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {presets.map((p) => {
                const live = liveOwnerIds.has(p.userId);
                return (
                  <tr
                    key={`${p.userId}-${p.guildId}`}
                    onClick={() => onSelect(p)}
                    className={`cursor-pointer border-t border-border hover:bg-bg-card-hover ${
                      selectedKey === `idle:${p.userId}` ? "bg-accent/5" : ""
                    }`}
                  >
                    <td className="px-4 py-2">{displayName(p.userId)}</td>
                    <td className="px-4 py-2 text-text-secondary">{p.channelName || "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{p.userLimit ?? "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Flag on={p.isLocked} label="Locked" />
                        <Flag on={p.isInvisible} label="Hidden" />
                        <Flag on={p.isChatClosed} label="Chat closed" />
                        <Flag on={p.isDnd} label="DND" />
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {live ? (
                        <span className="text-success">Live</span>
                      ) : (
                        <span className="text-text-muted">Idle</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-text-muted">{formatDateTime(p.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {canManage && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const id = newUserId.trim();
            if (!/^\d{5,25}$/.test(id)) return;
            onSave(id, { channelName: newName.trim() || null, applyLive: true }, true);
            setNewUserId("");
            setNewName("");
          }}
        >
          <label className="text-xs text-text-muted">
            Discord user ID
            <input
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value.trim())}
              placeholder="17–19 digit id"
              className="mt-1 block w-52 rounded-sm border border-border bg-bg-secondary px-2 py-1.5 font-mono text-sm text-text-primary"
            />
          </label>
          <label className="text-xs text-text-muted">
            Default name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Optional"
              maxLength={100}
              className="mt-1 block w-52 rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !/^\d{5,25}$/.test(newUserId)}
            className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:text-accent disabled:opacity-40"
          >
            Add default
          </button>
        </form>
      )}
    </section>
  );
}

function ConfigPanel({
  config,
  apiToken,
  onSaved,
}: {
  config: TempVoiceConfig;
  apiToken: string;
  onSaved: (next: TempVoiceConfig) => void;
}) {
  const [edit, setEdit] = useState(config);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setEdit(config), [config]);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await updateTempVoiceConfig(apiToken, {
      triggerChannelId: edit.triggerChannelId,
      categoryId: edit.categoryId,
      logChannelId: edit.logChannelId,
      maxChannelsPerUser: edit.maxChannelsPerUser,
      defaultAllowVad: edit.defaultAllowVad,
    });
    setSaving(false);
    if (res.success && res.data) onSaved(res.data);
    else setErr(res.error || "Save failed");
  }

  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
        Setup
      </h2>
      <div className="facet-border grid gap-4 rounded-sm bg-bg-card p-4 sm:grid-cols-2">
        <Field
          label="Trigger channel ID"
          value={edit.triggerChannelId || ""}
          onChange={(v) => setEdit({ ...edit, triggerChannelId: v || null })}
        />
        <Field
          label="Category ID"
          value={edit.categoryId || ""}
          onChange={(v) => setEdit({ ...edit, categoryId: v || null })}
        />
        <Field
          label="Log channel ID"
          value={edit.logChannelId || ""}
          onChange={(v) => setEdit({ ...edit, logChannelId: v || null })}
        />
        <label className="text-xs text-text-muted">
          Max channels per user
          <input
            type="number"
            min={1}
            max={10}
            value={edit.maxChannelsPerUser}
            onChange={(e) => setEdit({ ...edit, maxChannelsPerUser: Number(e.target.value) || 1 })}
            className="mt-1 w-full rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={edit.defaultAllowVad}
            onChange={(e) => setEdit({ ...edit, defaultAllowVad: e.target.checked })}
          />
          Voice activation on by default
        </label>
        <div className="flex items-end gap-3">
          <button
            disabled={saving}
            onClick={save}
            className="rounded-sm bg-accent px-4 py-2 text-xs font-semibold tracking-wide text-bg-primary uppercase disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save setup"}
          </button>
          {err && <span className="text-xs text-danger">{err}</span>}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs text-text-muted">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        className="mt-1 w-full rounded-sm border border-border bg-bg-secondary px-2 py-1.5 font-mono text-sm text-text-primary"
      />
    </label>
  );
}
