import { Hono } from "hono";
import { z } from "zod";
import type { BirthdayConfig } from "shared";
import prisma from "../../lib/db";
import { requirePermission } from "../../middleware/permissions";
import { validate } from "../../lib/validate";
import { audit } from "../../lib/audit";
import { success } from "../../lib/crud-helpers";
import { logger } from "../../lib/logger";

const birthday = new Hono();

const SINGLETON_ID = "singleton";

const DEFAULTS: BirthdayConfig = {
  enabled: false,
  channelId: null,
  postTime: "09:00",
  timezone: "Europe/Oslo",
};

// GET /birthday — returns the singleton (defaults when the row does not exist yet).
birthday.get(
  "/birthday",
  requirePermission("view:discord-bot", "manage:discord-bot"),
  async (c) => {
    const row = await prisma.birthdayConfig.findUnique({ where: { id: SINGLETON_ID } });
    const config: BirthdayConfig = row
      ? { enabled: row.enabled, channelId: row.channelId, postTime: row.postTime, timezone: row.timezone }
      : DEFAULTS;
    return success(c, config);
  }
);

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  channelId: z.string().regex(/^\d{5,25}$/, "channelId must be a numeric Discord ID").nullable().optional(),
  postTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "postTime must be HH:MM (24h)").optional(),
  timezone: z.string().min(1).max(64).optional(),
});

// PATCH /birthday — partial update; upserts the singleton so the first save creates it.
birthday.patch(
  "/birthday",
  requirePermission("manage:discord-bot"),
  validate("json", patchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const data = {
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.channelId !== undefined && { channelId: body.channelId }),
      ...(body.postTime !== undefined && { postTime: body.postTime }),
      ...(body.timezone !== undefined && { timezone: body.timezone }),
    };

    const row = await prisma.birthdayConfig.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });

    await audit(c, "discord_bot.update_birthday_config", "discord_bot", null, body as Record<string, unknown>);

    logger.info("discord-bot", "Birthday config updated", body);
    const config: BirthdayConfig = { enabled: row.enabled, channelId: row.channelId, postTime: row.postTime, timezone: row.timezone };
    return success(c, config);
  }
);

export default birthday;
