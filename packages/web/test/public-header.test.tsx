import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import { PublicHeader } from "@/components/shell/public-header";

test("shows Login when unauthenticated", () => {
  render(
    <SessionProvider session={null}>
      <PublicHeader />
    </SessionProvider>,
  );
  const link = screen.getByRole("link", { name: "Login" });
  expect(link.getAttribute("href")).toBe("/login");
});

test("shows Dashboard when authenticated", () => {
  render(
    <SessionProvider
      session={{ user: { name: "Ole" }, expires: "2099-01-01T00:00:00.000Z" }}
    >
      <PublicHeader />
    </SessionProvider>,
  );
  const link = screen.getByRole("link", { name: "Dashboard" });
  expect(link.getAttribute("href")).toBe("/dashboard");
});
