import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import type { Permission } from "shared";
import { env } from "../lib/env";
import prisma from "../lib/db";
import { logger, updateContext } from "../lib/logger";

type AuthVariables = {
  userId: string;
  permissions: Permission[];
};

const getSecret = () => new TextEncoder().encode(env.JWT_SECRET);

export const authMiddleware = createMiddleware<{
  Variables: AuthVariables;
}>(async (c, next) => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ success: false, error: "Missing or invalid Authorization header" }, 401);
  }

  const token = header.slice(7);

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.userId as string;
    const permissions = payload.permissions as Permission[];

    if (!userId || !permissions) {
      return c.json({ success: false, error: "Invalid token payload" }, 401);
    }

    // Block disabled users even if their JWT is still valid
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { disabled: true },
    });
    if (!user || user.disabled) {
      logger.warn("auth", "Disabled account token rejected", { userId });
      return c.json({ success: false, error: "ACCOUNT_DISABLED" }, 403);
    }

    c.set("userId", userId);
    c.set("permissions", permissions);
    updateContext({ userId });
    await next();
  } catch (err) {
    logger.warn("auth", "JWT verification failed", {
      err: err instanceof Error ? err : new Error(String(err)),
      errName: err instanceof Error ? err.name : "Unknown",
    });
    return c.json({ success: false, error: "Invalid or expired token" }, 401);
  }
});
