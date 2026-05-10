# Whitelist Activity Panel — Field Diffs + Exact-Time Tooltips

Date: 2026-05-10
Status: Approved

## Problem

The Activity panel on the whitelist entry detail (`packages/web/app/(protected)/whitelist/page.tsx`) shows rows like:

```
oleed. updated entry        just now
oleed. added a comment      just now
oleed. updated entry        8d ago
```

It does not say *what* was updated, and the relative time has no way to see the precise timestamp.

## Goal

Surface what changed on `whitelist.update` (all changed fields, from → to), show comment previews for `whitelist.comment.add`, and let users hover any relative-time span for an exact local date+time.

## Non-Goals

- Backfilling diffs for audit entries written before this change (legacy entries continue to render as today).
- Editing or rolling back from the activity panel.
- Diffs on bulk operations (`whitelist.bulk_update`, etc.) — those keep their current rendering.

## Design

### API: capture before/after on update

File: `packages/api/src/routes/whitelist.ts` — `PUT /:id` handler at line 431. The audit call is at line 474.

The handler already loads `existing` (line 435, pre-update) and produces `entry` (line 455, post-update). We diff between those two. Build a `changes` map containing only fields whose effective value differs:

```ts
const changes: Record<string, { from: unknown; to: unknown }> = {};
const trackedFields = [
  "steamId", "name", "clan", "clanId", "role",
  "groupId", "reason", "expiresAt", "userId",
] as const;
for (const f of trackedFields) {
  const before = serialize((existing as any)[f]);
  const after = serialize((entry as any)[f]);
  if (before !== after) {
    changes[f] = { from: before, to: after };
  }
}
audit(c, "whitelist.update", "WhitelistEntry", id, { steamId: existing.steamId, changes });
```

Notes:
- `serialize` normalizes `Date → ISO string`, `undefined → null`, leaves other primitives as-is. With both sides serialized, equality is a `===` check (sufficient for the field types involved — strings, numbers, nullable strings, ISO dates).
- The `trackedFields` list mirrors the fields the `PUT /:id` handler will write (lines 458–468). If a field is added there in the future it should be added here too.
- Keep the existing `steamId` in the audit detail so server-side log queries that look it up still work.

### API: comment preview

File: same, around line 521 (`audit(c, "whitelist.comment.add", ...)`).

Add a `textPreview` (first 200 chars of `text`) to the audit detail:

```ts
audit(c, "whitelist.comment.add", "WhitelistEntry", entryId, {
  commentId: comment.id,
  textPreview: text.slice(0, 200),
});
```

200 chars is enough for the UI to show ~60 chars inline and the rest in a hover tooltip.

### Web: render diffs

File: `packages/web/app/(protected)/whitelist/page.tsx` — Activity panel block (lines 1449–1484) and `getActionVerb` (line 567).

Replace the per-log render with a small component that branches on action:

- `whitelist.update`:
  - If `log.detail.changes` is missing or empty → render exactly as today (`updated entry`, no expand affordance) — this preserves legacy entries.
  - Else → render header `oleed updated entry (N changes)` with a chevron toggle. Default collapsed.
  - When expanded, render an indented list of `field: from → to` rows. Use a small `formatField` helper to humanize labels (`groupId → Group`, `expiresAt → Expires`, `userId → Linked user`, etc.) and a `formatValue(field, value)` helper to resolve display values:
    - `groupId` → look up group name from already-loaded groups list, fallback to id.
    - `clanId` → look up clan name from already-loaded clans list, fallback to id.
    - `expiresAt` → locale date string (`Jun 1, 2026`); `null` → `—`.
    - `userId` → look up Discord display name if available, fallback to id; `null` → `—`.
    - `clan`, `name`, `role`, `reason`, `steamId` → string as-is.
    - empty string / null → `—`.

- `whitelist.comment.add`:
  - Render `oleed added a comment: "<first 60 chars>…"` with `title={textPreview}` so the full preview is visible on hover. If `textPreview` is missing (legacy), render as today.

- All other actions: unchanged.

### Web: exact-time tooltip

The relative-time span at line 1477 (`<span ...>{formatRelativeTime(log.createdAt)}</span>`) gets a `title` attribute:

```tsx
<span
  className="ml-1.5 text-text-muted"
  title={new Date(log.createdAt).toLocaleString()}
>
  {formatRelativeTime(log.createdAt)}
</span>
```

This uses the native browser tooltip — no new components. The same pattern should be applied wherever the activity log shows a relative time (e.g. the standalone Activity tab around line 2121, if it has the same affordance).

### Type updates

`packages/shared/types/api.ts` — `AuditLogEntry.detail` is already typed as `Record<string, unknown> | null`, so no breaking type change. Optionally introduce a narrower type for the whitelist actions to make the renderer code clearer:

```ts
type WhitelistUpdateDetail = {
  steamId: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
};
type WhitelistCommentAddDetail = {
  commentId: string;
  textPreview?: string;
};
```

Used internally in `page.tsx`; not exported across the API boundary.

## Migration / Compatibility

- No DB migration required (`AuditLog.detail` is already a JSON column).
- Legacy audit rows: detect by absence of `changes` (for updates) or `textPreview` (for comments) and fall back to current rendering. No collapse affordance, no inline preview.

## Testing

- Manual: edit a whitelist entry, change one field — confirm `(1 change)` appears, expanding shows `field: from → to`. Repeat with multiple fields.
- Manual: add a comment of varied lengths (short, ~60 chars, >200 chars) — confirm preview truncation and tooltip behavior.
- Manual: hover any "Xd ago" — confirm tooltip shows full local date+time.
- Manual: open an entry that has audit history from before this change — confirm rows render unchanged with no broken expansion UI.

## Open Questions

None outstanding.
