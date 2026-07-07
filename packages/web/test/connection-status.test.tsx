import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConnectionStatus, ServerScope } from "@/components/connection-status";

test("ConnectionStatus shows the label and a toned dot", () => {
  const { container } = render(<ConnectionStatus tone="success" label="Connected" />);
  expect(screen.getByText("Connected")).toBeDefined();
  const dot = container.querySelector("span[data-slot='status-dot']")!;
  expect(dot.className).toContain("bg-success");
  expect(dot.className).not.toContain("scale-150");
});

test("ConnectionStatus flashes when active", () => {
  const { container } = render(
    <ConnectionStatus tone="warning" label="Reconnecting" active />,
  );
  const dot = container.querySelector("span[data-slot='status-dot']")!;
  expect(dot.className).toContain("bg-warning");
  expect(dot.className).toContain("scale-150");
});

test("ServerScope select renders options and switches", () => {
  const onSwitch = mock((_k: string) => {});
  render(
    <ServerScope servers={["main", "battle"]} active="main" onSwitch={onSwitch} variant="select" />,
  );
  const select = screen.getByRole("combobox", { name: "Active server" }) as HTMLSelectElement;
  expect(select.value).toBe("main");
  fireEvent.change(select, { target: { value: "battle" } });
  expect(onSwitch).toHaveBeenCalledWith("battle");
});

test("ServerScope tabs render pills, mark active, and switch on click", () => {
  const onSwitch = mock((_k: string) => {});
  render(
    <ServerScope servers={["main", "battle"]} active="main" onSwitch={onSwitch} variant="tabs" />,
  );
  const active = screen.getByRole("button", { name: "main" });
  expect(active.className).toContain("text-accent");
  fireEvent.click(screen.getByRole("button", { name: "battle" }));
  expect(onSwitch).toHaveBeenCalledWith("battle");
});

test("ServerScope hides itself with one or zero servers", () => {
  const { container: c1 } = render(
    <ServerScope servers={["main"]} active="main" onSwitch={() => {}} variant="select" />,
  );
  expect(c1.querySelector("select")).toBeNull();
  const { container: c2 } = render(
    <ServerScope servers={[]} active="" onSwitch={() => {}} variant="tabs" />,
  );
  expect(c2.querySelector("button")).toBeNull();
});
