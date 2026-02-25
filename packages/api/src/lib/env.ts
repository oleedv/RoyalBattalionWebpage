import { z } from "zod";

const envSchema = z.object({
  // --- Required ---
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),

  // --- Server ---
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),

  // --- Discord (optional - features degrade gracefully) ---
  DISCORD_BOT_TOKEN: z.string().min(1).optional(),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  ADMIN_DISCORD_IDS: z.string().default(""),

  // --- Encryption (optional - crypto module checks at call time) ---
  ENCRYPTION_KEY: z.string().min(1).optional(),

  // --- SquadJS (optional - live server features disabled without these) ---
  SQUADJS_DATABASE_URL: z.string().min(1).optional(),
  SQUADJS_SERVERS: z.string().min(1).optional(),

  // --- SFTP legacy env-var deploy (optional - DB-driven config preferred) ---
  SFTP_SYNC_ENABLED: z.string().optional(),
  SFTP_HOST: z.string().min(1).optional(),
  SFTP_PORT: z.coerce.number().default(22),
  SFTP_USER: z.string().min(1).optional(),
  SFTP_PASS: z.string().min(1).optional(),
  SFTP_PATH: z.string().min(1).optional(),

  // --- Public cfg endpoint ---
  CFG_ALLOWED_IPS: z.string().default(""),

  // --- BattleMetrics ---
  BATTLEMETRICS_SERVER_IDS: z.string().optional(),

  // --- GitHub config sync ---
  GITHUB_CONFIG_TOKEN: z.string().min(1).optional(),

  // --- Secretary DB (optional) ---
  SECRETARY_DATABASE_URL: z.string().min(1).optional(),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
