import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { AccessDeniedCard } from "@/components/access-denied-card";

test("renders default title, message, and an optional CTA link", () => {
  render(
    <AccessDeniedCard
      message="You do not have access to the RCON console."
      cta={{ href: "/live-server", label: "Open Live Server Monitor" }}
    />,
  );
  expect(screen.getByText("Insufficient Permissions")).toBeDefined();
  expect(screen.getByText("You do not have access to the RCON console.")).toBeDefined();
  const link = screen.getByRole("link", { name: "Open Live Server Monitor" });
  expect(link.getAttribute("href")).toBe("/live-server");
});

test("omits the CTA when none is given and honors a custom title", () => {
  render(<AccessDeniedCard title="No access" message="Nope." />);
  expect(screen.getByText("No access")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
});
