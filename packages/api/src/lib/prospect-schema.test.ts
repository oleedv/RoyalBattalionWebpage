import { describe, expect, test } from "bun:test";
import {
  PROSPECT_CONFIG_DDL,
  PROSPECT_COOLDOWNS_DDL,
  ensureProspectSettingsTables,
  isMissingSecretaryTableError,
} from "./prospect-schema";

describe("isMissingSecretaryTableError", () => {
  test("recognizes MariaDB ER_NO_SUCH_TABLE / 1146", () => {
    expect(isMissingSecretaryTableError({ code: "ER_NO_SUCH_TABLE" })).toBe(true);
    expect(isMissingSecretaryTableError({ code: "1146" })).toBe(true);
    expect(
      isMissingSecretaryTableError({
        message: "Raw query failed. Code: `1146`. Message: `Table 'Royal_secretary.prospect_cooldowns' doesn't exist`",
      }),
    ).toBe(true);
  });

  test("recognizes Prisma wrapped meta.code 1146", () => {
    expect(
      isMissingSecretaryTableError({
        code: "P2010",
        meta: { code: "1146", message: "Table 'x.prospect_cooldowns' doesn't exist" },
      }),
    ).toBe(true);
  });

  test("does not treat other errors as missing table", () => {
    expect(isMissingSecretaryTableError(null)).toBe(false);
    expect(isMissingSecretaryTableError(new Error("connection refused"))).toBe(false);
    expect(isMissingSecretaryTableError({ code: "ER_ACCESS_DENIED_ERROR" })).toBe(false);
  });
});

describe("prospect settings DDL", () => {
  test("creates both tables the bot and API share", () => {
    expect(PROSPECT_CONFIG_DDL).toContain("CREATE TABLE IF NOT EXISTS prospect_config");
    expect(PROSPECT_CONFIG_DDL).toContain("cooldown_days");
    expect(PROSPECT_COOLDOWNS_DDL).toContain("CREATE TABLE IF NOT EXISTS prospect_cooldowns");
    expect(PROSPECT_COOLDOWNS_DDL).toContain("expires_at");
    expect(PROSPECT_COOLDOWNS_DDL).toContain("created_by");
    expect(PROSPECT_COOLDOWNS_DDL).toContain("prospect_id");
  });
});

describe("ensureProspectSettingsTables", () => {
  test("executes config then cooldowns DDL", async () => {
    const executed: string[] = [];
    await ensureProspectSettingsTables({
      $executeRawUnsafe: async (sql: string) => {
        executed.push(sql);
        return 0;
      },
    });
    expect(executed).toEqual([PROSPECT_CONFIG_DDL, PROSPECT_COOLDOWNS_DDL]);
  });
});
