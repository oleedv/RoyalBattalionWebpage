"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTempVoiceOverview,
  getTempVoiceEvents,
  getTempVoicePresets,
  updateTempVoiceConfig,
  queueTempVoiceAction,
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
} from "shared";
import {
  BITRATE_OPTIONS,
  EVENT_LABELS,
  REGION_LABELS,
  formatChannelAge,
  formatKbps,
  occupancyLabel,
} from "./labels";

type Filter = "all" | "locked" | "invisible" | "dnd";

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
      await Promise.all([loadOverview(), loadEvents()]);
    } catch {
      /* keep stale */
    }
  }, [loadOverview, loadEvents]);

  useAutoRefresh(silentRefresh, 10_000, !busy);

  const channels = overview?.channels ?? [];
  const stats = overview?.stats;
  const config = overview?.config ?? null;
  const now = Date.now();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels.filter((ch) => {
      if (filter === "locked" && !ch.isLocked) return false;
      if (filter === "invisible" && !ch.isInvisible) return false;
      if (filter === "dnd" && !ch.isDnd) return false;
      if (!q) return true;
      const owner = displayName(ch.ownerId).toLowerCase();
      return ch.name.toLowerCase().includes(q) || owner.includes(q) || ch.channelId.includes(q);
    });
  }, [channels, filter, search, displayName]);

  const selected = filtered.find((c) => c.channelId === selectedId) || channels.find((c) => c.channelId === selectedId) || null;

  useEffect(() => {
    if (!selectedId && filtered[0]) setSelectedId(filtered[0].channelId);
  }, [filtered, selectedId]);

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
          Live floor of join-to-create channels. Staff can rename, lock, kick, and tear down from here.
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
            {(["all", "locked", "invisible", "dnd"] as Filter[]).map((f) => (
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
            {channels.length === 0
              ? "No temp channels right now. They appear when someone joins the trigger VC."
              : "No channels match that filter."}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,28rem)]">
            <div className="space-y-2">
              {filtered.map((ch) => {
                const active = selected?.channelId === ch.channelId;
                return (
                  <button
                    key={ch.channelId}
                    onClick={() => setSelectedId(ch.channelId)}
                    className={`w-full rounded-sm border p-3 text-left transition-colors ${
                      active
                        ? "border-accent/50 bg-bg-card"
                        : "border-border bg-bg-card/60 hover:bg-bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-text-primary">{ch.name}</div>
                        <div className="mt-0.5 truncate text-xs text-text-muted">
                          {displayName(ch.ownerId)} · {formatChannelAge(ch.createdAt, now)}
                        </div>
                      </div>
                      <OccupancyTrack count={ch.memberCount} limit={ch.userLimit} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Flag on={ch.isLocked} label="Locked" />
                      <Flag on={ch.isInvisible} label="Hidden" />
                      <Flag on={ch.isChatClosed} label="Chat closed" />
                      <Flag on={ch.isDnd} label="DND" />
                    </div>
                  </button>
                );
              })}
            </div>

            <ChannelDetail
              channel={selected}
              config={config}
              canManage={canManage}
              busy={busy}
              displayName={displayName}
              onQueue={queue}
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

      <PresetsTable presets={presets} displayName={displayName} />

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
        message={selected ? `Delete “${selected.name}” and disconnect everyone in it?` : ""}
        confirmLabel="Delete channel"
        loading={busy}
        onConfirm={async () => {
          if (!selected) return;
          await queue(selected.channelId, { op: "delete" });
          setConfirmDelete(false);
          setSelectedId(null);
        }}
      />
    </div>
  );
}

function ChannelDetail({
  channel,
  config,
  canManage,
  busy,
  displayName,
  onQueue,
  onDelete,
}: {
  channel: TempVoiceChannel | null;
  config: TempVoiceConfig | null;
  canManage: boolean;
  busy: boolean;
  displayName: (id: string | null) => string;
  onQueue: (channelId: string, body: { op: TempVoiceManageOp } & Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("0");
  const [transferId, setTransferId] = useState("");

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setLimit(String(channel.userLimit || 0));
    setTransferId("");
  }, [channel?.channelId, channel?.name, channel?.userLimit]);

  if (!channel) {
    return (
      <div className="facet-border rounded-sm bg-bg-card p-6 text-sm text-text-muted">
        Select a channel to inspect settings, occupancy, and staff controls.
      </div>
    );
  }

  const jump = discordChannelUrl(config?.guildId || channel.guildId, channel.channelId);

  return (
    <div className="facet-border space-y-5 rounded-sm bg-bg-card p-4">
      <div>
        <div className="text-[10px] font-semibold tracking-[0.18em] text-text-muted uppercase">
          Channel
        </div>
        <h3 className="font-display mt-1 text-xl font-semibold">{channel.name}</h3>
        <div className="mt-1 text-xs text-text-muted">
          Owner {displayName(channel.ownerId)} · last activity {formatDateTime(channel.lastActivity)}
        </div>
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

      <OccupancyTrack count={channel.memberCount} limit={channel.userLimit} />

      <div className="flex flex-wrap gap-1">
        <Flag on={channel.isLocked} label="Locked" />
        <Flag on={channel.isInvisible} label="Hidden" />
        <Flag on={channel.isChatClosed} label="Chat closed" />
        <Flag on={channel.isDnd} label="DND" />
        {!channel.isLocked && !channel.isInvisible && !channel.isDnd && (
          <span className="text-xs text-text-muted">Open channel</span>
        )}
      </div>

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

      {(channel.trustedIds.length > 0 || channel.blockedIds.length > 0) && (
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
            Staff controls
          </div>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              className="min-w-0 flex-1 rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm"
            />
            <button
              disabled={busy || name.trim().length < 2 || name.trim() === channel.name}
              onClick={() => onQueue(channel.channelId, { op: "rename", name: name.trim() })}
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
              onClick={() => onQueue(channel.channelId, { op: "limit", userLimit: Number(limit) || 0 })}
              className="rounded-sm border border-border px-3 py-1.5 text-xs uppercase tracking-wide text-text-secondary hover:text-accent disabled:opacity-40"
            >
              Set limit
            </button>
            <span className="self-center text-[11px] text-text-muted">0 = unlimited</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <ToggleBtn busy={busy} on={channel.isLocked} onLabel="Unlock" offLabel="Lock" onClick={() => onQueue(channel.channelId, { op: channel.isLocked ? "unlock" : "lock" })} />
            <ToggleBtn busy={busy} on={channel.isInvisible} onLabel="Show" offLabel="Hide" onClick={() => onQueue(channel.channelId, { op: channel.isInvisible ? "visible" : "invisible" })} />
            <ToggleBtn busy={busy} on={channel.isChatClosed} onLabel="Open chat" offLabel="Close chat" onClick={() => onQueue(channel.channelId, { op: channel.isChatClosed ? "openchat" : "closechat" })} />
            <ToggleBtn busy={busy} on={channel.isDnd} onLabel="Clear DND" offLabel="DND" onClick={() => onQueue(channel.channelId, { op: "dnd", enabled: !channel.isDnd })} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs text-text-muted">
              Bitrate
              <select
                value={channel.bitrate || 64000}
                disabled={busy}
                onChange={(e) => onQueue(channel.channelId, { op: "bitrate", bitrate: Number(e.target.value) })}
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
                value={channel.region || "auto"}
                disabled={busy}
                onChange={(e) => onQueue(channel.channelId, { op: "region", region: e.target.value })}
                className="mt-1 w-full rounded-sm border border-border bg-bg-secondary px-2 py-1.5 text-sm text-text-primary"
              >
                {Object.entries(REGION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

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
  displayName,
}: {
  presets: TempVoicePreset[];
  displayName: (id: string | null) => string;
}) {
  if (presets.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold tracking-[0.15em] text-text-muted uppercase">
        Saved defaults
      </h2>
      <div className="facet-border overflow-x-auto rounded-sm bg-bg-card">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] tracking-[0.15em] text-text-muted uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Limit</th>
              <th className="px-4 py-2 font-medium">Flags</th>
              <th className="px-4 py-2 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {presets.map((p) => (
              <tr key={`${p.userId}-${p.guildId}`} className="border-t border-border">
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
                <td className="px-4 py-2 text-xs text-text-muted">{formatDateTime(p.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
