# Tickets Page: Server-Side Search & Pagination

Date: 2026-07-10
Status: Approved (design)
Scope: `packages/api` (tickets/legacy-tickets routes), `packages/web` (tickets page), `packages/shared` (types)

## Problem

The staff Tickets page shows only ~600 tickets even though far more exist, has no
real (server-backed) pagination, and cannot search inside ticket message bodies.

### Root cause (verified against prod `Royal_secretary_prod`)

| Table                    | Rows    | Cap in API | Visible |
|--------------------------|---------|------------|---------|
| `tickets`                | 175     | 500        | all 175 |
| `legacy_tickets`         | 5,611   | **500**    | 500     |
| `ticket_messages`        | 1,065   | n/a        | on expand |
| `legacy_ticket_messages` | 162,584 | n/a        | on expand |

`legacy-tickets.ts` hardcodes `LEGACY_TICKETS_CAP = 500`, so 5,111 legacy tickets are
unreachable. 175 current + 500 legacy = ~675, i.e. "about 600". The frontend fetches
the full (capped) lists once and paginates/searches entirely client-side, so message
bodies — which are never loaded in the list view — cannot be searched at all.

### Additional findings

- `tickets.reason` (TEXT) is **100% populated** but is never selected by the API nor
  shown in the UI. It is the single best field to promote (the opening reason).
- `tickets.anonymous_mode` exists (2 rows set).
- 5,608 / 5,611 legacy tickets have a user message available for a preview.
- Legacy message `type` splits into real conversation (`from_user` 39k, `to_user` 21k,
  `bot_to_user` 11k, `chat` 43k) vs. noise (`command` 26k, `bot` 21k). Body search and
  previews should prefer conversational types.
- No FULLTEXT index exists on either message table; only `PRIMARY` and `idx_ticket_id`.

## Decisions (confirmed with user)

- **Full server-side** search + pagination (unified endpoint across both tables).
- **One unified search box**: a query matches metadata AND message bodies at once.
- **Smart preview**: show a highlighted matching snippet when the keyword hit a body;
  otherwise show the opening reason (current) / first user message (legacy).
- **Include a date-range filter.**
- **Prospects tab: unchanged** (small dataset, existing client-side behavior kept).

## Architecture

### New endpoint: `GET /v1/tickets/search`

Replaces the list role of `GET /v1/tickets` and `GET /v1/legacy-tickets` for the page.
The by-uuid and `:id` detail endpoints stay exactly as-is (still used for expand/detail
and public lookup). The old list endpoints may remain for compatibility but the page no
longer calls them.

**Auth/permissions:** same middleware as the existing list endpoints
(`view:tickets` / `manage:tickets` / tier-specific). Current-ticket rows are filtered to
the caller's allowed tiers via `getAllowedTicketTiers`. Legacy rows carry no tier and
remain visible to any caller holding a ticket-view permission (preserves today's
behavior).

**Query params:**

| Param      | Meaning                                                        |
|------------|----------------------------------------------------------------|
| `q`        | keyword; matches metadata + message bodies (min 2 chars)       |
| `status`   | `all` \| `open` \| `closing` \| `closed`                       |
| `type`     | `all` \| a tier (`normal`…`whitelist`) \| `legacy`             |
| `from`,`to`| ISO dates; filter by created_at (current) / started_at (legacy)|
| `page`     | 0-based page index                                             |
| `pageSize` | one of 10/20/50/100/500 (server-validated, default 20)         |

**Response:** `{ items: UnifiedTicketRow[], total: number, page, pageSize }`.

`UnifiedTicketRow` (new shared type):

```
kind: "current" | "legacy"
id, uuid
tier: string | null        // null for legacy
status: string             // "closed" for legacy
userId: string
userLabel: string | null   // legacy username/nickname; null for current (resolved client-side)
createdAt: string          // created_at | started_at
closedAt: string | null
threadNumber?: number | null
preview: string | null     // reason | first user message, truncated (~160 chars)
snippet: { text: string; matchStart: number; matchLen: number } | null  // set when q hit a body
matchedIn: "meta" | "body"
```

### Query strategy (MariaDB, raw SQL via `getSecretaryDb`)

Three bounded queries per request:

1. **Page + total.** Build two `SELECT`s over `tickets` and `legacy_tickets` with a
   common projection, `UNION ALL`, wrap, `ORDER BY sort_date DESC`, `LIMIT/OFFSET`.
   - Tier filter on the current-side `WHERE`; status filter per side; date filter per
     side (`created_at` / `started_at`).
   - Keyword: `(metadata LIKE %q%) OR EXISTS (SELECT 1 FROM <messages> m WHERE
     m.ticket_id = t.id AND <type filter for legacy> AND m.content LIKE %q%)`.
     Metadata columns — current: id, uuid, user_id, reason; legacy: id, uuid, user_id,
     username, nickname, thread_number.
   - `total` via a matching `COUNT` (two `EXISTS`-filtered counts summed). Correlated
     `EXISTS` over `idx_ticket_id` visits each ticket's own messages — total LIKE work
     ≈ one pass over the message tables (~160k evals), acceptable for a debounced,
     staff-only, `LIMIT`-bounded search. FULLTEXT index is the fallback if it drags.
2. **Previews.** For the returned page's legacy ids only, fetch the earliest
   conversational message per ticket (`type IN ('from_user','chat')`, fallback any).
   Current-side preview = `reason` (already selected in query 1). Bounded to ≤ pageSize.
3. **Snippets.** Only when `q` present: for the page's ids whose match was in the body,
   fetch one matching message per ticket, extract a ~160-char window around the first
   case-insensitive match, and return `{ text, matchStart, matchLen }`. Bounded to
   ≤ pageSize.

Substring `LIKE` (not FULLTEXT) is used so partial fragments / partial names / id
substrings match intuitively.

### Frontend (`app/(protected)/tickets/page.tsx`)

- The **tickets tab** becomes server-driven. `q` (debounced 300ms), `status`, `type`,
  date range, `page`, `pageSize` are request params. Render `items` directly; drive the
  existing pagination controls from `total`/`pageSize`; show a real total
  ("5,786 tickets"). Loading state on each fetch.
- Each row renders a **preview line**; when `snippet` is present, render it with the
  matched span highlighted. Small "anon" badge when a current ticket is anonymous.
- **Date-range** inputs added to the filter bar (tickets tab only).
- **Expand-to-detail unchanged**: still calls `GET /:id` / `GET /legacy-tickets/:id`.
- Names: current-ticket `userId`/`closedBy`/event actors still resolved via
  `resolveDiscordNames` as today; legacy uses `userLabel`.
- **Prospects tab untouched** (its own client-side path stays).

### Shared types (`packages/shared/types/tickets.ts`)

Add `UnifiedTicketRow` and `TicketSearchResponse`. Existing `Ticket` / `LegacyTicket`
unchanged.

### API client (`packages/web/lib/api-client.ts`)

Add `searchTickets(token, params): Promise<ApiResponse<TicketSearchResponse>>`.
Keep existing ticket functions.

## Testing

- **API integration tests** for `/tickets/search` following existing route-test
  patterns: pagination math (total, offset, last page), metadata match, body match
  (finds a ticket only by a word inside a message), tier-permission filtering (a
  tier-limited caller does not see other tiers' current tickets), status filter, date
  filter, snippet extraction (window + match offsets), empty/short `q` behavior, and
  the unified sort ordering across both tables.
- Follow the repo's existing test harness for mocking `getSecretaryDb`.

## Delivery

- Bump webpage version (minor) in root `package.json` (and `packages/web` if that is the
  convention for the change).
- No bot or DB schema changes (read-only against the bot-owned DB; `LIKE` approach needs
  no index migration).
- Deploy via the `production` branch (Railway auto-deploy, per project convention).

## Out of scope

- Prospects tab (unchanged).
- FULLTEXT index migration (documented as the fallback only).
- Any write/mutation to tickets.
