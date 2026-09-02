import { Prisma } from "../generated/prisma/client";
import prisma from "./db";
import { env } from "./env";
import { logger } from "./logger";
import {
  buildProfileUpdates,
  groupProspectsByUser,
  type ProspectProfileRow,
  type UserProfilePatch,
  type UserProfileRow,
} from "./prospect-profile";
import getSecretaryDb from "./secretary-db";

const IN_CHUNK = 400;

function isUniqueConflict(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "P2002");
}

async function applyPatch(userId: string, patch: UserProfilePatch): Promise<boolean> {
  try {
    await prisma.user.update({ where: { id: userId }, data: patch });
    return true;
  } catch (err) {
    if (patch.steamId && isUniqueConflict(err)) {
      const { steamId, ...rest } = patch;
      logger.warn("prospect-profile", `Skipped steamId ${steamId} for user ${userId}: already in use`);
      if (Object.keys(rest).length === 0) return false;
      await prisma.user.update({ where: { id: userId }, data: rest });
      return true;
    }
    throw err;
  }
}

export async function loadProspectProfiles(
  discordIds: string[],
): Promise<Map<string, ProspectProfileRow>> {
  if (discordIds.length === 0 || !env.SECRETARY_DATABASE_URL) {
    return new Map();
  }

  const rows: ProspectProfileRow[] = [];
  try {
    const db = getSecretaryDb();
    for (let i = 0; i < discordIds.length; i += IN_CHUNK) {
      const chunk = discordIds.slice(i, i + IN_CHUNK);
      const batch = await db.$queryRaw<ProspectProfileRow[]>(Prisma.sql`
        SELECT user_id, status, nationality, date_of_birth, steam_id, closed_at, created_at
          FROM prospects
         WHERE user_id IN (${Prisma.join(chunk)})
      `);
      rows.push(...batch);
    }
  } catch (err) {
    logger.warn("prospect-profile", "Failed to load prospect profiles from secretary DB", err);
    return new Map();
  }

  return groupProspectsByUser(rows);
}

export async function backfillMemberProfilesFromProspects(): Promise<{ updated: number }> {
  if (!env.SECRETARY_DATABASE_URL) return { updated: 0 };

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { country: null },
        { dateOfBirth: null },
        { membershipDate: null },
        { steamId: null },
      ],
    },
    select: {
      id: true,
      discordId: true,
      country: true,
      dateOfBirth: true,
      membershipDate: true,
      steamId: true,
    },
  });

  if (users.length === 0) return { updated: 0 };

  const prospects = await loadProspectProfiles(users.map((u) => u.discordId));
  if (prospects.size === 0) return { updated: 0 };

  const updates = buildProfileUpdates(users as UserProfileRow[], [...prospects.values()]);
  let updated = 0;
  for (const { userId, patch } of updates) {
    try {
      if (await applyPatch(userId, patch)) updated++;
    } catch (err) {
      logger.warn("prospect-profile", `Failed to backfill user ${userId}`, err);
    }
  }

  return { updated };
}
