import type { Context } from "hono";
import type { Paginated } from "shared";

/**
 * Parse standard `?page` / `?limit` query params with sane bounds.
 * Returns page (>=1), limit (clamped 1..maxLimit), and skip for Prisma.
 */
export function parsePageParams(
  c: Context,
  defaultLimit = 50,
  maxLimit = 100,
): { page: number; limit: number; skip: number } {
  const page = Math.max(1, Math.floor(Number(c.req.query("page")) || 1));
  const limitRaw = Math.floor(Number(c.req.query("limit")) || defaultLimit);
  const limit = Math.min(Math.max(1, limitRaw), maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

/** Build the standard pagination envelope. */
export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  limit: number,
): Paginated<T> {
  return { items, total, page, limit, hasNext: page * limit < total };
}
