import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, expect, test } from "bun:test";
import { getHidePresence, HIDE_PRESENCE_KEY, setHidePresence } from "./hide-presence";

afterEach(() => {
  localStorage.removeItem(HIDE_PRESENCE_KEY);
});

test("getHidePresence is false by default", () => {
  expect(getHidePresence()).toBe(false);
});

test("setHidePresence persists and getHidePresence reads it", () => {
  setHidePresence(true);
  expect(localStorage.getItem(HIDE_PRESENCE_KEY)).toBe("1");
  expect(getHidePresence()).toBe(true);
  setHidePresence(false);
  expect(getHidePresence()).toBe(false);
});
