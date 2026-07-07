import { test, expect } from "bun:test";
import { coerceErrorMessage, TOAST_BYPASS_CODES } from "@/lib/toast";

test("passes ordinary error strings through", () => {
  expect(coerceErrorMessage("Failed to save")).toBe("Failed to save");
});

test("falls back when error is missing", () => {
  expect(coerceErrorMessage(undefined)).toBe("Request failed");
  expect(coerceErrorMessage(null, "Could not link Steam ID")).toBe(
    "Could not link Steam ID",
  );
});

test("machine codes never toast", () => {
  expect(coerceErrorMessage("ACCOUNT_DISABLED")).toBeNull();
  expect(coerceErrorMessage("NOT_IN_GUILD")).toBeNull();
  expect(TOAST_BYPASS_CODES.has("ACCOUNT_DISABLED")).toBe(true);
});
