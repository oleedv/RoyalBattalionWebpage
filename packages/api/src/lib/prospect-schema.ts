/**
 * Secretary-DB tables for live prospect settings. The Discord bot also
 * CREATE TABLE IF NOT EXISTS these on boot; the API must do the same so
 * /prospects/settings works before (or without) a bot restart.
 */

export const PROSPECT_CONFIG_DDL = `
    CREATE TABLE IF NOT EXISTS prospect_config (
      id INT PRIMARY KEY DEFAULT 1,
      vote_start_hours INT NOT NULL DEFAULT 6,
      vote_accept_hours INT NOT NULL DEFAULT 16,
      period_days INT NOT NULL DEFAULT 28,
      cooldown_days INT NOT NULL DEFAULT 28,
      min_yes_votes INT NOT NULL DEFAULT 10,
      min_yes_rate DECIMAL(5,4) NOT NULL DEFAULT 0.8000,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CHECK (id = 1)
    )
  `;

export const PROSPECT_COOLDOWNS_DDL = `
    CREATE TABLE IF NOT EXISTS prospect_cooldowns (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(20) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_by VARCHAR(20) NOT NULL,
      reason VARCHAR(500) NULL,
      prospect_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_pcool_user (user_id),
      INDEX idx_pcool_expires (expires_at)
    )
  `;

export type SecretaryDdlClient = {
  $executeRawUnsafe: (sql: string) => Promise<unknown>;
};

export function isMissingSecretaryTableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const rec = err as { code?: unknown; message?: unknown; meta?: { code?: unknown; message?: unknown } };
  const codes = [rec.code, rec.meta?.code].map((c) => String(c ?? ""));
  if (codes.some((c) => c === "ER_NO_SUCH_TABLE" || c === "1146")) return true;
  const messages = [rec.message, rec.meta?.message].map((m) => String(m ?? "").toLowerCase());
  return messages.some((m) => m.includes("doesn't exist") || m.includes("does not exist") || m.includes("unknown table"));
}

export async function ensureProspectSettingsTables(db: SecretaryDdlClient): Promise<void> {
  await db.$executeRawUnsafe(PROSPECT_CONFIG_DDL);
  await db.$executeRawUnsafe(PROSPECT_COOLDOWNS_DDL);
}
