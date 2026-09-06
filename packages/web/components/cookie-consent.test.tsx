import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { CookieConsentBanner } from "./cookie-consent";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

test("shows an essential-cookies notice with OK, not Accept", () => {
  render(<CookieConsentBanner />);
  const text = document.body.textContent ?? "";
  expect(text).toContain("No tracking or advertising cookies");
  expect(text).toContain("OK");
  expect(text).not.toContain("Accept");
  expect(document.body.querySelector('a[href="/privacy"]')).toBeTruthy();
});

test("dismissing the notice hides it and does not come back", () => {
  render(<CookieConsentBanner />);
  fireEvent.click(document.body.querySelector("button")!);
  expect(document.body.textContent).not.toContain("No tracking or advertising cookies");
  expect(localStorage.getItem("rb-cookie-notice")).toBe("dismissed");
});
