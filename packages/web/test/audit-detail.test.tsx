import { test, expect } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { AuditDetail } from "@/components/audit-detail";

const props = {
  fields: [{ label: "Server", value: "main" }],
  changes: [{ key: "groupId", label: "Group", from: "Whitelist", to: "SuperAdmin" }],
  plainChanges: [{ label: "Expires", value: "01/01/2026" }],
  raw: { server: "main", changes: { groupId: { from: "g1", to: "g2" } } },
};

test("renders fields, from-to change rows and plain changes", () => {
  render(<AuditDetail {...props} />);
  expect(screen.getByText("Server")).toBeDefined();
  expect(screen.getByText("main")).toBeDefined();
  expect(screen.getByText("Group")).toBeDefined();
  expect(screen.getByText("Whitelist")).toBeDefined();
  expect(screen.getByText("SuperAdmin")).toBeDefined();
  expect(screen.getByText("Expires")).toBeDefined();
});

test("show raw toggles the JSON block", () => {
  render(<AuditDetail {...props} />);
  expect(screen.queryByText(/"groupId"/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show raw" }));
  expect(screen.getByText(/"groupId"/)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Hide raw" }));
  expect(screen.queryByText(/"groupId"/)).toBeNull();
});
