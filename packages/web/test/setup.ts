import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();

if (typeof window !== "undefined") {
  // Base URL for happy-dom URL construction (needed by tests without the next/image mock path).
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
