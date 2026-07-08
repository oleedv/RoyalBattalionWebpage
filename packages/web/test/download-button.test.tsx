// packages/web/test/download-button.test.tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { DownloadButton } from "@/components/download-button";

test("clicking downloads a text/plain blob with the given filename", () => {
  const createURL = mock((_blob: Blob) => "blob:mock-url");
  const revokeURL = mock(() => {});
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = createURL as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revokeURL as unknown as typeof URL.revokeObjectURL;

  let captured: HTMLAnchorElement | null = null;
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    captured = this;
  };

  try {
    render(<DownloadButton text="hello world" filename="ticket-1.txt" />);
    fireEvent.click(screen.getByRole("button", { name: /download/i }));

    expect(createURL).toHaveBeenCalledTimes(1);
    const blob = createURL.mock.calls[0][0];
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("text/plain");
    expect(captured).not.toBeNull();
    expect(captured!.download).toBe("ticket-1.txt");
    expect(captured!.href).toContain("blob:mock-url");
    expect(revokeURL).toHaveBeenCalledTimes(1);
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    HTMLAnchorElement.prototype.click = origClick;
  }
});

test("renders a custom label", () => {
  render(<DownloadButton text="x" filename="f.txt" label="Export .txt" />);
  expect(screen.getByRole("button", { name: /export \.txt/i })).toBeDefined();
});
