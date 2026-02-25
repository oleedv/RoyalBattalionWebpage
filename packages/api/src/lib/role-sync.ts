import prisma from "./db";
import { fetchAllGuildMembers } from "./discord";
import { env } from "./env";
import { logger } from "./logger";

export async function syncAllUserRoles(): Promise<number> {
  const botToken = env.DISCORD_BOT_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    logger.warn("role-sync", `Skipping: botToken=${botToken ? "set" : "MISSING"}, guildId=${guildId || "MISSING"}`);
    return 0;
  }

  const guildMembers = await fetchAllGuildMembers(botToken, guildId);
  logger.info("role-sync", `Fetched ${guildMembers.length} guild members`);

  // Build lookup: discordId -> discord role IDs
  const memberRoleMap = new Map<string, string[]>();
  for (const m of guildMembers) {
    memberRoleMap.set(m.discordId, m.roles);
  }

  // Get all mapped Discord roles from our DB
  const discordRoles = await prisma.discordRole.findMany();
  const roleIdByDiscordRoleId = new Map(
    discordRoles.map((r) => [r.discordRoleId, r.id])
  );
  logger.info("role-sync", `Mapped Discord roles in DB: ${discordRoles.map((r) => `${r.name}(${r.discordRoleId})`).join(", ") || "NONE"}`);

  // Get all users with their current role assignments
  const users = await prisma.user.findMany({
    include: { roles: true },
  });
  logger.info("role-sync", `Processing ${users.length} users from database`);

  let updated = 0;

  for (const user of users) {
    const memberRoles = memberRoleMap.get(user.discordId);
    if (!memberRoles) {
      logger.info("role-sync", `User ${user.discordName}(${user.discordId}) not found in guild members, skipping`);
      continue;
    }

    // Compute expected role IDs (DB role IDs) based on Discord roles
    const expectedRoleIds = new Set<string>();
    for (const discordRoleId of memberRoles) {
      const dbRoleId = roleIdByDiscordRoleId.get(discordRoleId);
      if (dbRoleId) expectedRoleIds.add(dbRoleId);
    }

    // Current role IDs from DB
    const currentRoleIds = new Set(user.roles.map((r) => r.roleId));

    logger.info("role-sync", `User ${user.discordName}: Discord roles=${JSON.stringify(memberRoles)}, mapped DB roles=${expectedRoleIds.size}, current DB roles=${currentRoleIds.size}`);

    // Check if anything changed
    if (
      expectedRoleIds.size === currentRoleIds.size &&
      [...expectedRoleIds].every((id) => currentRoleIds.has(id))
    ) {
      continue; // No change
    }

    logger.info("role-sync", `Updating roles for ${user.discordName}: ${currentRoleIds.size} -> ${expectedRoleIds.size} roles`);

    // Update: delete old, create new
    await prisma.userRole.deleteMany({ where: { userId: user.id } });

    if (expectedRoleIds.size > 0) {
      await prisma.userRole.createMany({
        data: [...expectedRoleIds].map((roleId) => ({
          userId: user.id,
          roleId,
        })),
      });
    }

    updated++;
  }

  return updated;
}
