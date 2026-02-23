import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, ServerConfig } from "shared";
import prisma from "../lib/db";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";

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
    sftpPass: c.sftpPass,
    sftpPath: c.sftpPath,
    syncEnabled: c.syncEnabled,
  };
}

// List all server configs (view:whitelist is enough to see the list)
serverConfig.get("/", requirePermission("view:whitelist"), async (c) => {
  const configs = await prisma.serverConfig.findMany({ orderBy: { server: "asc" } });
  return c.json<ApiResponse<ServerConfig[]>>({ success: true, data: configs.map(toConfig) });
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

serverConfig.post("/", requirePermission("admin"), zValidator("json", upsertSchema), async (c) => {
  const body = c.req.valid("json");

  const config = await prisma.serverConfig.upsert({
    where: { server: body.server },
    create: {
      server: body.server,
      label: body.label,
      sftpHost: body.sftpHost ?? null,
      sftpPort: body.sftpPort ?? 22,
      sftpUser: body.sftpUser ?? null,
      sftpPass: body.sftpPass ?? null,
      sftpPath: body.sftpPath ?? null,
      syncEnabled: body.syncEnabled ?? true,
    },
    update: {
      label: body.label,
      ...(body.sftpHost !== undefined && { sftpHost: body.sftpHost }),
      ...(body.sftpPort !== undefined && { sftpPort: body.sftpPort }),
      ...(body.sftpUser !== undefined && { sftpUser: body.sftpUser }),
      ...(body.sftpPass !== undefined && { sftpPass: body.sftpPass }),
      ...(body.sftpPath !== undefined && { sftpPath: body.sftpPath }),
      ...(body.syncEnabled !== undefined && { syncEnabled: body.syncEnabled }),
    },
  });

  return c.json<ApiResponse<ServerConfig>>({ success: true, data: toConfig(config) });
});

// Toggle sync for a server
serverConfig.put("/:server/sync", requirePermission("manage:whitelist-sync"), async (c) => {
  const server = c.req.param("server");

  const existing = await prisma.serverConfig.findUnique({ where: { server } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Server config not found" }, 404);
  }

  const config = await prisma.serverConfig.update({
    where: { server },
    data: { syncEnabled: !existing.syncEnabled },
  });

  return c.json<ApiResponse<ServerConfig>>({ success: true, data: toConfig(config) });
});

// Delete a server config
serverConfig.delete("/:server", requirePermission("admin"), async (c) => {
  const server = c.req.param("server");

  const existing = await prisma.serverConfig.findUnique({ where: { server } });
  if (!existing) {
    return c.json<ApiResponse<never>>({ success: false, error: "Server config not found" }, 404);
  }

  await prisma.serverConfig.delete({ where: { server } });
  return c.json<ApiResponse<{ deleted: true }>>({ success: true, data: { deleted: true } });
});

export default serverConfig;
