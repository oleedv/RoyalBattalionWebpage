import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useEffect, useRef } from "react";

const resolveDiscordNames = mock(async (_token: string, ids: string[]) => {
  const data: Record<string, string> = {};
  for (const id of ids) {
    if (id === "mentor-1") data[id] = "Alice";
  }
  return { success: true as const, data };
});

mock.module("@/lib/api-client", () => ({
  resolveDiscordNames,
}));

const { useDiscordNameMap } = await import("./use-discord-names");

function Probe({ onResolve }: { onResolve: (fn: (ids: string[]) => Promise<void>) => void }) {
  const { resolveNames, nameMap } = useDiscordNameMap("test-token");
  const loadCount = useRef(0);
  const resolveNamesRef = useRef(resolveNames);
  resolveNamesRef.current = resolveNames;
  onResolve((ids) => resolveNamesRef.current(ids));

  useEffect(() => {
    loadCount.current += 1;
    void resolveNames(["applicant-1", "mentor-1"]);
  }, [resolveNames]);

  return (
    <div>
      <span data-testid="loads">{loadCount.current}</span>
      <span data-testid="mentor">{nameMap["mentor-1"] || ""}</span>
    </div>
  );
}

afterEach(() => {
  cleanup();
  resolveDiscordNames.mockClear();
});

test("resolveNames identity stays stable after a partial name lookup", async () => {
  render(<Probe onResolve={() => {}} />);

  await waitFor(() => {
    expect(document.querySelector("[data-testid='mentor']")?.textContent).toBe("Alice");
  });

  await new Promise((r) => setTimeout(r, 50));

  expect(Number(document.querySelector("[data-testid='loads']")?.textContent)).toBe(1);
  expect(resolveDiscordNames.mock.calls.length).toBe(1);
});
