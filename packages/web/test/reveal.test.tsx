import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { Reveal } from "@/components/public/reveal";

test("reveal is immediately visible when IntersectionObserver is unavailable", () => {
  // happy-dom has no IntersectionObserver — the guard path must show content
  const savedIO = (globalThis as any).IntersectionObserver;
  (globalThis as any).IntersectionObserver = undefined;
  try {
    const { container } = render(
      <Reveal>
        <p>Section content</p>
      </Reveal>,
    );
    const el = container.firstElementChild!;
    expect(el.className).toContain("reveal");
    expect(el.className).toContain("reveal-visible");
  } finally {
    (globalThis as any).IntersectionObserver = savedIO;
  }
});

test("reveal applies stagger delay", () => {
  const { container } = render(<Reveal delay={160}>x</Reveal>);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.transitionDelay).toBe("160ms");
});
