import { Hono } from "hono";
import { apiTokenAuth } from "../middleware/api-token-auth";
import { checkRateLimit } from "../middleware/rate-limit";
import { assembleLiveStatus } from "../lib/live-status-assemble";
import { etagFor } from "../lib/live-status-payload";
import { recordApiTokenUsage } from "../lib/api-token-usage";
import { success, fail } from "../lib/crud-helpers";

const liveStatus = new Hono<{ Variables: { apiTokenId: string; apiTokenScope: string } }>();

liveStatus.use("*", apiTokenAuth);

liveStatus.get("/status", async (c) => {
  const tokenId = c.get("apiTokenId");
  const rl = checkRateLimit(`api-token:${tokenId}`, 30, 60_000);
  if (rl.limited) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    c.header("Retry-After", String(retryAfterSec));
    void recordApiTokenUsage(tokenId, "rateLimited");
    return fail(c, "Too many requests", 429);
  }

  const server = c.req.query("server") || null;
  const includePlayers = c.req.query("players") === "1";

  try {
    const result = await assembleLiveStatus({ server, includePlayers });
    if (result.notFound) {
      void recordApiTokenUsage(tokenId, "error");
      return fail(c, "Server not found", 404);
    }
    if (result.unavailable) {
      void recordApiTokenUsage(tokenId, "error");
      return fail(c, "Server status unavailable", 503);
    }

    const data = server ? result.payloads[0] : result.payloads;
    const etag = etagFor(data);
    c.header("ETag", etag);
    c.header("Cache-Control", "private, max-age=20");
    if (c.req.header("If-None-Match") === etag) {
      void recordApiTokenUsage(tokenId, "ok");
      return c.body(null, 304);
    }

    void recordApiTokenUsage(tokenId, "ok");
    return success(c, data);
  } catch {
    void recordApiTokenUsage(tokenId, "error");
    return fail(c, "Server status unavailable", 503);
  }
});

export default liveStatus;
