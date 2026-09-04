import { expect, test } from "bun:test";
import { formatChannelAge, formatKbps, occupancyLabel } from "./labels";

const now = Date.parse("2026-09-04T12:00:00.000Z");

test("formatChannelAge covers minutes, hours, and days", () => {
  expect(formatChannelAge("2026-09-04T11:59:30.000Z", now)).toBe("just now");
  expect(formatChannelAge("2026-09-04T11:47:00.000Z", now)).toBe("13m");
  expect(formatChannelAge("2026-09-04T10:00:00.000Z", now)).toBe("2h");
  expect(formatChannelAge("2026-09-04T09:20:00.000Z", now)).toBe("2h 40m");
  expect(formatChannelAge("2026-09-02T12:00:00.000Z", now)).toBe("2d");
  expect(formatChannelAge("2026-09-02T10:00:00.000Z", now)).toBe("2d 2h");
  expect(formatChannelAge("nope", now)).toBe("");
});

test("formatKbps and occupancyLabel", () => {
  expect(formatKbps(96000)).toBe("96 kbps");
  expect(formatKbps(null)).toBe("default");
  expect(occupancyLabel(3, 8)).toBe("3/8");
  expect(occupancyLabel(3, 0)).toBe("3");
});
