import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { SquadJSPlugin } from "shared";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import prisma from "../lib/db";
import { audit } from "../lib/audit";
import { success, fail } from "../lib/crud-helpers";
import { logger } from "../lib/logger";
import {
  readSquadJSConfig,
  writeSquadJSConfig,
  getAvailableEnvironments,
  isConfigured,
  fetchPluginDescriptions,
  fetchPluginFieldDescriptions,
  type Environment,
} from "../lib/github-config";

const squadjsConfig = new Hono();

squadjsConfig.use("*", authMiddleware);

// Validate an :env path param against the known Environment set.
function parseEnv(value: string): Environment | null {
  return (getAvailableEnvironments() as string[]).includes(value)
    ? (value as Environment)
    : null;
}

// GET / -- list available environments
squadjsConfig.get("/", requirePermission("view:squadjs", "manage:squadjs"), async (c) => {
  if (!isConfigured()) {
    return fail(c, "GITHUB_CONFIG_TOKEN is not configured", 503);
  }

  return success(c, { environments: getAvailableEnvironments() });
});

// GET /descriptions -- fetch plugin + field descriptions from source code (must be before /:env)
squadjsConfig.get("/descriptions", requirePermission("view:squadjs", "manage:squadjs"), async (c) => {
  try {
    const [descriptions, fieldDescriptions] = await Promise.all([
      fetchPluginDescriptions(),
      fetchPluginFieldDescriptions(),
    ]);
    return success(c, { descriptions, fieldDescriptions });
  } catch (err) {
    logger.error("squadjs-config", "Failed to fetch descriptions", { err });
    return fail(c, "Failed to fetch descriptions", 500);
  }
});

// GET /:env -- read plugins for a specific environment
squadjsConfig.get("/:env", requirePermission("view:squadjs", "manage:squadjs"), async (c) => {
  const env = parseEnv(c.req.param("env"));
  if (!env) {
    return fail(c, "Unknown environment", 404);
  }

  try {
    const result = await readSquadJSConfig(env);

    if (result === null) {
      return fail(c, "GITHUB_CONFIG_TOKEN is not configured", 503);
    }

    return success(c, { plugins: result.plugins, environment: env });
  } catch (err) {
    logger.error("squadjs-config", "Failed to read config", { env, err });
    return fail(c, "Failed to read config", 500);
  }
});

const updateSchema = z.object({
  plugins: z.array(
    z
      .object({
        plugin: z.string().min(1),
        enabled: z.boolean(),
      })
      .passthrough()
  ),
});

// PATCH /:env -- merge plugins for a specific environment
squadjsConfig.patch(
  "/:env",
  requirePermission("manage:squadjs"),
  zValidator("json", updateSchema),
  async (c) => {
    const env = parseEnv(c.req.param("env"));
    if (!env) {
      return fail(c, "Unknown environment", 404);
    }
    const { plugins } = c.req.valid("json");

    try {
      // Read current config to get the full raw object
      const result = await readSquadJSConfig(env);
      if (result === null) {
        return fail(c, "GITHUB_CONFIG_TOKEN is not configured", 503);
      }

      // Look up who's making the change
      const userId = c.get("userId");
      const user = userId
        ? await prisma.user.findUnique({ where: { id: userId }, select: { discordName: true } })
        : null;

      await writeSquadJSConfig(env, result.raw, plugins as SquadJSPlugin[], user?.discordName ?? undefined);

      const pluginNames = (plugins as SquadJSPlugin[]).map((p) => p.plugin);
      audit(c, "squadjs.update_config", "SquadJSConfig", env, { environment: env, plugins: pluginNames });

      return success(c, { saved: true });
    } catch (err) {
      logger.error("squadjs-config", "Failed to write config", { env, err });
      return fail(c, "Failed to write config", 500);
    }
  }
);

export default squadjsConfig;
