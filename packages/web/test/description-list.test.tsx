import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DescriptionList, InfoField } from "@/components/description-list";

test("renders dt/dd pairs with mono option", () => {
  const { container } = render(
    <DescriptionList>
      <InfoField label="Created">today</InfoField>
      <InfoField label="Steam ID" mono>
        76561198000000000
      </InfoField>
    </DescriptionList>,
  );
  expect(container.querySelector("dl")).not.toBeNull();
  expect(screen.getByText("Steam ID").tagName).toBe("DT");
  const dd = screen.getByText("76561198000000000");
  expect(dd.tagName).toBe("DD");
  expect(dd.className).toContain("font-mono");
});
