import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigDiffDialog } from "@/components/config-diff-dialog";
import type { SquadJSPlugin } from "shared";

const pluginA: SquadJSPlugin = { plugin: "PluginA", enabled: true, foo: 1 };
const pluginAChanged: SquadJSPlugin = { plugin: "PluginA", enabled: true, foo: 999 };
const pluginB: SquadJSPlugin = { plugin: "PluginB", enabled: false };

function baseProps(over: Record<string, unknown> = {}) {
  return {
    open: true,
    onOpenChange: mock((_: boolean) => {}),
    original: [pluginA, pluginB],
    updated: [pluginAChanged, pluginB],
    environment: "staging",
    onConfirm: mock(() => {}),
    saving: false,
    saveError: null,
    ...over,
  };
}

test("open=true renders changed plugin name and before/after JSON; unchanged plugin absent", () => {
  render(<ConfigDiffDialog {...(baseProps() as any)} />);
  expect(screen.getByText("Review Changes")).toBeDefined();
  // Changed plugin name appears as a diff section header
  expect(screen.getByText("PluginA")).toBeDefined();
  // Before value (foo: 1) and after value (foo: 999) appear in the pre elements
  expect(document.body.textContent).toContain('"foo": 1');
  expect(document.body.textContent).toContain('"foo": 999');
  // Unchanged plugin (PluginB) should not appear as a diff entry
  expect(screen.queryByText("PluginB")).toBeNull();
});

test("open=false renders no dialog content", () => {
  render(<ConfigDiffDialog {...(baseProps({ open: false }) as any)} />);
  expect(screen.queryByText("Review Changes")).toBeNull();
});

test("clicking Commit & Deploy calls onConfirm", () => {
  const props = baseProps();
  render(<ConfigDiffDialog {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Commit & Deploy" }));
  expect(props.onConfirm).toHaveBeenCalled();
});

test("clicking Cancel calls onOpenChange(false)", () => {
  const props = baseProps();
  render(<ConfigDiffDialog {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(props.onOpenChange).toHaveBeenCalledWith(false);
});

test("saving=true shows Committing... and the confirm button is disabled", () => {
  render(<ConfigDiffDialog {...(baseProps({ saving: true }) as any)} />);
  const btn = screen.getByRole("button", { name: "Committing..." }) as HTMLButtonElement;
  expect(btn).toBeDefined();
  expect(btn.disabled).toBe(true);
});

test("saveError is rendered", () => {
  render(<ConfigDiffDialog {...(baseProps({ saveError: "boom" }) as any)} />);
  expect(screen.getByText("boom")).toBeDefined();
});
