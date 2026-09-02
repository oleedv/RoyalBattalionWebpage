import { validateCountry } from "shared";

export interface ProspectProfileRow {
  user_id: string;
  status: string;
  nationality: string | null;
  date_of_birth: string | null;
  steam_id: string | null;
  closed_at: Date | string | null;
  created_at: Date | string | null;
}

export interface UserProfileRow {
  id: string;
  discordId: string;
  country: string | null;
  dateOfBirth: Date | null;
  membershipDate: Date | null;
  steamId: string | null;
}

export interface UserProfilePatch {
  country?: string;
  dateOfBirth?: Date;
  membershipDate?: Date;
  steamId?: string;
}

const DOB_RE = /^(\d{2})[-/](\d{2})[-/](\d{4})$/;
const STEAM64_RE = /^\d{17}$/;

export function parseProspectDateOfBirth(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const match = raw.trim().match(DOB_RE);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

export function parseProspectSteamId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed.toUpperCase() === "Q") return null;
  if (!STEAM64_RE.test(trimmed)) return null;
  return trimmed;
}

function asTime(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Prefer the latest accepted application; otherwise the most recently created row. */
export function pickProspectForUser(rows: ProspectProfileRow[]): ProspectProfileRow | null {
  if (rows.length === 0) return null;
  const accepted = rows.filter((r) => r.status === "accepted");
  const pool = accepted.length > 0 ? accepted : rows;
  return [...pool].sort((a, b) => {
    if (accepted.length > 0) {
      const closed = asTime(b.closed_at) - asTime(a.closed_at);
      if (closed !== 0) return closed;
    }
    return asTime(b.created_at) - asTime(a.created_at);
  })[0];
}

export function prospectToUserPatch(
  prospect: ProspectProfileRow,
  user: UserProfileRow,
): UserProfilePatch | null {
  const patch: UserProfilePatch = {};

  if (!user.country && prospect.nationality) {
    const result = validateCountry(prospect.nationality);
    if (result.valid) patch.country = result.country;
  }

  if (!user.dateOfBirth) {
    const dob = parseProspectDateOfBirth(prospect.date_of_birth);
    if (dob) patch.dateOfBirth = dob;
  }

  if (!user.membershipDate && prospect.status === "accepted" && prospect.closed_at) {
    const membershipDate = new Date(prospect.closed_at);
    if (Number.isFinite(membershipDate.getTime())) patch.membershipDate = membershipDate;
  }

  if (!user.steamId) {
    const steamId = parseProspectSteamId(prospect.steam_id);
    if (steamId) patch.steamId = steamId;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function groupProspectsByUser(
  rows: ProspectProfileRow[],
): Map<string, ProspectProfileRow> {
  const grouped = new Map<string, ProspectProfileRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.user_id);
    if (list) list.push(row);
    else grouped.set(row.user_id, [row]);
  }
  const picked = new Map<string, ProspectProfileRow>();
  for (const [userId, list] of grouped) {
    const choice = pickProspectForUser(list);
    if (choice) picked.set(userId, choice);
  }
  return picked;
}

export function buildProfileUpdates(
  users: UserProfileRow[],
  prospects: ProspectProfileRow[],
): { userId: string; patch: UserProfilePatch }[] {
  const byDiscordId = groupProspectsByUser(prospects);
  const updates: { userId: string; patch: UserProfilePatch }[] = [];
  for (const user of users) {
    const prospect = byDiscordId.get(user.discordId);
    if (!prospect) continue;
    const patch = prospectToUserPatch(prospect, user);
    if (patch) updates.push({ userId: user.id, patch });
  }
  return updates;
}
