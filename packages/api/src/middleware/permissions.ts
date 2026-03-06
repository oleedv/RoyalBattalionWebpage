import { createMiddleware } from "hono/factory";
import type { Permission } from "shared";

const TIER_PERMISSION_MAP: Record<string, Permission> = {
  normal: "view:tickets:normal",
  community_officer: "view:tickets:community_officer",
  admin_officer: "view:tickets:admin_officer",
  comp_team: "view:tickets:comp_team",
  whitelist: "view:tickets:whitelist",
};

/**
 * Returns the list of ticket tiers a user can access based on their permissions.
 * Returns null if the user has broad access (admin, view:tickets, manage:tickets).
 * Returns an array of tier strings for granular access.
 */
export function getAllowedTicketTiers(permissions: Permission[]): string[] | null {
  if (
    permissions.includes("developer") ||
    permissions.includes("view:tickets") ||
    permissions.includes("manage:tickets")
  ) {
    return null; // all tiers allowed
  }

  const tiers: string[] = [];
  for (const [tier, perm] of Object.entries(TIER_PERMISSION_MAP)) {
    if (permissions.includes(perm)) tiers.push(tier);
  }
  return tiers;
}

export function requirePermission(...permissions: Permission[]) {
  return createMiddleware<{
    Variables: {
      userId: string;
      permissions: Permission[];
    };
  }>(async (c, next) => {
    const userPermissions = c.get("permissions");

    if (userPermissions.includes("developer")) {
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
