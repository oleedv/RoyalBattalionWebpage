import { test, expect } from "bun:test";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { CopyableId } from "@/components/copyable-id";

test("copies the value to the clipboard", async () => {
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (t: string) => (written.push(t), Promise.resolve()) },
  });
  render(<CopyableId value="76561198000000000" />);
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Copy 76561198000000000" }),
    );
    await Promise.resolve();
  });
  expect(written).toEqual(["76561198000000000"]);
});
