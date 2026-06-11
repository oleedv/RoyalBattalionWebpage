import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";

test("testing library renders into happy-dom", () => {
  render(<div data-testid="probe">gilded</div>);
  expect(screen.getByTestId("probe").textContent).toBe("gilded");
});
