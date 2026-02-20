import { createMiddleware } from "hono/factory";
import type { Permission } from "shared";

export function requirePermission(...permissions: Permission[]) {
  return createMiddleware<{
    Variables: {
      userId: string;
      permissions: Permission[];
    };
  }>(async (c, next) => {
    const userPermissions = c.get("permissions");

    if (userPermissions.includes("admin")) {
      await next();
      return;
    }

    const hasPermission = permissions.some((p) => userPermissions.includes(p));
    if (!hasPermission) {
      return c.json({ success: false, error: "Insufficient permissions" }, 403);
    }

    await next();
  });
}
