import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { AvatarStack } from "./avatar-stack";

const users = [
  { id: "1", name: "Alice", meta: "Dashboard" },
  { id: "2", name: "Bob", meta: "Live Server" },
];

test("presence tooltip hover is scoped to each avatar, not a parent group", () => {
  const { container } = render(
    <div className="group">
      <AvatarStack users={users} />
    </div>,
  );

  const items = container.querySelectorAll("[data-slot=avatar-stack-item]");
  expect(items.length).toBe(2);

  for (const item of items) {
    const classes = item.className.split(/\s+/);
    expect(classes).toContain("group/avatar");
    expect(classes).not.toContain("group");

    const tooltip = item.querySelector("div.pointer-events-none");
    expect(tooltip).not.toBeNull();
    expect(tooltip!.className).toContain("group-hover/avatar:");
    expect(tooltip!.className.split(/\s+/)).not.toContain("group-hover:opacity-100");
  }
});
