import { Hono } from "hono";
import { Prisma } from "../../generated/prisma/client";
import getSecretaryDb from "../../lib/secretary-db";
import { requirePermission } from "../../middleware/permissions";
import { audit } from "../../lib/audit";
import { success, fail } from "../../lib/crud-helpers";

const prospects = new Hono();

// Helper to queue an action for the bot to process
async function queueAction(
  actionType: string,
  targetType: string,
  targetId: number,
  actorId: string,
  payload: Record<string, unknown> = {}
) {
  const db = getSecretaryDb();
  await db.$queryRaw(Prisma.sql`
    INSERT INTO pending_actions (action_type, target_type, target_id, payload, actor_id)
    VALUES (${actionType}, ${targetType}, ${targetId}, ${JSON.stringify(payload)}, ${actorId})`
  );
}

// POST /prospects/:id/reassign-mentor
prospects.post(
  "/prospects/:id/reassign-mentor",
  requirePermission("manage:discord-bot"),
  async (c) => {
    const id = Number(c.req.param("id"));
    const userId = c.get("userId") as string;
    const { mentorId } = await c.req.json<{ mentorId: string }>();

    if (!mentorId) return fail(c, "mentorId is required");

    const db = getSecretaryDb();
    const rows: any[] = await db.$queryRaw(Prisma.sql`
      SELECT id, status, mentor_id FROM prospects WHERE id = ${id}`);
    if (rows.length === 0) return fail(c, "Prospect not found", 404);
    if (rows[0].status !== "open") return fail(c, "Prospect is not open");
    if (rows[0].mentor_id === mentorId) return fail(c, "Prospect is already assigned to this mentor");

    await queueAction("reassign_mentor", "prospect", id, userId, { newMentorId: mentorId });
    await audit(c, "discord_bot.reassign_mentor_queued", "prospect", String(id), { mentorId });
    return success(c, { queued: true as const });
  }
);

// GET /prospects/mentors — open prospects grouped by mentor
prospects.get(
  "/prospects/mentors",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const db = getSecretaryDb();

    const rows: any[] = await db.$queryRaw(Prisma.sql`
      SELECT id, uuid, user_id, status, alias, nationality, squad_hours,
              preferred_roles, steam_id, mentor_id, paused_at, extra_days,
              created_at
       FROM prospects
       WHERE status = 'open'
       ORDER BY COALESCE(mentor_id, '') ASC, alias ASC`
    );

    interface MentorGroup {
      mentorId: string | null;
      prospects: typeof mapped;
    }

    const mapped = rows.map((r: any) => ({
      id: r.id,
      uuid: r.uuid,
      userId: r.user_id,
      alias: r.alias,
      nationality: r.nationality,
      squadHours: r.squad_hours,
      preferredRoles: r.preferred_roles,
      steamId: r.steam_id,
      mentorId: r.mentor_id,
      pausedAt: r.paused_at ? new Date(r.paused_at).toISOString() : null,
      extraDays: Number(r.extra_days) || 0,
      createdAt: new Date(r.created_at).toISOString(),
    }));

    // Group by mentor
    const grouped = new Map<string, typeof mapped>();
    for (const p of mapped) {
      const key = p.mentorId || "__unclaimed";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    const result: MentorGroup[] = [];

    // Unclaimed first
    const unclaimed = grouped.get("__unclaimed");
    if (unclaimed) {
      result.push({ mentorId: null, prospects: unclaimed });
      grouped.delete("__unclaimed");
    }

    // Then each mentor group
    for (const [mentorId, prospects] of grouped) {
      result.push({ mentorId, prospects });
    }

    return success(c, result);
  }
);

export default prospects;
