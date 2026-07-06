import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/footer";

test("footer has no tech-stack links (public copy policy)", () => {
  render(<Footer />);
  expect(screen.queryByText(/Built With/i)).toBeNull();
  expect(screen.queryByText("Next.js")).toBeNull();
  expect(screen.queryByText("Prisma")).toBeNull();
});

test("footer keeps brand and legal links", () => {
  render(<Footer />);
  expect(screen.getByText("ROYAL BATTALION")).toBeDefined();
  expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("/terms");
  expect(screen.getByRole("link", { name: "Contact (Discord)" })).toBeDefined();
});
