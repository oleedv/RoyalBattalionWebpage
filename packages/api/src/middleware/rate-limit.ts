import { createMiddleware } from "hono/factory";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60 * 1000);

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    || c.req.header("x-real-ip")
    || "unknown";
}

function isRateLimited(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count++;
  return entry.count > maxRequests;
}

/**
 * Per-route rate limiter. Apply to specific routes.
 */
export function rateLimit(maxRequests: number, windowMs: number = 60_000) {
  return createMiddleware(async (c, next) => {
    const ip = getClientIp(c);
    const path = c.req.path;
    const key = `${ip}:${path}`;

    if (isRateLimited(key, maxRequests, windowMs)) {
      return c.json({ success: false, error: "Too many requests" }, 429);
    }

    await next();
  });
}

/**
 * Global rate limiter. Apply as middleware to the entire app.
 */
export function globalRateLimit(maxRequests: number = 200, windowMs: number = 60_000) {
  return createMiddleware(async (c, next) => {
    const ip = getClientIp(c);
    const key = `global:${ip}`;

    if (isRateLimited(key, maxRequests, windowMs)) {
      return c.json({ success: false, error: "Too many requests" }, 429);
    }

    await next();
  });
}
