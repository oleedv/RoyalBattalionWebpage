import { createMiddleware } from "hono/factory";
import prisma from "../lib/db";
import {
  decideApiTokenAccess,
  hashApiToken,
  isApiTokenSecret,
} from "../lib/api-token";
import { updateContext } from "../lib/logger";

type ApiTokenVars = {
  apiTokenId: string;
  apiTokenScope: string;
};

export const apiTokenAuth = createMiddleware<{
  Variables: ApiTokenVars;
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Missing or invalid Authorization header" }, 401);
  }

  const bearer = header.slice(7);
  if (!isApiTokenSecret(bearer)) {
    return c.json({ success: false, error: "API token required" }, 401);
  }

  const hash = hashApiToken(bearer);
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hash },
    select: { id: true, scope: true, revokedAt: true, expiresAt: true },
  });

  const decision = decideApiTokenAccess(
    bearer,
    row ? { scope: row.scope, revokedAt: row.revokedAt, expiresAt: row.expiresAt } : null,
  );

  if (decision === "jwt-required") {
    return c.json({ success: false, error: "API token required" }, 401);
  }
  if (decision === "invalid") {
    return c.json({ success: false, error: "Invalid or expired token" }, 401);
  }
  if (decision === "forbidden") {
    return c.json({ success: false, error: "Insufficient permissions" }, 403);
  }

  c.set("apiTokenId", row!.id);
  c.set("apiTokenScope", row!.scope);
  updateContext({ apiTokenId: row!.id });
  await next();
});
