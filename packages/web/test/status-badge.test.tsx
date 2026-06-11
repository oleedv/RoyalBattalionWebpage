import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/status-badge";

test("renders label and tone class", () => {
  render(<StatusBadge tone="success">Online</StatusBadge>);
  const el = screen.getByText("Online");
  expect(el.className).toContain("text-success");
});

test("pulse renders the live dot", () => {
  render(
    <StatusBadge tone="success" pulse>
      Live
    </StatusBadge>,
  );
  expect(document.querySelector("[data-slot=pulse-dot]")).not.toBeNull();
});

test("no pulse omits the dot", () => {
  render(<StatusBadge tone="danger">Offline</StatusBadge>);
  expect(document.querySelector("[data-slot=pulse-dot]")).toBeNull();
});
