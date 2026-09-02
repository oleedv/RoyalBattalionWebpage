import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import type { Clan } from "shared";
import prisma from "../lib/db";
import { findOrThrow, success, fail } from "../lib/crud-helpers";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { audit } from "../lib/audit";
import { triggerSftpDeploy } from "../lib/sftp-deploy";
import { logger } from "../lib/logger";

const clans = new Hono();

clans.use("*", authMiddleware, requirePermission("manage:whitelist"));

const createClanSchema = z.object({
  name: z.string().min(1),
  tag: z.string().min(1),
});

const updateClanSchema = z.object({
  name: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
});

function toClan(c: { id: string; name: string; tag: string; createdAt: Date }): Clan {
  return {
    id: c.id,
    name: c.name,
    tag: c.tag,
    createdAt: c.createdAt.toISOString(),
  };
}

clans.get("/", async (c) => {
  const rows = await prisma.clan.findMany({ orderBy: { name: "asc" }, take: 500 });
  return success(c, rows.map(toClan));
});

clans.post("/", validate("json", createClanSchema), async (c) => {
  const { name, tag } = c.req.valid("json");

  const [byName, byTag] = await Promise.all([
    prisma.clan.findUnique({ where: { name }, select: { name: true, tag: true } }),
    prisma.clan.findUnique({ where: { tag }, select: { name: true, tag: true } }),
  ]);
  if (byName) return fail(c, `Clan name "${name}" is already used by [${byName.tag}] ${byName.name}.`, 409);
  if (byTag) return fail(c, `Clan tag "${tag}" is already used by [${byTag.tag}] ${byTag.name}.`, 409);

  try {
    const clan = await prisma.clan.create({ data: { name, tag } });
    await audit(c, "clan.create", "clan", clan.id, { name, tag });
    return success(c, toClan(clan), 201);
  } catch (err) {
    logger.error("clans", "Failed to create clan", { name, tag, err });
    return fail(c, "Failed to create clan.", 500);
  }
});

clans.patch("/:id", validate("json", updateClanSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await findOrThrow(prisma.clan, { id }, "Clan");

  try {
    const clan = await prisma.clan.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.tag !== undefined && { tag: body.tag }),
      },
    });

    // Propagate tag change to all whitelist entries referencing this clan
    if (body.tag !== undefined) {
      await prisma.whitelistEntry.updateMany({
        where: { clanId: id },
        data: { clan: body.tag },
      });
      triggerSftpDeploy().catch((err) =>
        logger.error("sftp", "Deploy failed after clan tag update", err)
      );
    }

    await audit(c, "clan.update", "clan", id, { name: existing.name, tag: existing.tag, changes: body });
    return success(c, toClan(clan));
  } catch (err) {
    logger.error("clans", "Failed to update clan", { id, err });
    return fail(c, "Failed to update clan", 500);
  }
});

clans.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const existing = await findOrThrow(prisma.clan, { id }, "Clan");

  await prisma.clan.delete({ where: { id } });
  await audit(c, "clan.delete", "clan", id, { name: existing.name, tag: existing.tag });
  return c.body(null, 204);
});

export default clans;
