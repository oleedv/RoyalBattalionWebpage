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

test("controlled: value prop drives input, onChange fires per keystroke", () => {
  const changes: string[] = [];
  const onChange = (v: string) => changes.push(v);
  const { rerender } = render(
    <SearchInput value="ald" onChange={onChange} placeholder="Search" />,
  );
  const input = screen.getByPlaceholderText("Search") as HTMLInputElement;
  expect(input.value).toBe("ald");
  fireEvent.change(input, { target: { value: "aldo" } });
  expect(changes).toEqual(["aldo"]);
  rerender(<SearchInput value="aldo" onChange={onChange} placeholder="Search" />);
  expect(input.value).toBe("aldo");
});

test("controlled: clear fires onChange and onSearch immediately", () => {
  const changes: string[] = [];
  const searches: string[] = [];
  render(
    <SearchInput
      value="x"
      onChange={(v) => changes.push(v)}
      onSearch={(v) => searches.push(v)}
      debounceMs={50}
      placeholder="Search"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(changes).toEqual([""]);
  expect(searches).toEqual([""]);
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
