import { syncMatches } from "./match-sync";
import { syncAllUserRoles } from "./role-sync";
import { logger } from "./logger";
import prisma from "./db";
import { env } from "./env";

/** Bootstrap default data, cron jobs, and initial syncs. */
export async function bootstrap() {
  // Create default server configs if none exist
  const count = await prisma.serverConfig.count();
  if (count === 0) {
    await prisma.serverConfig.createMany({
      data: [
        { server: "main", label: "Main Server" },
        { server: "battle", label: "Battle Server" },
      ],
    });
    logger.info("bootstrap", "Created default ServerConfig rows");
  }

  // Sync SquadJS matches on startup and every 15 minutes
  if (env.SQUADJS_DATABASE_URL) {
    syncMatches().catch((err) => logger.error("match-sync", "Match sync failed", err));
    setInterval(() => syncMatches().catch((err) => logger.error("match-sync", "Match sync failed", err)), 15 * 60 * 1000);
  }

  // Sync Discord roles for all users on startup and every 2 minutes
  if (env.DISCORD_BOT_TOKEN) {
    syncAllUserRoles()
      .then((n) => logger.info("role-sync", `Initial sync: ${n} users updated`))
      .catch((err) => logger.error("role-sync", "Initial role sync failed", err));
    setInterval(
      () =>
        syncAllUserRoles()
          .then((n) => { if (n > 0) logger.info("role-sync", `${n} users updated`); })
          .catch((err) => logger.error("role-sync", "Role sync failed", err)),
      2 * 60 * 1000
    );
  }

  // Cleanup audit logs older than 30 days -- run on startup and every 24 hours
  async function cleanupOldAuditLogs() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
    if (count > 0) logger.info("audit-cleanup", `Deleted ${count} entries older than 30 days`);
  }
  cleanupOldAuditLogs().catch((err) => logger.error("audit-cleanup", "Audit cleanup failed", err));
  setInterval(() => cleanupOldAuditLogs().catch((err) => logger.error("audit-cleanup", "Audit cleanup failed", err)), 24 * 60 * 60 * 1000);
}
