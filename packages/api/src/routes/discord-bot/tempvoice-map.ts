import type {
  TempVoiceChannel,
  TempVoiceConfig,
  TempVoiceEvent,
  TempVoiceEventType,
  TempVoicePreset,
  TempVoiceStats,
} from "shared";

const EVENT_TYPES = new Set<TempVoiceEventType>([
  "created",
  "deleted",
  "renamed",
  "privacy",
  "dnd",
  "region",
  "bitrate",
  "limit",
  "trust",
  "untrust",
  "block",
  "unblock",
  "invite",
  "kick",
  "transfer",
  "claim",
  "blocked_name",
  "config",
  "preset",
  "other",
]);

export function parseIdList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function parseDetails(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function mapConfig(row: Record<string, unknown> | null, guildId: string | null): TempVoiceConfig | null {
  if (!row) return null;
  return {
    triggerChannelId: row.trigger_channel_id ? String(row.trigger_channel_id) : null,
    categoryId: row.category_id ? String(row.category_id) : null,
    logChannelId: row.log_channel_id ? String(row.log_channel_id) : null,
    maxChannelsPerUser: Math.max(1, Number(row.max_channels_per_user) || 1),
    defaultAllowVad: Boolean(row.default_allow_vad ?? 1),
    guildId,
  };
}

export function mapChannel(row: Record<string, unknown>): TempVoiceChannel {
  return {
    id: Number(row.id),
    channelId: String(row.channel_id),
    ownerId: String(row.owner_id),
    guildId: String(row.guild_id),
    panelMessageId: row.panel_message_id ? String(row.panel_message_id) : null,
    name: row.channel_name ? String(row.channel_name) : "Voice Channel",
    userLimit: Number(row.user_limit) || 0,
    bitrate: row.bitrate != null ? Number(row.bitrate) : null,
    region: row.region ? String(row.region) : null,
    isLocked: Boolean(row.is_locked),
    isInvisible: Boolean(row.is_invisible),
    isChatClosed: Boolean(row.is_chat_closed),
    isDnd: Boolean(row.is_dnd),
    memberCount: Number(row.member_count) || 0,
    memberIds: parseIdList(row.member_ids),
    trustedIds: parseIdList(row.trusted_ids),
    blockedIds: parseIdList(row.blocked_ids),
    createdAt: toIso(row.created_at as string | Date) || new Date(0).toISOString(),
    lastActivity: toIso(row.last_activity as string | Date) || new Date(0).toISOString(),
    snapshotAt: toIso(row.snapshot_at as string | Date | null),
  };
}

export function mapEvent(row: Record<string, unknown>): TempVoiceEvent {
  const raw = String(row.event_type || "other");
  const eventType = EVENT_TYPES.has(raw as TempVoiceEventType) ? (raw as TempVoiceEventType) : "other";
  return {
    id: Number(row.id),
    eventType,
    channelId: row.channel_id ? String(row.channel_id) : null,
    channelName: row.channel_name ? String(row.channel_name) : null,
    actorId: row.actor_id ? String(row.actor_id) : null,
    ownerId: row.owner_id ? String(row.owner_id) : null,
    details: parseDetails(row.details),
    createdAt: toIso(row.created_at as string | Date) || new Date(0).toISOString(),
  };
}

export function mapPreset(row: Record<string, unknown>): TempVoicePreset {
  return {
    userId: String(row.user_id),
    guildId: String(row.guild_id),
    channelName: row.channel_name ? String(row.channel_name) : null,
    bitrate: row.bitrate != null ? Number(row.bitrate) : null,
    region: row.region ? String(row.region) : null,
    userLimit: row.user_limit != null ? Number(row.user_limit) : null,
    isLocked: Boolean(row.is_locked),
    isInvisible: Boolean(row.is_invisible),
    isChatClosed: Boolean(row.is_chat_closed),
    isDnd: Boolean(row.is_dnd),
    updatedAt: toIso(row.updated_at as string | Date) || new Date(0).toISOString(),
  };
}

export function emptyStats(): TempVoiceStats {
  return {
    activeChannels: 0,
    peopleInVoice: 0,
    lockedChannels: 0,
    invisibleChannels: 0,
    dndChannels: 0,
    createdToday: 0,
    deletedToday: 0,
    uniqueOwners: 0,
    oldestCreatedAt: null,
    hourlyCreated: Array(24).fill(0),
  };
}

export function statsFromChannels(
  channels: TempVoiceChannel[],
  createdToday: number,
  deletedToday: number,
  hourlyCreated: number[],
): TempVoiceStats {
  const owners = new Set(channels.map((c) => c.ownerId));
  let oldest: string | null = null;
  for (const c of channels) {
    if (!oldest || c.createdAt < oldest) oldest = c.createdAt;
  }
  const hours = Array(24).fill(0);
  for (let i = 0; i < 24; i++) hours[i] = Number(hourlyCreated[i]) || 0;
  return {
    activeChannels: channels.length,
    peopleInVoice: channels.reduce((n, c) => n + c.memberCount, 0),
    lockedChannels: channels.filter((c) => c.isLocked).length,
    invisibleChannels: channels.filter((c) => c.isInvisible).length,
    dndChannels: channels.filter((c) => c.isDnd).length,
    createdToday,
    deletedToday,
    uniqueOwners: owners.size,
    oldestCreatedAt: oldest,
    hourlyCreated: hours,
  };
}
