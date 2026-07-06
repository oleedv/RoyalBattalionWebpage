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

test("variant supplies tone, label and pulse defaults", () => {
  const { container, rerender } = render(<StatusBadge variant="match-win" />);
  expect(container.textContent).toBe("WIN");
  expect(container.querySelector("span")!.className).toContain("text-success");

  rerender(<StatusBadge variant="server-online" />);
  expect(container.textContent).toBe("Online");
  expect(container.querySelector('[data-slot="pulse-dot"]')).not.toBeNull();

  rerender(<StatusBadge variant="ticket-legacy" />);
  expect(container.textContent).toBe("Legacy");
  expect(container.querySelector("span")!.className).toContain("text-warning");
});

test("children override the variant label", () => {
  render(<StatusBadge variant="ticket-open">Open — escalated</StatusBadge>);
  expect(screen.getByText("Open — escalated")).toBeDefined();
});
