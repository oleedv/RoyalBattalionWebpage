import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { FieldTip } from "@/components/field-tip";

test("wraps children and carries the ticket hint", () => {
  render(
    <FieldTip>
      <code>76561198012345678</code>
    </FieldTip>,
  );
  expect(screen.getByText("76561198012345678")).toBeDefined();
  expect(
    screen.getByText("If this is incorrect, create a community ticket."),
  ).toBeDefined();
});
