import { createHash, randomBytes } from "crypto";

export const TOKEN_PREFIX = "rb_live_";
export const TOKEN_SCOPE_SERVER_STATUS = "server-status";
const RANDOM_BYTES = 32;
const PREFIX_LENGTH = 12;

export function generateApiToken(): { secret: string; prefix: string; hash: string } {
  const secret = TOKEN_PREFIX + randomBytes(RANDOM_BYTES).toString("hex");
  return {
    secret,
    prefix: secret.slice(0, PREFIX_LENGTH),
    hash: hashApiToken(secret),
  };
}

export function hashApiToken(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function isApiTokenSecret(value: string): boolean {
  return (
    value.startsWith(TOKEN_PREFIX) &&
    value.length === TOKEN_PREFIX.length + RANDOM_BYTES * 2 &&
    /^[0-9a-f]+$/i.test(value.slice(TOKEN_PREFIX.length))
  );
}

export type ApiTokenRow = {
  scope: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
};

export type ApiTokenDecision = "ok" | "invalid" | "forbidden" | "jwt-required";

export function decideApiTokenAccess(
  bearer: string,
  row: ApiTokenRow | null,
  now: Date = new Date(),
): ApiTokenDecision {
  if (!isApiTokenSecret(bearer)) return "jwt-required";
  if (!row) return "invalid";
  if (row.revokedAt) return "invalid";
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return "invalid";
  if (row.scope !== TOKEN_SCOPE_SERVER_STATUS) return "forbidden";
  return "ok";
}
