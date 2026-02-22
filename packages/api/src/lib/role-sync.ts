import prisma from "./db";
import { fetchAllGuildMembers } from "./discord";

export async function syncAllUserRoles(): Promise<number> {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) return 0;

  const guildMembers = await fetchAllGuildMembers(botToken, guildId);

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

  // Get all users with their current role assignments
  const users = await prisma.user.findMany({
    include: { roles: true },
  });

  let updated = 0;

  for (const user of users) {
    const memberRoles = memberRoleMap.get(user.discordId);
    if (!memberRoles) continue; // User not in guild, skip

    // Compute expected role IDs (DB role IDs) based on Discord roles
    const expectedRoleIds = new Set<string>();
    for (const discordRoleId of memberRoles) {
      const dbRoleId = roleIdByDiscordRoleId.get(discordRoleId);
      if (dbRoleId) expectedRoleIds.add(dbRoleId);
    }

    // Current role IDs from DB
    const currentRoleIds = new Set(user.roles.map((r) => r.roleId));

    // Check if anything changed
    if (
      expectedRoleIds.size === currentRoleIds.size &&
      [...expectedRoleIds].every((id) => currentRoleIds.has(id))
    ) {
      continue; // No change
    }

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
