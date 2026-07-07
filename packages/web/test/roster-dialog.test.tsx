import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { RosterDialog } from "@/components/roster-dialog";

const rows = [
  { id: "1", primary: "Brick", secondary: "@brick", meta: "Dashboard", avatarUrl: null },
  { id: "2", primary: "Aldo", meta: "Whitelist", avatarUrl: null },
];

test("renders count header and rows when open", () => {
  render(
    <RosterDialog open onOpenChange={() => {}} title="Online" rows={rows} />,
  );
  expect(screen.getByText("Online (2)")).toBeDefined();
  expect(screen.getByText("Brick")).toBeDefined();
  expect(screen.getByText("@brick")).toBeDefined();
  expect(screen.getByText("Whitelist")).toBeDefined();
  expect(screen.getByText("A")).toBeDefined(); // Aldo initial fallback
});

test("renders nothing when closed", () => {
  render(
    <RosterDialog
      open={false}
      onOpenChange={() => {}}
      title="Online"
      rows={rows}
    />,
  );
  expect(screen.queryByText("Online (2)")).toBeNull();
});
