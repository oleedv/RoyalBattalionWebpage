import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { CapacityBar } from "@/components/capacity-bar";

function fill(container: HTMLElement): HTMLElement {
  return container.querySelector("[role=meter] > div") as HTMLElement;
}

test("fills proportionally with meter semantics", () => {
  const { container } = render(<CapacityBar value={50} max={100} />);
  const meter = container.querySelector("[role=meter]") as HTMLElement;
  expect(meter.getAttribute("aria-valuenow")).toBe("50");
  expect(meter.getAttribute("aria-valuemax")).toBe("100");
  expect(fill(container).style.width).toBe("50%");
});

test("clamps overflow and handles zero max", () => {
  const over = render(<CapacityBar value={120} max={100} />);
  expect(fill(over.container).style.width).toBe("100%");
  const zero = render(<CapacityBar value={5} max={0} />);
  expect(fill(zero.container).style.width).toBe("0%");
});
