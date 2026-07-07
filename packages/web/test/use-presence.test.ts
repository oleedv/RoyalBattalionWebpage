import { test, expect } from "bun:test";
import { formatPageName } from "@/hooks/use-presence";

test("formats route paths into page names", () => {
  expect(formatPageName("/discord-users")).toBe("Discord Users");
  expect(formatPageName("/live-server/console")).toBe("Live Server Console");
  expect(formatPageName("/")).toBe("Dashboard");
});
