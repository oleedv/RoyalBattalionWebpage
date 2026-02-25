import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiResponse } from "shared";
import { NotFoundError } from "./errors";

/**
 * Find an entity by ID or throw NotFoundError.
 */
export async function findOrThrow<T>(
  model: { findUnique: (args: { where: Record<string, unknown> }) => Promise<T | null> },
  where: Record<string, unknown>,
  entityName: string,
): Promise<T> {
  const entity = await model.findUnique({ where });
  if (!entity) throw new NotFoundError(entityName);
  return entity;
}

/**
 * Standard JSON success response.
 */
export function success<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json<ApiResponse<T>>({ success: true, data }, status);
}

/**
 * Standard JSON error response.
 */
export function fail(c: Context, error: string, status: ContentfulStatusCode = 400) {
  return c.json<ApiResponse<never>>({ success: false, error }, status);
}
