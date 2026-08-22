export type WhitelistAuditTarget = {
  name: string | null;
  steamId: string;
};

function missing(value: unknown): boolean {
  return value == null || value === "";
}

export function fillMissingWhitelistTarget(
  detail: Record<string, unknown> | null,
  target: WhitelistAuditTarget | undefined,
): Record<string, unknown> | null {
  if (!target) return detail;
  const next: Record<string, unknown> = { ...(detail ?? {}) };
  if (missing(next.name) && target.name) next.name = target.name;
  if (missing(next.steamId) && target.steamId) next.steamId = target.steamId;
  return next;
}
