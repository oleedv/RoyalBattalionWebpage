import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { EmberHero } from "@/components/public/ember-hero";

test("renders the static lion and stays decorative without canvas 2d", () => {
  // happy-dom canvas has no usable 2d context -> degrade path
  const { container } = render(<EmberHero size={300} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector("img")).not.toBeNull();
  expect(container.querySelector("canvas")).not.toBeNull();
});
