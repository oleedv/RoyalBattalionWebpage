import { beforeEach, afterEach, test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";

// mock.module must come before the import of the module under test so the
// mock is in place when the component's module graph initialises.
const mockToastSuccess = mock(() => {});
mock.module("sonner", () => ({
  toast: { success: mockToastSuccess },
}));

import SettingsPage from "@/app/(protected)/settings/page";

function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
}

beforeEach(() => {
  localStorage.clear();
  // applyTheme("light") calls classList.replace("dark", "light") — requires
  // "dark" to already be present or the replace is a silent no-op.
  document.documentElement.classList.add("dark");
  stubMatchMedia();
  mockToastSuccess.mockReset();
});

afterEach(() => {
  document.documentElement.classList.remove("dark", "light");
});

test("(1) clicking Light theme persists rb-theme=light and adds light class to documentElement", () => {
  render(<SettingsPage />);
  // ToggleGroupItem renders as <button>; Base UI Toggle responds to fireEvent.click.
  fireEvent.click(screen.getByRole("button", { name: /^light$/i }));
  expect(localStorage.getItem("rb-theme")).toBe("light");
  expect(document.documentElement.classList.contains("light")).toBe(true);
});

test("(2) selecting Main Server persists rb-default-server=main and calls toast.success", async () => {
  render(<SettingsPage />);
  // Open the Base UI Select via its combobox trigger.
  fireEvent.click(screen.getByRole("combobox"));
  // The positioner renders in a portal; find the item once the popup is open.
  const item = await screen.findByText("Main Server");
  // Base UI SelectItem requires a real-pointer sequence: pointerDown sets
  // allowMouseSelectionRef=true, then click is accepted as valid.
  fireEvent.pointerDown(item, { pointerType: "mouse", buttons: 1 });
  fireEvent.click(item);
  expect(localStorage.getItem("rb-default-server")).toBe("main");
  expect(mockToastSuccess).toHaveBeenCalledWith("Saved");
});

test("(3) version text renders with NEXT_PUBLIC_APP_VERSION or dev fallback", () => {
  render(<SettingsPage />);
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  // The version value lives in a <span> inside the About card.
  expect(screen.getByText(version)).toBeDefined();
});
