function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asNonEmptyString(v)).filter(Boolean);
}

export function whitelistSubject(detail: Record<string, unknown> | null | undefined): string {
  if (!detail) return "";
  const name = asNonEmptyString(detail.name) || asNonEmptyString(detail.targetName);
  const steamId = asNonEmptyString(detail.steamId);
  if (name && steamId) return `${name} (${steamId})`;
  return name || steamId;
}

export function formatExtendedByDays(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("extendedByDays" in value)) return null;
  const n = (value as { extendedByDays: unknown }).extendedByDays;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return `+${n} day${n === 1 ? "" : "s"}`;
}

function onPlayer(verb: string, detail: Record<string, unknown>, extra?: string | null): string {
  const who = whitelistSubject(detail);
  const base = who ? `${verb} on ${who}` : verb;
  return extra ? `${base} · ${extra}` : base;
}

function updateChangeText(detail: Record<string, unknown>, changeParts: string[]): string | null {
  if (changeParts.length > 0) {
    if (changeParts.length <= 2) return changeParts.join(" · ");
    return `${changeParts.slice(0, 2).join(" · ")} · +${changeParts.length - 2} more`;
  }
  const changes = detail.changes;
  if (changes && typeof changes === "object" && "expiresAt" in changes) {
    const ext = formatExtendedByDays((changes as Record<string, unknown>).expiresAt);
    if (ext) return `Expires ${ext}`;
  }
  return null;
}

function commentPreview(detail: Record<string, unknown>): string | null {
  const preview = asNonEmptyString(detail.textPreview);
  if (!preview) return null;
  const trimmed = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;
  return `"${trimmed}"`;
}

function bulkWho(detail: Record<string, unknown>): string | null {
  const names = stringList(detail.names);
  const steamIds = stringList(detail.steamIds);
  const labels = names.length > 0 ? names : steamIds;
  if (labels.length === 0) return null;
  const shown = labels.slice(0, 3).join(", ");
  return labels.length > 3 ? `${shown} · +${labels.length - 3} more` : shown;
}

function bulkSummary(verb: string, count: unknown, detail: Record<string, unknown>, extra?: string | null): string {
  const base = `${verb} ${count ?? "?"} entries`;
  const who = bulkWho(detail);
  const withWho = who ? `${base} on ${who}` : base;
  return extra ? `${withWho} · ${extra}` : withWho;
}

function serverExtra(detail: Record<string, unknown>): string | null {
  const server = asNonEmptyString(detail.server);
  return server || null;
}

export function formatWhitelistActionSummary(
  action: string,
  detail: Record<string, unknown> | null | undefined,
  changeParts: string[] = [],
): string {
  const d = detail ?? {};
  switch (action) {
    case "whitelist.add":
      return onPlayer("Added entry", d, serverExtra(d));
    case "whitelist.update":
      return onPlayer("Updated entry", d, updateChangeText(d, changeParts));
    case "whitelist.delete":
      return onPlayer("Removed entry", d, serverExtra(d));
    case "whitelist.bulk_add":
      return bulkSummary("Added", d.created, d, d.skipped != null ? `${d.skipped} skipped` : null);
    case "whitelist.bulk_update":
      return bulkSummary("Updated", d.count, d);
    case "whitelist.bulk_delete":
      return bulkSummary("Deleted", d.count, d);
    case "whitelist.comment.add":
      return onPlayer("Added comment", d, commentPreview(d));
    case "whitelist.comment.delete":
      return onPlayer("Deleted comment", d);
    case "whitelist.deactivate":
      return whitelistSubject(d)
        ? onPlayer("Deactivated entry", d)
        : bulkSummary("Deactivated", d.count ?? 1, d);
    case "whitelist.reactivate":
      return whitelistSubject(d)
        ? onPlayer("Reactivated entry", d)
        : bulkSummary("Reactivated", d.count ?? 1, d);
    default:
      if (action.startsWith("whitelist.")) {
        const label = action.split(".").slice(1).join(" ").replace(/_/g, " ");
        const verb = label.charAt(0).toUpperCase() + label.slice(1);
        return onPlayer(verb, d);
      }
      return action;
  }
}
