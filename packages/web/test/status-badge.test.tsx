import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusBadge, matchResultVariant, ticketStatusVariant } from "@/components/status-badge";

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

test("matchResultVariant maps results case-insensitively", () => {
  expect(matchResultVariant("WIN")).toBe("match-win");
  expect(matchResultVariant("loss")).toBe("match-loss");
  expect(matchResultVariant("DRAW")).toBe("match-draw");
  expect(matchResultVariant("unknown")).toBe("match-draw");
});

test("whitelist variants render their tones and accept label overrides", () => {
  const { container } = render(
    <>
      <StatusBadge variant="wl-expired" />
      <StatusBadge variant="wl-expiring">3d left</StatusBadge>
      <StatusBadge variant="wl-permanent" />
    </>,
  );
  expect(screen.getByText("Expired").className).toContain("text-danger");
  expect(screen.getByText("3d left").className).toContain("text-warning");
  expect(screen.getByText("Permanent").className).toContain("text-text-secondary");
  expect(container.querySelectorAll("[data-slot=pulse-dot]").length).toBe(0);
});

test("ticket-closing variant renders warning tone", () => {
  render(<StatusBadge variant="ticket-closing" />);
  const el = screen.getByText("Closing");
  expect(el.className).toContain("text-warning");
});

test("ticketStatusVariant maps ticket and prospect statuses", () => {
  expect(ticketStatusVariant("open")).toBe("ticket-open");
  expect(ticketStatusVariant("closing")).toBe("ticket-closing");
  expect(ticketStatusVariant("closed")).toBe("ticket-closed");
  expect(ticketStatusVariant("accepted")).toBe("ticket-accepted");
  expect(ticketStatusVariant("denied")).toBe("ticket-denied");
  expect(ticketStatusVariant("whatever")).toBe("ticket-closed");
});
