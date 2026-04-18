import { z } from "zod";

// Treat empty strings as undefined so Railway/Docker env vars that are ""
// don't fail validation for optional fields.
const optStr = z.preprocess(
  (val) => (val === "" ? undefined : val),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  // --- Required ---
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),

  // --- Server ---
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"]).optional(),

  // --- Discord (optional - features degrade gracefully) ---
  DISCORD_BOT_TOKEN: optStr,
  DISCORD_GUILD_ID: optStr,
  ADMIN_DISCORD_IDS: z.string().default(""),
  DISCORD_MEMBER_ROLE_IDS: z.string().default(""),

  // --- Encryption (optional - crypto module checks at call time) ---
  ENCRYPTION_KEY: optStr,

  // --- SquadJS (optional - live server features disabled without these) ---
  SQUADJS_DATABASE_URL: optStr,
  SQUADJS_SERVERS: optStr,

  // --- SFTP legacy env-var deploy (optional - DB-driven config preferred) ---
  SFTP_SYNC_ENABLED: optStr,
  SFTP_HOST: optStr,
  SFTP_PORT: z.coerce.number().default(22),
  SFTP_USER: optStr,
  SFTP_PASS: optStr,
  SFTP_PATH: optStr,

  // --- Public cfg endpoint ---
  CFG_ALLOWED_IPS: z.string().default(""),

  // --- BattleMetrics ---
  BATTLEMETRICS_SERVER_IDS: optStr,

  // --- GitHub config sync ---
  GITHUB_CONFIG_TOKEN: optStr,

  // --- Secretary DB (optional) ---
  SECRETARY_DATABASE_URL: optStr,
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
