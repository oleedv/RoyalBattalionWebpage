import { createMiddleware } from "hono/factory";
import { jwtVerify } from "jose";
import type { Permission } from "shared";

type AuthVariables = {
  userId: string;
  permissions: Permission[];
};

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
};

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

    c.set("userId", userId);
    c.set("permissions", permissions);
    await next();
  } catch {
    return c.json({ success: false, error: "Invalid or expired token" }, 401);
  }
});
