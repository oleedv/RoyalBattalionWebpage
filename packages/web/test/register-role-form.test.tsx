import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RegisterRoleForm } from "@/app/(protected)/roles/register-role-form";

test("submitting trimmed values calls onRegister and clears on success", async () => {
  const onRegister = mock(async (_id: string, _name: string) => true);
  render(<RegisterRoleForm onRegister={onRegister} adding={false} error={null} />);

  const idInput = screen.getByPlaceholderText("Discord Role ID") as HTMLInputElement;
  const nameInput = screen.getByPlaceholderText("Display Name") as HTMLInputElement;
  fireEvent.change(idInput, { target: { value: "  123  " } });
  fireEvent.change(nameInput, { target: { value: "  Admin  " } });
  fireEvent.click(screen.getByRole("button", { name: "Register Role" }));

  await waitFor(() => expect(onRegister).toHaveBeenCalledWith("123", "Admin"));
  await waitFor(() => expect(idInput.value).toBe(""));
  expect(nameInput.value).toBe("");
});

test("does not clear inputs when onRegister returns false", async () => {
  const onRegister = mock(async () => false);
  render(<RegisterRoleForm onRegister={onRegister} adding={false} error={null} />);
  const idInput = screen.getByPlaceholderText("Discord Role ID") as HTMLInputElement;
  fireEvent.change(idInput, { target: { value: "123" } });
  fireEvent.change(screen.getByPlaceholderText("Display Name"), { target: { value: "Admin" } });
  fireEvent.click(screen.getByRole("button", { name: "Register Role" }));
  await waitFor(() => expect(onRegister).toHaveBeenCalled());
  expect(idInput.value).toBe("123");
});

test("empty values do not call onRegister", () => {
  const onRegister = mock(async () => true);
  render(<RegisterRoleForm onRegister={onRegister} adding={false} error={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Register Role" }));
  expect(onRegister).not.toHaveBeenCalled();
});

test("adding shows Registering... and disables the button", () => {
  render(<RegisterRoleForm onRegister={mock(async () => true)} adding={true} error={null} />);
  const btn = screen.getByRole("button", { name: "Registering..." }) as HTMLButtonElement;
  expect(btn.disabled).toBe(true);
});

test("error renders below the form", () => {
  render(<RegisterRoleForm onRegister={mock(async () => true)} adding={false} error="Role already exists" />);
  expect(screen.getByText("Role already exists")).toBeDefined();
});
