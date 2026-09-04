import type { TempVoiceEventType } from "shared";

export const EVENT_LABELS: Record<TempVoiceEventType, string> = {
  created: "Created",
  deleted: "Deleted",
  renamed: "Renamed",
  privacy: "Privacy",
  dnd: "DND",
  region: "Region",
  bitrate: "Bitrate",
  limit: "Limit",
  trust: "Trusted",
  untrust: "Untrusted",
  block: "Blocked",
  unblock: "Unblocked",
  invite: "Invite",
  kick: "Kicked",
  transfer: "Transferred",
  claim: "Claimed",
  blocked_name: "Name blocked",
  config: "Config",
  preset: "Default",
  other: "Event",
};

export const REGION_LABELS: Record<string, string> = {
  auto: "Auto",
  "us-east": "US East",
  "us-west": "US West",
  "us-central": "US Central",
  "us-south": "US South",
  brazil: "Brazil",
  singapore: "Singapore",
  sydney: "Sydney",
  russia: "Russia",
  "south-africa": "South Africa",
  hongkong: "Hong Kong",
  india: "India",
  japan: "Japan",
  rotterdam: "Rotterdam",
  "south-korea": "South Korea",
};

export const BITRATE_OPTIONS = [
  32000, 48000, 64000, 80000, 96000, 128000, 256000, 384000,
];

export function formatChannelAge(iso: string, nowMs: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const mins = Math.max(0, Math.floor((nowMs - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
  const days = Math.floor(hrs / 24);
  const remH = hrs % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

export function formatKbps(bitrate: number | null | undefined): string {
  if (!bitrate) return "default";
  return `${Math.round(bitrate / 1000)} kbps`;
}

export function occupancyLabel(count: number, limit: number): string {
  if (limit > 0) return `${count}/${limit}`;
  return String(count);
}
