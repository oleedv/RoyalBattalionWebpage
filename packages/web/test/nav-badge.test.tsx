import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { NavBadge } from "@/components/nav-badge";

test("renders nothing for zero", () => {
  const { container } = render(<NavBadge count={0} />);
  expect(container.innerHTML).toBe("");
});

test("renders danger pill with mono count and rail dot", () => {
  const { container } = render(<NavBadge count={7} />);
  const pill = container.querySelector('[data-slot="nav-badge-count"]')!;
  expect(pill.textContent).toBe("7");
  expect(pill.className).toContain("bg-danger");
  expect(pill.className).toContain("font-mono");
  const dot = container.querySelector('[data-slot="nav-badge-dot"]')!;
  expect(dot.getAttribute("aria-hidden")).toBe("true");
});

test("caps display at 99+", () => {
  const { container } = render(<NavBadge count={130} />);
  expect(
    container.querySelector('[data-slot="nav-badge-count"]')!.textContent,
  ).toBe("99+");
});
