import type { Context } from "hono";
import prisma from "./db";
import { logger } from "./logger";

export async function audit(
  c: Context,
  action: string,
  resource: string,
  resourceId?: string | null,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const userId = c.get("userId") as string | undefined;
    if (!userId) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { discordName: true },
    });

    const userName = user?.discordName ?? "Unknown";
    await prisma.auditLog.create({
      data: {
        userId,
        userName,
        action,
        resource,
        resourceId: resourceId ?? undefined,
        detail: detail ?? undefined,
      },
    });
    logger.info("audit", action, { resource, resourceId: resourceId ?? null, userId, userName, detail: detail ?? null });
  } catch (err) {
    logger.error("audit", "Failed to create audit log", err);
  }
}

export async function auditDirect(
  userId: string,
  userName: string,
  action: string,
  resource: string,
  resourceId?: string | null,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        userName,
        action,
        resource,
        resourceId: resourceId ?? undefined,
        detail: detail ?? undefined,
      },
    });
    logger.info("audit", action, { resource, resourceId: resourceId ?? null, userId, userName, detail: detail ?? null });
  } catch (err) {
    logger.error("audit", "Failed to create audit log", err);
  }
}
