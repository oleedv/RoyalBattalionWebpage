import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import type { ApiResponse, SquadJSPlugin } from "shared";
import { authMiddleware } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import {
  readSquadJSConfig,
  writeSquadJSConfig,
  getAvailableEnvironments,
  isConfigured,
  type Environment,
} from "../lib/github-config";

const squadjsConfig = new Hono();

squadjsConfig.use("*", authMiddleware, requirePermission("admin"));

// GET / -- list available environments
squadjsConfig.get("/", async (c) => {
  if (!isConfigured()) {
    return c.json<ApiResponse<never>>(
      { success: false, error: "GITHUB_CONFIG_TOKEN is not configured" },
      503
    );
  }

  return c.json<ApiResponse<{ environments: string[] }>>({
    success: true,
    data: { environments: getAvailableEnvironments() },
  });
});

// GET /:env -- read plugins for a specific environment
squadjsConfig.get("/:env", async (c) => {
  const env = c.req.param("env") as Environment;

  try {
    const result = await readSquadJSConfig(env);

    if (result === null) {
      return c.json<ApiResponse<never>>(
        { success: false, error: "GITHUB_CONFIG_TOKEN is not configured" },
        503
      );
    }

    return c.json<ApiResponse<{ plugins: SquadJSPlugin[]; environment: string }>>({
      success: true,
      data: { plugins: result.plugins, environment: env },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read config";
    return c.json<ApiResponse<never>>(
      { success: false, error: message },
      500
    );
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

// PUT /:env -- write plugins for a specific environment
squadjsConfig.put(
  "/:env",
  zValidator("json", updateSchema),
  async (c) => {
    const env = c.req.param("env") as Environment;
    const { plugins } = c.req.valid("json");

    try {
      // Read current config to get the full raw object
      const result = await readSquadJSConfig(env);
      if (result === null) {
        return c.json<ApiResponse<never>>(
          { success: false, error: "GITHUB_CONFIG_TOKEN is not configured" },
          503
        );
      }

      await writeSquadJSConfig(env, result.raw, plugins as SquadJSPlugin[]);

      return c.json<ApiResponse<{ saved: true }>>({
        success: true,
        data: { saved: true },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Write failed";
      return c.json<ApiResponse<never>>(
        { success: false, error: message },
        500
      );
    }
  }
);

export default squadjsConfig;
