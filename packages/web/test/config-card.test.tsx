import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ConfigCard } from "@/components/config-card";

test("renders title, description, header action, children and footer", () => {
  render(
    <ConfigCard
      title="Birthday announcements"
      description="Posted once per day."
      headerAction={<button>Enabled</button>}
      footer={<button>Save</button>}
    >
      <p>form fields</p>
    </ConfigCard>,
  );
  expect(screen.getByText("Birthday announcements")).toBeDefined();
  expect(screen.getByText("Posted once per day.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Enabled" })).toBeDefined();
  expect(screen.getByText("form fields")).toBeDefined();
  expect(screen.getByRole("button", { name: "Save" })).toBeDefined();
});

test("omits optional slots cleanly", () => {
  const { container } = render(
    <ConfigCard title="Plain">
      <p>body</p>
    </ConfigCard>,
  );
  expect(container.querySelectorAll("button").length).toBe(0);
});
