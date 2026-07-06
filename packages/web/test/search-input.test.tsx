import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchInput } from "@/components/search-input-v2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("debounces onSearch to the final value", async () => {
  const calls: string[] = [];
  render(
    <SearchInput
      onSearch={(v) => calls.push(v)}
      debounceMs={50}
      placeholder="Search"
    />,
  );
  const input = screen.getByPlaceholderText("Search");
  fireEvent.change(input, { target: { value: "fal" } });
  fireEvent.change(input, { target: { value: "falke" } });
  expect(calls).toEqual([]);
  await sleep(90);
  expect(calls).toEqual(["falke"]);
});

test("clear button empties and fires immediately", async () => {
  const calls: string[] = [];
  render(
    <SearchInput
      onSearch={(v) => calls.push(v)}
      debounceMs={50}
      placeholder="Search"
    />,
  );
  const input = screen.getByPlaceholderText("Search") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "x" } });
  await sleep(90);
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(input.value).toBe("");
  expect(calls).toEqual(["x", ""]);
});
