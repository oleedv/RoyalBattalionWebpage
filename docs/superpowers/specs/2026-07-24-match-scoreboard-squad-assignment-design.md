# Match Scoreboard Squad Assignment Design

**Date:** 2026-07-24  
**Status:** Approved (interview + design sections)  
**Repos:** RoyalBattalionWebpage, SquadJS-Royal-battalion  

## Problem

Public match pages (`/matches`) group scoreboard players by `MatchPlayer.squad`. In practice, each squad often shows **only the squad leader**, with everyone else under **Unassigned**.

### Root cause (from codebase)

1. **Capture** — `SquadJS-Royal-battalion/squad-server/plugins/db-log-scoreboard.js` snapshots `this.server.players` / `this.server.squads` at `ROUND_ENDED` **without** forcing a fresh `ListPlayers` / `ListSquads`. `squad_name` / `team_name` come only from the in-memory squad map; if the map misses a `(teamID, squadID)`, members get `squad_id` (sometimes) but **null** `squad_name`. Prior comments in the assembler also note name resolution failing for non-SL rows at end-of-round.

2. **Assembly** — `packages/api/src/lib/match-assembler.ts` already fills missing names from SL rows / `squadjs_squad_creations` when `squad_id` is present. That is insufficient when:
   - members have **null** `squad_id` on the scoreboard row, or
   - players appear only via combat (leavers) with empty squad, or
   - stored `matchDetail` JSON was never **resynced** after earlier fill fixes.

3. **Display** — `packages/web/app/(public)/matches/page.tsx` groups by the `squad` string; empty becomes `"Unassigned"`.

## Goals

1. Every player **connected at match end** (present in `squadjs_scoreboard`) appears on the match scoreboard.
2. Each is placed in **their end-of-match RCON squad** when knowable.
3. Players truly without a squad stay in a single **Unassigned** group per team (last).
4. A squad must not be *silently* invented or rebalanced; game max **9** is a soft check only (trust RCON; log if violated).
5. Repair history (assembler recovery + full resync) and fix future captures (SquadJS).

## Non-goals

- Live-server roster UI changes
- Changing combat-event logging schema
- Restructuring `matchDetail` into nested `teams → squads[] → players[]`
- Majority-of-match or “best guess pack into 9” assignment
- Hard-dropping players to enforce max 9

## Decisions (interview summary)

| Topic | Decision |
| --- | --- |
| Fix layer | Both: SquadJS capture + website assembler |
| “Their squad” | RCON state at `ROUND_ENDED` |
| Roster | Scoreboard snapshot only |
| Max 9 | Soft-check / display as captured |
| Capture refresh | Force await ListPlayers + ListSquads |
| Historical gaps | Name fill + last combat `squad_id` |
| No scoreboard rows | Keep legacy assembler path |
| Existing matches | Full resync after deploy |
| Ordering | `squadId` asc; SL first; kills desc; Unassigned last |
| Schema | Optional `squadId` on `MatchPlayer` |
| Deploy order | SquadJS first → website → full resync |
| Refresh failure | Fall back to last in-memory roster; still snapshot |
| Stats | Full-match K/D/revives/TKs for final-roster players |
| True unassigned | Label `Unassigned`, last group |
| Package | B — capture harden + assembler recovery |

## Architecture

```
ROUND_ENDED
    → DBLogScoreboard: force updateSquadList + updatePlayerList
      (on failure: log, use in-memory roster)
    → upsert squadjs_scoreboard rows
    → assembleMatchDetail (website)
         if scoreboard: roster = scoreboard only;
           stats from full-match combat for those players;
           squad = name → (team,id) fill → last combat squad_id → Unassigned
         else: legacy path unchanged
    → Match.matchDetail JSON → /matches UI
```

### Components

| Component | Responsibility |
| --- | --- |
| `squad-server/plugins/db-log-scoreboard.js` | Fresh RCON roster before snapshot; fail-open |
| `packages/api/src/lib/match-assembler.ts` | Scoreboard-only roster; name + combat fill; `squadId`; sort |
| `packages/shared/types/match.ts` (+ assembler JSON types) | `squadId?: number \| null` on `MatchPlayer` |
| `packages/web/app/(public)/matches/page.tsx` | Order squads by `squadId`; Unassigned last; respect SL-first order |
| Existing `POST /matches/resync` | Rebuild all stored `matchDetail` after assembler ships |

## Detailed behavior

### Capture (`db-log-scoreboard.js`)

On `ROUND_ENDED`, after open `matchId` is resolved:

1. `try { await this.server.updateSquadList(); await this.server.updatePlayerList(); } catch { verbose(1); use existing memory }`
2. Build squad map keyed by `` `${teamID}-${squadID}` `` (unchanged).
3. For each player with `eosID` (dedupe by eos): upsert scoreboard with `team_id`, `squad_id`, `squad_name` / `team_name` / size / locked from map when resolvable, `is_leader`, `role`.

No DB schema change. `updatePlayerList` / `updateSquadList` already return deduplicated promises and are safe to await from a plugin.

### Assembler — scoreboard present

1. **Roster:** only `squadjs_scoreboard` rows for the match (join `squadjs_players` for identity/name). Do not add death-only leavers.
2. **Stats:** for those identities only, accumulate kills / deaths / teamkills / revives from full-match combat events (existing identity matching).
3. **Squad per row** (priority):
   1. `squad_name` from scoreboard if present; keep `squad_id`.
   2. Else if `squad_id` present: fill name from any scoreboard row with same `(teamId, squadId)` that has a name; else latest `squadjs_squad_creations` for that pair (existing creation collapse rules).
   3. Else if `squad_id` null: take that player’s **last non-null** combat `attacker_squad_id` / `victim_squad_id` / `reviver_squad_id` in this match (by event time). Resolve name via step 2. Set `squadId` from that id.
   4. Else: `squad = "Unassigned"`, `squadId = null`.
4. **`isSquadLeader`:** scoreboard `is_leader` only (never inferred from combat or role alone in this path).
5. **Team / factions / winner:** keep existing logic; scoreboard `team_id` authoritative for roster.
6. **Sort** before emit:
   - `squadId` ascending (`null` last → Unassigned last)
   - within squad: `isSquadLeader` first, then kills desc, then name
7. **Soft max-9:** if any `(teamId, squadId)` has more than 9 players, `logger.warn` once per match/squad; still include all players.
8. Emit players with `squadId: number | null`.

### Assembler — no scoreboard

Unchanged legacy path (spawns, deaths, squad_creations).

### Frontend

- Group by `squad` string (display name).
- Order groups by minimum `squadId` in the group (`null` last).
- Prefer API pre-sorted order within groups (SL first).
- If `squadId` missing (pre-resync JSON): fall back to current first-seen grouping until resync.

### Cutover

1. Deploy **SquadJS** capture fix (production/staging as usual).
2. Deploy **website** assembler + shared type + matches UI.
3. Run **full** `POST /matches/resync` with `manage:matches`.

## Error handling

| Failure | Behavior |
| --- | --- |
| Force RCON refresh fails | Log; snapshot last in-memory roster |
| `ensurePlayer` fails for one player | Skip row; continue (existing) |
| Missing scoreboard table (errno 1146) | Existing try/catch; treat as no scoreboard |
| Combat identity ambiguity | Same steam/eos resolution as death processing |
| Resync per-match error | Log; continue other matches (existing) |

## Testing

1. Fixture: SL has `squad_name`, members only `squad_id` → all get same name.
2. Members with null `squad_id` + combat last squad → filled; no combat → Unassigned.
3. Death-only leaver not on scoreboard → absent from output.
4. Sort: squad id order, SL first within squad, Unassigned last.
5. Soft >9: all players kept; warn path if observable in tests.
6. Legacy path: no scoreboard still produces a player list.
7. Optional: plugin-level assertion that refresh is awaited before upsert (if harness exists).

## Success criteria

- After SquadJS deploy: new scoreboard rows for in-squad members include `squad_id`, and `squad_name` when ListSquads resolves the squad.
- After website + full resync: public match pages show full squads for recoverable matches, not SL-only islands.
- Unassigned only for true end-of-match unassigned players or unrecoverable historical rows.

## Implementation notes (for planning)

- Prefer querying combat squad ids only when needed (scoreboard players with null `squad_id`), or one match-scoped query aggregated to last-per-player, to avoid N+1.
- Keep `MatchPlayer.squad` as the display string (`"Unassigned"` when empty) for backward compatibility with existing UI and any consumers of matchDetail.
- Do not add AI/tool attribution to commits; Conventional Commits one-liners.

## Open items resolved in interview

None remaining for v1 of this design.
}