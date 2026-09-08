import { createMiddleware } from "hono/factory";
import { logger } from "../lib/logger";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  limited: boolean;
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

export function resetRateLimitBuckets() {
  buckets.clear();
}

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(key);

  if (!entry || entry.resetAt <= now) {
    const newEntry = { count: 1, resetAt: now + windowMs };
    buckets.set(key, newEntry);
    return { limited: false, count: 1, resetAt: newEntry.resetAt };
  }

  entry.count++;
  return { limited: entry.count > maxRequests, count: entry.count, resetAt: entry.resetAt };
}

/**
 * Per-route rate limiter. Apply to specific routes.
 */
export function rateLimit(maxRequests: number, windowMs: number = 60_000) {
  return createMiddleware(async (c, next) => {
    const ip = getClientIp(c);
    const path = c.req.path;
    const key = `${ip}:${path}`;
    const result = checkRateLimit(key, maxRequests, windowMs);

    if (result.limited) {
      const retryAfterMs = Math.max(0, result.resetAt - Date.now());
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      logger.warn("rate-limit", `BLOCKED scope=route path=${path} ip=${ip} count=${result.count}/${maxRequests} retryIn=${retryAfterSec}s`);
      c.header("Retry-After", String(retryAfterSec));
      return c.json({
        success: false,
        error: "Too many requests",
        detail: { scope: "route", path, ip, limit: maxRequests, windowMs, retryAfterMs },
      }, 429);
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
    const path = c.req.path;
    const key = `global:${ip}`;
    const result = checkRateLimit(key, maxRequests, windowMs);

    if (result.limited) {
      const retryAfterMs = Math.max(0, result.resetAt - Date.now());
      const retryAfterSec = Math.ceil(retryAfterMs / 1000);
      logger.warn("rate-limit", `BLOCKED scope=global path=${path} ip=${ip} count=${result.count}/${maxRequests} retryIn=${retryAfterSec}s`);
      c.header("Retry-After", String(retryAfterSec));
      return c.json({
        success: false,
        error: "Too many requests",
        detail: { scope: "global", path, ip, limit: maxRequests, windowMs, retryAfterMs },
      }, 429);
    }

    await next();
  });
}
