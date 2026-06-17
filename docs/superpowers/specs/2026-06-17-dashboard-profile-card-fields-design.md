# Dashboard profile card: Country, DOB, Activity & Seed time

**Date:** 2026-06-17
**Status:** Approved (design)

## Summary

Extend the profile header card at the top of the protected **Dashboard**
(`packages/web/app/(protected)/dashboard/page.tsx`) so it shows, in addition to
the current avatar / name / Discord ID / Steam ID / EOS ID / role:

- **Country**
- **Date of Birth**
- **Activity** (30-day and 90-day playtime, hours)
- **Seed time** (30-day and 90-day, hours)

The user cannot edit any of the identity fields here. Every **immutable** field
(Discord ID, Steam ID, EOS ID, Country, DOB, Role) gets a hover tooltip reading:

> If this is incorrect, create a community ticket.

Activity and Seed time are computed gameplay stats and get **no** tooltip.

This is distinct from the admin-facing `UserProfileContent` component (used on
Members / by-steamid pages), which already renders these fields. This change
brings the equivalent self-view to the user's own Dashboard.

## Data sources

| Field | Source | Status |
|-------|--------|--------|
| Country | `displayUser.country` (`UserWithRoles`) | Already on the client |
| Date of Birth | `displayUser.dateOfBirth` (`UserWithRoles`) | Already on the client |
| Activity 30d/90d | SquadJS `squadjs_connections` (session_duration) | Needs backend |
| Seed time 30d/90d | SquadJS `squadjs_connections` (seed_duration) | Needs backend |

`UserWithRoles` (the dashboard's `contextUser` / `linkSteam` payload) already
carries `country` and `dateOfBirth`, so those two are a pure frontend change.

Activity and seed time are only available today via `GET /playtime?steamId=…`,
which is gated behind `view:whitelist | view:members | view:live-server`. A
regular member viewing their own dashboard may not hold those permissions, so a
self-scoped path is required.

## Approach (chosen: A)

**A — Dedicated self-scoped endpoint `GET /playtime/me`.** Reuses the existing
playtime SQL but keys off the logged-in user's *own* `steamId` (resolved from
the JWT `userId`), so it needs only `authMiddleware` — no admin permission.
Dashboard fetches it once on mount. Keeps the SquadJS query off the hot
auth/stats paths.

Rejected alternatives:
- **B — Fold into `/stats/summary`:** that route polls every 30s, so it would
  re-run the SquadJS query needlessly, and it currently holds community-wide
  stats, not per-user data.
- **C — Fold into `/auth/me` / `syncAuth`:** adds a SquadJS join to the auth
  path that runs on every page load and every 2-minute resync. Wrong layer.

## Components

### Backend — `GET /playtime/me`

In `packages/api/src/routes/playtime.ts`, register a `/me` handler with
`authMiddleware` only, placed **before** the blanket
`playtime.use("*", requirePermission(...))` so it is not admin-gated.

Behaviour:
1. Read `userId` from auth context.
2. Look up the user's `steamId` (`prisma.user.findUnique`).
3. If no `steamId`: return `{ steamId: null, playtime30: 0, playtime90: 0, seed30: 0, seed90: 0 }`.
4. Otherwise run the existing playtime aggregate query (the same SQL used by
   `GET /playtime`) and return the rounded hours.

Response shape (matches the existing `/playtime` data block):

```jsonc
{
  "success": true,
  "data": {
    "steamId": "765…" ,        // null when not linked
    "playtime30": 12.5,
    "playtime90": 40.0,
    "seed30": 3.0,
    "seed90": 9.5
  }
}
```

### Shared types

Add to `packages/shared` (e.g. `types/user.ts` or a small `activity.ts`):

```ts
export interface ActivityStats {
  steamId: string | null;
  playtime30: number;
  playtime90: number;
  seed30: number;
  seed90: number;
}
```

### API client

In `packages/web/lib/api-client.ts`:

```ts
export function getMyActivity(token: string): Promise<ApiResponse<ActivityStats>> {
  return request<ActivityStats>("/playtime/me", { headers: authHeaders(token) });
}
```

### Frontend — Dashboard profile card

`packages/web/app/(protected)/dashboard/page.tsx`:

1. **Country + DOB** — add to the existing IDs cluster, same compact style as
   the Discord/Steam/EOS entries. DOB formatted with `formatDate` from
   `@/lib/format`. Missing value → `--`.
2. **Activity row** — a new sub-section in the profile card (visually grouped,
   like the role row sits under a divider). Four values: `Activity 30d`,
   `Activity 90d`, `Seed time 30d`, `Seed time 90d`, in hours.
   - No linked Steam (`activity.steamId === null`): show a subtle hint
     "Link your Steam to see activity" instead of the numbers.
   - Before fetch resolves: render `--`.
3. **Tooltip** — a small reusable hover-tooltip wrapper (matching the existing
   `group` / `group-hover` tooltip already used for online users in the
   sidebar) wrapping each immutable field (Discord ID, Steam ID, EOS ID,
   Country, DOB, Role). Text: "If this is incorrect, create a community
   ticket." Plain text, no link.
4. **Fetch** — add `getMyActivity(apiToken)` to the existing effect (or a small
   dedicated one) that runs once when `apiToken` becomes available; store the
   result in component state. Independent of the 30s `getDashboardStats` poll
   (playtime is slow-changing).

## Error handling

- `GET /playtime/me` SquadJS query failure → the route returns the standard
  error envelope; the dashboard leaves Activity values at `--` and renders the
  rest of the card normally (activity is non-critical).
- No linked Steam → handled as a first-class state (hint text), not an error.

## Testing

- Endpoint: authenticated user with a linked Steam returns non-zero values when
  connection rows exist; user without a linked Steam returns the zeroed payload
  with `steamId: null`; the route is reachable **without** the whitelist/members
  /live-server permissions.
- Frontend: card renders Country/DOB from the user object (and `--` when null);
  Activity row shows the four values, the "link Steam" hint when unlinked, and
  `--` while loading; tooltip appears on hover over each immutable field.

## Out of scope

- Editing any of these fields from the dashboard (read-only by design).
- Backfilling Country/DOB data.
- Changes to the admin `UserProfileContent` view.

## Notes

- Bump the web package version per repo convention before the push.
