import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvatarStack, type AvatarStackUser } from "@/components/avatar-stack";

const mkUsers = (n: number): AvatarStackUser[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `u${i}`,
    name: `User ${i}`,
    secondary: `@user${i}`,
    meta: "Dashboard",
    avatarUrl: null,
  }));

test("caps avatars and shows overflow chip", () => {
  const { container } = render(<AvatarStack users={mkUsers(18)} cap={15} />);
  expect(
    container.querySelectorAll('[data-slot="avatar-stack-item"]'),
  ).toHaveLength(15);
  expect(screen.getByText("+3")).toBeDefined();
});

test("initial fallback and tokenized presence dot", () => {
  const { container } = render(
    <AvatarStack users={[{ id: "a", name: "brick", avatarUrl: null }]} />,
  );
  expect(screen.getByText("B")).toBeDefined();
  const dot = container.querySelector('[data-slot="presence-dot"]')!;
  expect(dot.className).toContain("bg-success");
  expect(container.innerHTML).not.toContain("green-500");
});

test("click fires and button carries the label", () => {
  let clicks = 0;
  render(
    <AvatarStack
      users={mkUsers(2)}
      onClick={() => clicks++}
      label="View 2 online users"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "View 2 online users" }));
  expect(clicks).toBe(1);
});
