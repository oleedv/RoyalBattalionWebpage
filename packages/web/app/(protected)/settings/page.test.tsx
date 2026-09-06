import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, beforeEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { PermissionProvider } from "@/lib/permission-context";
import SettingsPage from "./page";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ success: true, data: { request: null } }), {
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
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

test("shows a deletion request control to any signed-in member", () => {
  render(
    <PermissionProvider permissions={["view:members"]} apiToken="t" user={null}>
      <SettingsPage />
    </PermissionProvider>,
  );
  expect(document.body.textContent).toContain("Request deletion");
});
