import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatCard, StatGroup } from "@/components/stat-card";

test("renders label, value and hint", () => {
  render(<StatCard label="Playtime" value="42h" hint="last 30 days" />);
  expect(screen.getByText("Playtime")).toBeDefined();
  expect(screen.getByText("42h")).toBeDefined();
  expect(screen.getByText("last 30 days")).toBeDefined();
});

test("accent variant colors the value gold", () => {
  render(<StatCard label="KDR" value="1.42" accent />);
  expect(screen.getByText("1.42").className).toContain("text-accent");
});

test("href wraps the card in a link", () => {
  render(<StatCard label="Open Tickets" value={3} href="/tickets" />);
  const link = screen.getByRole("link");
  expect(link.getAttribute("href")).toBe("/tickets");
});

test("tip renders an InfoTip trigger next to the label", () => {
  render(<StatCard label="Seed Days" value={5} tip="Distinct seeding days." />);
  expect(
    screen.getByRole("button", { name: "Seed Days — what's this?" }),
  ).toBeDefined();
});

test("StatGroup renders an uppercase group label above children", () => {
  render(
    <StatGroup label="Combat">
      <div>tiles</div>
    </StatGroup>,
  );
  expect(screen.getByText("Combat").className).toContain("uppercase");
  expect(screen.getByText("tiles")).toBeDefined();
});
