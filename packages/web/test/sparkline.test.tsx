import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { sparklinePath } from "@/components/sparkline";
import {
  MultiSparkline,
  multiSparklineCoords,
} from "@/components/sparkline";

test("builds a polyline path across the full width", () => {
  const d = sparklinePath([0, 5, 10], 100, 30);
  expect(d.startsWith("M0,")).toBe(true);
  expect(d).toContain("L50,");
  expect(d).toContain("L100,");
});

test("flat series renders a midline", () => {
  const d = sparklinePath([4, 4, 4], 100, 30);
  expect(d).toBe("M0,15 L50,15 L100,15");
});

test("empty series yields empty path", () => {
  expect(sparklinePath([], 100, 30)).toBe("");
});

test("single value renders a flat line", () => {
  expect(sparklinePath([7], 100, 30)).toBe("M0,15 L100,15");
});

test("multiSparklineCoords scales against a fixed max with 0 baseline", () => {
  const coords = multiSparklineCoords([0, 50, 100], 200, 64, 100);
  expect(coords.length).toBe(3);
  expect(coords[0]).toEqual({ x: 0, y: 61 }); // 0 -> bottom pad (height - 3)
  expect(coords[2]).toEqual({ x: 200, y: 3 }); // max -> top pad
  expect(coords[1].y).toBe(32); // midpoint
});

test("MultiSparkline renders one area+line pair per series and a legend", () => {
  const { container } = render(
    <MultiSparkline
      series={[
        { values: [10, 40, 80], label: "Players", className: "text-accent" },
        { values: [0, 2, 4], label: "Queue", className: "text-warning" },
      ]}
      fixedMax={100}
    />,
  );
  expect(container.querySelectorAll("polygon").length).toBe(2);
  expect(container.querySelectorAll("polyline").length).toBe(2);
  expect(screen.getByText(/Players:/)).toBeDefined();
  expect(screen.getByText("80")).toBeDefined(); // current value in legend
  expect(screen.getByText(/Queue:/)).toBeDefined();
});

test("MultiSparkline returns null when no series has two points", () => {
  const { container } = render(
    <MultiSparkline
      series={[{ values: [5], label: "Players", className: "text-accent" }]}
    />,
  );
  expect(container.innerHTML).toBe("");
});
