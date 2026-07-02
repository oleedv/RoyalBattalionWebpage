import { Hono } from "hono";
import { z } from "zod";
import { validate } from "../lib/validate";
import type { ServerConfig } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { encrypt, isEncryptionAvailable } from "../lib/crypto";
import { audit } from "../lib/audit";
import { success, fail } from "../lib/crud-helpers";

const serverConfig = new Hono();

serverConfig.use("*", authMiddleware);

function toConfig(c: {
  id: string;
  server: string;
  label: string;
  sftpHost: string | null;
  sftpPort: number;
  sftpUser: string | null;
  sftpPass: string | null;
  sftpPath: string | null;
  syncEnabled: boolean;
}): ServerConfig {
  return {
    id: c.id,
    server: c.server,
    label: c.label,
    sftpHost: c.sftpHost,
    sftpPort: c.sftpPort,
    sftpUser: c.sftpUser,
    sftpPass: c.sftpPass ? "********" : null,
    sftpPath: c.sftpPath,
    syncEnabled: c.syncEnabled,
  };
}

// List all server configs (view:whitelist is enough to see the list)
serverConfig.get("/", requirePermission("view:whitelist"), async (c) => {
  const configs = await prisma.serverConfig.findMany({ orderBy: { server: "asc" }, take: 100 });
  return success(c, configs.map(toConfig));
});

// Create or update a server config (admin only)
const upsertSchema = z.object({
  server: z.string().min(1),
  label: z.string().min(1),
  sftpHost: z.string().nullable().optional(),
  sftpPort: z.number().optional(),
  sftpUser: z.string().nullable().optional(),
  sftpPass: z.string().nullable().optional(),
  sftpPath: z.string().nullable().optional(),
  syncEnabled: z.boolean().optional(),
});

serverConfig.post("/", requirePermission("developer"), validate("json", upsertSchema), async (c) => {
  const body = c.req.valid("json");

  // Encrypt SFTP password if encryption is available and a password is provided
  const encryptPass = (pass: string | null | undefined): string | null => {
    if (pass == null) return null;
    return isEncryptionAvailable() ? encrypt(pass) : pass;
  };

  const sftpPass = encryptPass(body.sftpPass);

  const existing = await prisma.serverConfig.findUnique({ where: { server: body.server } });

  const config = await prisma.serverConfig.upsert({
    where: { server: body.server },
    create: {
      server: body.server,
      label: body.label,
      sftpHost: body.sftpHost ?? null,
      sftpPort: body.sftpPort ?? 22,
      sftpUser: body.sftpUser ?? null,
      sftpPass: sftpPass,
      sftpPath: body.sftpPath ?? null,
      syncEnabled: body.syncEnabled ?? true,
    },
    update: {
      label: body.label,
      ...(body.sftpHost !== undefined && { sftpHost: body.sftpHost }),
      ...(body.sftpPort !== undefined && { sftpPort: body.sftpPort }),
      ...(body.sftpUser !== undefined && { sftpUser: body.sftpUser }),
      ...(body.sftpPass !== undefined && { sftpPass }),
      ...(body.sftpPath !== undefined && { sftpPath: body.sftpPath }),
      ...(body.syncEnabled !== undefined && { syncEnabled: body.syncEnabled }),
    },
  });

  await audit(c, "server_config.upsert", "server_config", body.server, { label: body.label });

  return success(c, toConfig(config), existing ? 200 : 201);
});

// Set sync state for a server (client-supplied, idempotent)
const syncSchema = z.object({ syncEnabled: z.boolean() });

serverConfig.patch(
  "/:server",
  requirePermission("manage:whitelist-sync"),
  validate("json", syncSchema),
  async (c) => {
    const server = c.req.param("server");
    const { syncEnabled } = c.req.valid("json");

    const existing = await prisma.serverConfig.findUnique({ where: { server } });
    if (!existing) {
      return fail(c, "Server config not found", 404);
    }

    const config = await prisma.serverConfig.update({
      where: { server },
      data: { syncEnabled },
    });

    await audit(c, "server_config.toggle_sync", "server_config", server, { syncEnabled: config.syncEnabled });

    return success(c, toConfig(config));
  }
);

// Delete a server config
serverConfig.delete("/:server", requirePermission("developer"), async (c) => {
  const server = c.req.param("server");

  const existing = await prisma.serverConfig.findUnique({ where: { server } });
  if (!existing) {
    return fail(c, "Server config not found", 404);
  }

  await prisma.serverConfig.delete({ where: { server } });
  await audit(c, "server_config.delete", "server_config", server, { label: existing.label });
  return c.body(null, 204);
});

export default serverConfig;
