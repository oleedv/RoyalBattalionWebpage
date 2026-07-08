import { test, expect, mock } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SquadJSPluginOptionValue } from "shared";
import { JsonEditorField } from "@/components/json-editor-field";

test("renders textarea pre-filled with JSON.stringify of value", () => {
  const value = { host: "localhost", port: 27015 };
  const onChange = mock(() => {});
  render(<JsonEditorField value={value} onChange={onChange} />);
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  expect(textarea.value).toContain('"host"');
});

test("valid JSON edit calls onChange with parsed object and shows no error", () => {
  const onChange = mock((_: SquadJSPluginOptionValue) => {});
  render(<JsonEditorField value={{ a: 1 }} onChange={onChange} />);
  const textarea = screen.getByRole("textbox");
  fireEvent.change(textarea, { target: { value: '{"a":2}' } });
  expect(onChange.mock.calls.length).toBe(1);
  expect(onChange.mock.calls[0][0]).toEqual({ a: 2 });
  expect(screen.queryByText("Invalid JSON")).toBeNull();
});

test("invalid JSON does not call onChange and shows error", () => {
  const onChange = mock((_: SquadJSPluginOptionValue) => {});
  render(<JsonEditorField value={{ a: 1 }} onChange={onChange} />);
  const textarea = screen.getByRole("textbox");
  fireEvent.change(textarea, { target: { value: "{bad" } });
  expect(onChange.mock.calls.length).toBe(0);
  expect(screen.getByText("Invalid JSON")).toBeDefined();
});

test("readOnly renders textarea with readOnly attribute", () => {
  render(
    <JsonEditorField value={{ x: 1 }} onChange={mock(() => {})} readOnly />,
  );
  const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
  expect(textarea.readOnly).toBe(true);
});

test("label and description render when provided", () => {
  render(
    <JsonEditorField
      value={{ x: 1 }}
      onChange={mock(() => {})}
      label="My Label"
      description="Some description"
    />,
  );
  expect(screen.getByText("My Label")).toBeDefined();
  expect(screen.getByText("Some description")).toBeDefined();
});
