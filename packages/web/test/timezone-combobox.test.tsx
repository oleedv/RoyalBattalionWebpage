import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getTimezones, TimezoneCombobox } from "@/components/timezone-combobox";

test("getTimezones returns a validated IANA list", () => {
  const zones = getTimezones();
  expect(zones.length).toBeGreaterThan(10);
  expect(zones).toContain("Europe/Oslo");
  expect(zones).toContain("UTC");
  // every entry must be constructible as a real timezone
  for (const tz of zones.slice(0, 25)) {
    expect(() => new Intl.DateTimeFormat("en-GB", { timeZone: tz })).not.toThrow();
  }
});

test("trigger shows the current value", () => {
  render(<TimezoneCombobox value="Europe/Oslo" onChange={() => {}} />);
  expect(
    screen.getByRole("combobox", { name: /Europe\/Oslo/ }),
  ).toBeDefined();
});

test("opens, filters and selects a timezone", async () => {
  const onChange = mock((_tz: string) => {});
  render(<TimezoneCombobox value="UTC" onChange={onChange} />);
  fireEvent.click(screen.getByRole("combobox"));
  const input = await screen.findByPlaceholderText("Search timezone...");
  fireEvent.change(input, { target: { value: "Oslo" } });
  await waitFor(() => {
    expect(screen.getByText("Europe/Oslo")).toBeDefined();
  });
  fireEvent.click(screen.getByText("Europe/Oslo"));
  expect(onChange).toHaveBeenCalledWith("Europe/Oslo");
});
