import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SQUAD_COMMANDS, isDestructiveCommand } from "shared";
import { TerminalPane, type TerminalLine } from "@/components/terminal-pane";

function base(over: Record<string, unknown> = {}) {
  return {
    lines: [] as TerminalLine[],
    onSubmit: mock((_c: string) => {}),
    onClear: mock(() => {}),
    commands: SQUAD_COMMANDS,
    isDestructive: isDestructiveCommand,
    emptyHint: "Type a command and press Enter.",
    placeholder: "AdminBroadcast Hello",
    ...over,
  };
}

test("shows the empty hint, then echoes lines with output/error tones", () => {
  const { rerender } = render(<TerminalPane {...(base() as any)} />);
  expect(screen.getByText("Type a command and press Enter.")).toBeDefined();

  const lines: TerminalLine[] = [
    { id: 1, command: "ListPlayers", output: "2 players", success: true },
    { id: 2, command: "AdminKick x", output: "", success: false, error: "not found" },
  ];
  rerender(<TerminalPane {...(base({ lines }) as any)} />);
  expect(screen.getByText("2 players").className).toContain("text-text-secondary");
  expect(screen.getByText("not found").className).toContain("text-danger");
});

test("submitting a non-destructive command calls onSubmit and clears", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ListPlayers" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect((props.onSubmit as any)).toHaveBeenCalledWith("ListPlayers");
  expect(input.value).toBe("");
});

test("a destructive command routes through the AlertDialog confirm", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "AdminKick Bob spam" } });
  fireEvent.keyDown(input, { key: "Enter" });
  // not sent yet — confirm first
  expect((props.onSubmit as any)).not.toHaveBeenCalled();
  expect(screen.getByText(/about to run/i)).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: /run command/i }));
  expect((props.onSubmit as any)).toHaveBeenCalledWith("AdminKick Bob spam");
});

test("cancelling the confirm does not submit", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "AdminBan Bob 0 cheat" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
  expect((props.onSubmit as any)).not.toHaveBeenCalled();
});

test("autocomplete lists first-token matches; click accepts", async () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ListP" } });
  await waitFor(() => expect(screen.getByText("ListPlayers")).toBeDefined());
  fireEvent.click(screen.getByText("ListPlayers"));
  expect(input.value).toBe("ListPlayers ");
});

test("Tab accepts the first suggestion", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ListP" } });
  fireEvent.keyDown(input, { key: "Tab" });
  expect(input.value).toBe("ListPlayers ");
});

test("history walks with ArrowUp/ArrowDown", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  const input = screen.getByPlaceholderText("AdminBroadcast Hello") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "ListPlayers" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.change(input, { target: { value: "ListSquads" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input.value).toBe("ListSquads");
  fireEvent.keyDown(input, { key: "ArrowUp" });
  expect(input.value).toBe("ListPlayers");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input.value).toBe("ListSquads");
});

test("Clear calls onClear", () => {
  const props = base();
  render(<TerminalPane {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: /clear/i }));
  expect((props.onClear as any)).toHaveBeenCalled();
});
