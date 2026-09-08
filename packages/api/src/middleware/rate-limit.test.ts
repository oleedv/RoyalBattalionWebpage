import { beforeEach, describe, expect, test } from "bun:test";
import { checkRateLimit, resetRateLimitBuckets } from "./rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimitBuckets());

  test("allows up to max then limits", () => {
    expect(checkRateLimit("t", 2, 60_000).limited).toBe(false);
    expect(checkRateLimit("t", 2, 60_000).limited).toBe(false);
    expect(checkRateLimit("t", 2, 60_000).limited).toBe(true);
  });

  test("isolates keys", () => {
    checkRateLimit("a", 1, 60_000);
    expect(checkRateLimit("a", 1, 60_000).limited).toBe(true);
    expect(checkRateLimit("b", 1, 60_000).limited).toBe(false);
  });
});
