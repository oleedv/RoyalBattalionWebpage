import prisma from "./db";
import { logger } from "./logger";

export type UsageKind = "ok" | "error" | "rateLimited";

function utcDay(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function recordApiTokenUsage(tokenId: string, kind: UsageKind): Promise<void> {
  try {
    const date = utcDay();
    const dayInc = {
      okCount: kind === "ok" ? 1 : 0,
      errorCount: kind === "error" ? 1 : 0,
      rateLimitedCount: kind === "rateLimited" ? 1 : 0,
    };
    await prisma.$transaction([
      prisma.apiToken.update({
        where: { id: tokenId },
        data: { lastUsedAt: new Date(), requestCount: { increment: 1 } },
      }),
      prisma.apiTokenUsageDaily.upsert({
        where: { tokenId_date: { tokenId, date } },
        create: { tokenId, date, ...dayInc },
        update: {
          okCount: { increment: dayInc.okCount },
          errorCount: { increment: dayInc.errorCount },
          rateLimitedCount: { increment: dayInc.rateLimitedCount },
        },
      }),
    ]);
  } catch (err) {
    logger.warn("api-tokens", "Failed to record token usage", { tokenId, kind, err });
  }
}
