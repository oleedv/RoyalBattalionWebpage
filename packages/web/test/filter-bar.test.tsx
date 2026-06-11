import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "@/components/filter-bar";

const filters = [
  { key: "clan", label: "Clan: RB" },
  { key: "expired", label: "Expired only" },
];

test("renders active filter chips and clears one", () => {
  const cleared: string[] = [];
  render(
    <FilterBar
      activeFilters={filters}
      onClear={(k) => cleared.push(k)}
      onClearAll={() => {}}
    >
      <span>controls</span>
    </FilterBar>,
  );
  expect(screen.getByText("Clan: RB")).toBeDefined();
  fireEvent.click(
    screen.getByRole("button", { name: "Remove filter Clan: RB" }),
  );
  expect(cleared).toEqual(["clan"]);
});

test("clear all appears only with active filters", () => {
  const { rerender } = render(
    <FilterBar activeFilters={[]} onClear={() => {}} onClearAll={() => {}} />,
  );
  expect(
    screen.queryByRole("button", { name: "Clear all filters" }),
  ).toBeNull();
  rerender(
    <FilterBar
      activeFilters={filters}
      onClear={() => {}}
      onClearAll={() => {}}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Clear all filters" }),
  ).toBeDefined();
});
