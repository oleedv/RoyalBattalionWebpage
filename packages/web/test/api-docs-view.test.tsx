import { test, expect, mock } from "bun:test";
import { render, screen } from "@testing-library/react";

mock.module("../app/(protected)/api-docs/swagger-embed", () => ({
  SwaggerEmbed: () => <div data-testid="swagger-embed" />,
}));

import { ApiDocsView } from "@/app/(protected)/api-docs/api-docs-view";

test("canView=false shows permission message and hides the embed", () => {
  render(<ApiDocsView canView={false} />);
  expect(screen.getByText(/developer access/i)).toBeDefined();
  expect(screen.queryByTestId("swagger-embed")).toBeNull();
});

test("canView=true shows the swagger embed and page title, not the permission message", () => {
  render(<ApiDocsView canView={true} />);
  expect(screen.getByTestId("swagger-embed")).toBeDefined();
  expect(screen.getByText(/API Documentation/i)).toBeDefined();
  expect(screen.queryByText(/developer access/i)).toBeNull();
});
