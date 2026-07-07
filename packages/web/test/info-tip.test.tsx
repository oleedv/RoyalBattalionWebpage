import { test, expect } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { InfoTip } from "@/components/info-tip";

test("opens on click with tooltip text and aria wiring", () => {
  render(<InfoTip label="KDR" text="Kills divided by deaths." />);
  const btn = screen.getByRole("button", { name: "KDR — what's this?" });
  expect(btn.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(btn);
  const tip = screen.getByRole("tooltip");
  expect(tip.textContent).toBe("Kills divided by deaths.");
  expect(btn.getAttribute("aria-expanded")).toBe("true");
  expect(btn.getAttribute("aria-describedby")).toBe(tip.id);
});

test("closes on Escape", () => {
  render(<InfoTip label="KDR" text="Kills divided by deaths." />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.queryByRole("tooltip")).not.toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("opens on focus and closes on blur", () => {
  render(<InfoTip label="KDR" text="Kills divided by deaths." />);
  const btn = screen.getByRole("button");
  fireEvent.focus(btn);
  expect(screen.queryByRole("tooltip")).not.toBeNull();
  fireEvent.blur(btn);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
