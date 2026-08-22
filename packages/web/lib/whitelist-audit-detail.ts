function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function whitelistSubject(detail: Record<string, unknown> | null | undefined): string {
  if (!detail) return "";
  const name = asNonEmptyString(detail.name);
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

function withSubject(detail: Record<string, unknown>, text: string): string {
  const who = whitelistSubject(detail);
  return who ? `${who} · ${text}` : text;
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

function updateSummary(detail: Record<string, unknown>, changeParts: string[]): string {
  const who = whitelistSubject(detail);
  const base = who ? `Updated entry on ${who}` : "Updated entry";
  const extra = updateChangeText(detail, changeParts);
  return extra ? `${base} · ${extra}` : base;
}

function commentPreview(detail: Record<string, unknown>): string | null {
  const preview = asNonEmptyString(detail.textPreview);
  if (!preview) return null;
  return preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;
}

export function formatWhitelistActionSummary(
  action: string,
  detail: Record<string, unknown> | null | undefined,
  changeParts: string[] = [],
): string {
  const d = detail ?? {};
  const who = whitelistSubject(d) || "entry";
  switch (action) {
    case "whitelist.add":
      return `Added ${who}${d.server ? ` on ${d.server}` : ""}`;
    case "whitelist.update":
      return updateSummary(d, changeParts);
    case "whitelist.delete":
      return `Removed ${who}${d.server ? ` from ${d.server}` : ""}`;
    case "whitelist.bulk_add":
      return `Added ${d.created ?? "?"} entries (${d.skipped ?? 0} skipped)`;
    case "whitelist.bulk_update":
      return `Updated ${d.count ?? "?"} entries`;
    case "whitelist.bulk_delete":
      return `Deleted ${d.count ?? "?"} entries`;
    case "whitelist.comment.add": {
      const preview = commentPreview(d);
      return withSubject(d, preview ? `Commented: "${preview}"` : "Added comment");
    }
    case "whitelist.comment.delete":
      return withSubject(d, "Deleted comment");
    default:
      return action;
  }
}
