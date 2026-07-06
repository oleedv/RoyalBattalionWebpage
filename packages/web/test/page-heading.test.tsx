import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PublicPageHeading } from "@/components/public/page-heading";

test("renders Cinzel title and lede", () => {
  render(<PublicPageHeading title="Match History" lede="Recent matches." />);
  const h1 = screen.getByRole("heading", { level: 1, name: "Match History" });
  expect(h1.className).toContain("font-display");
  expect(screen.getByText("Recent matches.")).toBeDefined();
});
