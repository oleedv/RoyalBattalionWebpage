-- One-shot backfill for WhitelistEntry.userId after `bun run db:push` adds the column.
-- Safe to re-run: only updates rows where userId IS NULL and a User with the same steamId exists.

UPDATE WhitelistEntry we
JOIN User u ON u.steamId = we.steamId
SET we.userId = u.id
WHERE we.userId IS NULL;
