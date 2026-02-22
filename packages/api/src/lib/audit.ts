import type { Context } from "hono";
import prisma from "./db";

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

    await prisma.auditLog.create({
      data: {
        userId,
        userName: user?.discordName ?? "Unknown",
        action,
        resource,
        resourceId: resourceId ?? undefined,
        detail: detail ?? undefined,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to create audit log:", err);
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
  } catch (err) {
    console.error("[audit] Failed to create audit log:", err);
  }
}
