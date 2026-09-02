import prisma from "./db";
import { fetchAllGuildMembers } from "./discord";
import { env } from "./env";
import { logger } from "./logger";
import { loadProspectProfiles } from "./prospect-profile-backfill";
import { prospectToUserPatch } from "./prospect-profile";

export async function syncAllUserRoles(): Promise<{ updated: number; created: number }> {
  const botToken = env.DISCORD_BOT_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;

  if (!botToken || !guildId) {
    logger.warn("role-sync", `Skipping: botToken=${botToken ? "set" : "MISSING"}, guildId=${guildId || "MISSING"}`);
    return { updated: 0, created: 0 };
  }

  const guildMembers = await fetchAllGuildMembers(botToken, guildId);
  logger.info("role-sync", `Fetched ${guildMembers.length} guild members`);

  // Build lookup: discordId -> guild member data
  const memberDataMap = new Map(
    guildMembers.map((m) => [m.discordId, m])
  );

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

  const existingDiscordIds = new Set(users.map((u) => u.discordId));

  let updated = 0;

  for (const user of users) {
    const memberData = memberDataMap.get(user.discordId);
    if (!memberData) {
      logger.info("role-sync", `User ${user.discordName}(${user.discordId}) not found in guild members, skipping`);
      continue;
    }

    // Update discordName, displayName and avatarUrl if changed
    const avatarUrl = memberData.avatar
      ? `https://cdn.discordapp.com/avatars/${memberData.discordId}/${memberData.avatar}.png`
      : null;
    const displayName = memberData.displayName;
    if (user.discordName !== memberData.username || user.displayName !== displayName || user.avatarUrl !== avatarUrl) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          discordName: memberData.username,
          displayName,
          avatarUrl,
        },
      });
    }

    // Compute expected role IDs (DB role IDs) based on Discord roles
    const expectedRoleIds = new Set<string>();
    for (const discordRoleId of memberData.roles) {
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

  // --- Create User records for Discord-only members with isMemberRole ---
  const memberRoleDiscordIds = new Set(
    discordRoles.filter((r) => r.isMemberRole).map((r) => r.discordRoleId)
  );

  let created = 0;

  if (memberRoleDiscordIds.size > 0) {
    const toCreate = guildMembers.filter((member) => {
      if (existingDiscordIds.has(member.discordId)) return false;
      return member.roles.some((r) => memberRoleDiscordIds.has(r));
    });
    const prospectByDiscordId = await loadProspectProfiles(toCreate.map((m) => m.discordId));

    for (const member of toCreate) {
      const avatarUrl = member.avatar
        ? `https://cdn.discordapp.com/avatars/${member.discordId}/${member.avatar}.png`
        : null;

      // Compute mapped role IDs for this member
      const mappedRoleIds: string[] = [];
      for (const discordRoleId of member.roles) {
        const dbRoleId = roleIdByDiscordRoleId.get(discordRoleId);
        if (dbRoleId) mappedRoleIds.push(dbRoleId);
      }

      const prospect = prospectByDiscordId.get(member.discordId);
      const profilePatch = prospect
        ? prospectToUserPatch(prospect, {
            id: "",
            discordId: member.discordId,
            country: null,
            dateOfBirth: null,
            membershipDate: null,
            steamId: null,
          })
        : null;

      const baseData = {
        discordId: member.discordId,
        discordName: member.username,
        displayName: member.displayName,
        avatarUrl,
        hasLoggedIn: false,
        ...(profilePatch ?? {}),
        roles: mappedRoleIds.length > 0
          ? { create: mappedRoleIds.map((roleId) => ({ roleId })) }
          : undefined,
      };

      try {
        await prisma.user.create({ data: baseData });
        existingDiscordIds.add(member.discordId);
        created++;
        logger.info("role-sync", `Created Discord-only member ${member.username}(${member.discordId}) with ${mappedRoleIds.length} roles`);
      } catch (err) {
        if (profilePatch?.steamId && err && typeof err === "object" && (err as { code?: string }).code === "P2002") {
          try {
            const { steamId: _ignored, ...withoutSteam } = baseData;
            await prisma.user.create({ data: withoutSteam });
            existingDiscordIds.add(member.discordId);
            created++;
            logger.warn("role-sync", `Created ${member.username}(${member.discordId}) without steamId (already in use)`);
            continue;
          } catch (retryErr) {
            logger.error("role-sync", `Failed to create member ${member.username}(${member.discordId})`, retryErr);
            continue;
          }
        }
        logger.error("role-sync", `Failed to create member ${member.username}(${member.discordId})`, err);
      }
    }
  }

  if (created > 0) {
    logger.info("role-sync", `Created ${created} new Discord-only member records`);
  }

  return { updated, created };
}
