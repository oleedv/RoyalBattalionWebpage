import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/empty-state";

test("default variant renders the lion mark and message", () => {
  const { container } = render(<EmptyState message="No results." />);
  expect(container.querySelector("img")).not.toBeNull();
  expect(screen.getByText("No results.")).toBeDefined();
});

test("hint variant is a one-line mono message with no image", () => {
  const { container } = render(
    <EmptyState variant="hint" message="Type a command and press Enter." />,
  );
  expect(container.querySelector("img")).toBeNull();
  const p = screen.getByText("Type a command and press Enter.");
  expect(p.className).toContain("font-mono");
});
