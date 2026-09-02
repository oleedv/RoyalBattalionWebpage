import { syncMatches } from "./match-sync";
import { backfillUserEosIds } from "./eos-backfill";
import { backfillMemberProfilesFromProspects } from "./prospect-profile-backfill";
import { syncAllUserRoles } from "./role-sync";
import { fetchGuildRoleDefinitions } from "./discord";
import { logger } from "./logger";
import prisma from "./db";
import { env } from "./env";
import getSecretaryDb from "./secretary-db";
import { ensureProspectSettingsTables } from "./prospect-schema";

async function ensureMemberRoles() {
  const raw = env.DISCORD_MEMBER_ROLE_IDS;
  if (!raw || !env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return;

  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return;

  // Check which IDs already exist and are flagged
  const existing = await prisma.discordRole.findMany({
    where: { discordRoleId: { in: ids } },
  });
  const existingMap = new Map(existing.map((r) => [r.discordRoleId, r]));

  // IDs that need creating or updating
  const toCreate = ids.filter((id) => !existingMap.has(id));
  const toUpdate = ids.filter((id) => {
    const r = existingMap.get(id);
    return r && !r.isMemberRole;
  });

  // Fetch Discord role names for any new roles we need to create
  let roleNameMap = new Map<string, string>();
  if (toCreate.length > 0) {
    try {
      const guildRoles = await fetchGuildRoleDefinitions(env.DISCORD_BOT_TOKEN, env.DISCORD_GUILD_ID);
      roleNameMap = new Map(guildRoles.map((r) => [r.id, r.name]));
    } catch (err) {
      logger.error("bootstrap", "Failed to fetch guild roles for member role setup", err);
      return;
    }
  }

  for (const discordRoleId of toCreate) {
    const name = roleNameMap.get(discordRoleId) || `Role ${discordRoleId}`;
    await prisma.discordRole.create({
      data: { discordRoleId, name, isMemberRole: true },
    });
    logger.info("bootstrap", `Registered Discord role "${name}" (${discordRoleId}) as member role`);
  }

  for (const discordRoleId of toUpdate) {
    const role = existingMap.get(discordRoleId)!;
    await prisma.discordRole.update({
      where: { id: role.id },
      data: { isMemberRole: true },
    });
    logger.info("bootstrap", `Marked existing role "${role.name}" (${discordRoleId}) as member role`);
  }
}

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

    // Backfill member EOS IDs from SquadJS (matched on Steam ID) on startup and every 24 hours
    const runEosBackfill = () =>
      backfillUserEosIds()
        .then(({ updated, conflicts }) => {
          if (updated > 0 || conflicts > 0) logger.info("eos-backfill", `${updated} updated, ${conflicts} conflicts`);
        })
        .catch((err) => logger.error("eos-backfill", "EOS backfill failed", err));
    runEosBackfill();
    setInterval(runEosBackfill, 24 * 60 * 60 * 1000);
  }

  // Auto-configure member roles from env before first sync
  if (env.DISCORD_BOT_TOKEN) {
    await ensureMemberRoles().catch((err) => logger.error("bootstrap", "Member role setup failed", err));

    syncAllUserRoles()
      .then(({ updated, created }) => logger.info("role-sync", `Initial sync: ${updated} updated, ${created} created`))
      .catch((err) => logger.error("role-sync", "Initial role sync failed", err));
    setInterval(
      () =>
        syncAllUserRoles()
          .then(({ updated, created }) => { if (updated > 0 || created > 0) logger.info("role-sync", `${updated} updated, ${created} created`); })
          .catch((err) => logger.error("role-sync", "Role sync failed", err)),
      2 * 60 * 1000
    );
  }

  if (env.SECRETARY_DATABASE_URL) {
    await ensureProspectSettingsTables(getSecretaryDb()).catch((err) =>
      logger.warn("bootstrap", "Could not ensure prospect settings tables", err),
    );

    const runProspectProfileBackfill = () =>
      backfillMemberProfilesFromProspects()
        .then(({ updated }) => {
          if (updated > 0) logger.info("prospect-profile", `Backfilled ${updated} member profiles from prospects`);
        })
        .catch((err) => logger.error("prospect-profile", "Prospect profile backfill failed", err));
    runProspectProfileBackfill();
    setInterval(runProspectProfileBackfill, 2 * 60 * 1000);
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
