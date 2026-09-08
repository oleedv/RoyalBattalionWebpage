export const ADMIN_ROLES = [
  "TraineeAdmin",
  "Admin",
  "SeniorAdmin",
  "SuperAdmin",
  "Founder",
] as const;

const ADMIN_ROLE_SET = new Set(ADMIN_ROLES.map((r) => roleKey(r)));

function normalizeRole(role: string | null | undefined): string {
  return String(role || "").trim();
}

function roleKey(role: string | null | undefined): string {
  return normalizeRole(role).toLowerCase().replace(/[\s_-]+/g, "");
}

export function isAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLE_SET.has(roleKey(role));
}

export function isMemberRole(role: string | null | undefined): boolean {
  return roleKey(role) === "member";
}

export function isProspectRole(role: string | null | undefined): boolean {
  return roleKey(role) === "prospect";
}

export type PlayerRoleKind = "admin" | "member" | "prospect" | "wl" | "none";

export function roleKind(role: string | null | undefined): PlayerRoleKind {
  if (isAdminRole(role)) return "admin";
  if (isMemberRole(role)) return "member";
  if (isProspectRole(role)) return "prospect";
  if (normalizeRole(role)) return "wl";
  return "none";
}

export function pickPrimaryEntry<T extends { role?: string | null }>(entries: T[]): T | null {
  if (!entries.length) return null;
  const rank = (role: string | null | undefined) => {
    const k = roleKind(role);
    if (k === "admin") return 4;
    if (k === "member") return 3;
    if (k === "prospect") return 2;
    if (k === "wl") return 1;
    return 0;
  };
  return [...entries].sort((a, b) => rank(b.role) - rank(a.role))[0] ?? null;
}

export interface ClassifiablePlayer {
  name?: string;
  steamID?: string;
  steamId?: string;
  teamID?: string | number | null;
}

export interface PlayerClassification {
  rbCount: number;
  prospectCount: number;
  wlCount: number;
  adminCount: number;
  teamOneRBs: number;
  teamTwoRBs: number;
  teamOneSize: number;
  teamTwoSize: number;
}

export function classifyOnlinePlayers(
  players: ClassifiablePlayer[],
  entriesBySteamId: Map<string, Array<{ role: string | null }>>,
): PlayerClassification {
  const result: PlayerClassification = {
    rbCount: 0,
    prospectCount: 0,
    wlCount: 0,
    adminCount: 0,
    teamOneRBs: 0,
    teamTwoRBs: 0,
    teamOneSize: 0,
    teamTwoSize: 0,
  };

  for (const p of players) {
    const teamID = p.teamID != null ? Number(p.teamID) : null;
    if (teamID === 1) result.teamOneSize++;
    else if (teamID === 2) result.teamTwoSize++;

    const steamId = String(p.steamID || p.steamId || "");
    if (!steamId) continue;
    const primary = pickPrimaryEntry(entriesBySteamId.get(steamId) ?? []);
    const kind = roleKind(primary?.role);
    if (kind === "admin") result.adminCount++;
    else if (kind === "member") {
      result.rbCount++;
      if (teamID === 1) result.teamOneRBs++;
      else if (teamID === 2) result.teamTwoRBs++;
    } else if (kind === "prospect") result.prospectCount++;
    else if (kind === "wl") result.wlCount++;
  }

  return result;
}

export function rosterRoleForSteamId(
  steamId: string,
  entriesBySteamId: Map<string, Array<{ role: string | null }>>,
): { rb: boolean; role: PlayerRoleKind } {
  const kind = roleKind(pickPrimaryEntry(entriesBySteamId.get(steamId) ?? [])?.role);
  return { rb: kind === "member" || kind === "admin", role: kind };
}
