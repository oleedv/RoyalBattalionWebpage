import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { PermissionProvider } from "@/lib/permission-context";
import SettingsPage from "./page";

afterEach(() => {
  cleanup();
});

test("hides the online-status option from non-developers", () => {
  render(
    <PermissionProvider permissions={["view:members"]} apiToken="t" user={null}>
      <SettingsPage />
    </PermissionProvider>,
  );
  expect(document.body.textContent).not.toContain("Hide from online list");
});

test("shows the online-status option to developers", () => {
  render(
    <PermissionProvider permissions={["developer"]} apiToken="t" user={null}>
      <SettingsPage />
    </PermissionProvider>,
  );
  expect(document.body.textContent).toContain("Hide from online list");
});
