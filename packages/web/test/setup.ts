import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

// Set up a base URL for happy-dom so relative paths work
if (typeof window !== "undefined") {
  // @ts-ignore
  window._isTestEnv = true;
  Object.defineProperty(window.location, "href", {
    writable: true,
    value: "http://localhost:3000/",
  });
}

// Bun's test runner does not auto-inject Testing Library cleanup the way
// jest/vitest do, so renders would otherwise accumulate across tests in the
// shared happy-dom document. Register a global afterEach to unmount.
const { afterEach } = await import("bun:test");
const { cleanup } = await import("@testing-library/react");
afterEach(() => cleanup());
