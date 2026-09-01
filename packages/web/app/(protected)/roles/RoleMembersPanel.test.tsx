import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!(globalThis as { happyDOM?: unknown }).happyDOM) {
  GlobalRegistrator.register();
}

import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import type { RoleMember } from "shared";

function member(
  partial: Partial<RoleMember> & Pick<RoleMember, "id" | "discordName">,
): RoleMember {
  return {
    discordId: partial.discordId ?? partial.id,
    displayName: partial.displayName ?? null,
    avatarUrl: null,
    hasLoggedIn: true,
    disabled: false,
    ...partial,
  };
}

const getRoleMembers = mock(async (_token: string, _roleId: string) => ({
  success: true as const,
  data: [
    member({ id: "1", discordName: "oleed", displayName: "Ole" }),
    member({ id: "2", discordName: "sarge", displayName: "Sarge" }),
  ],
}));

mock.module("@/lib/api-client", () => ({ getRoleMembers }));

mock.module("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const { RoleMembersPanel } = await import("./RoleMembersPanel");

afterEach(() => {
  cleanup();
  getRoleMembers.mockClear();
});

test("lists members as links to their profiles", async () => {
  render(<RoleMembersPanel apiToken="tok" roleId="role-1" memberCount={2} />);

  await waitFor(() => {
    expect(document.querySelector('a[href="/users/1"]')).not.toBeNull();
    expect(document.querySelector('a[href="/users/2"]')).not.toBeNull();
  });
  expect(document.body.textContent).toContain("Ole");
  expect(document.body.textContent).toContain("Sarge");
});

test("shows an empty state when nobody has the role", async () => {
  getRoleMembers.mockImplementationOnce(async () => ({
    success: true as const,
    data: [] as RoleMember[],
  }));

  render(<RoleMembersPanel apiToken="tok" roleId="role-2" memberCount={0} />);

  await waitFor(() => {
    expect(document.body.textContent).toContain("No one has this role");
  });
});

test("groups a large roster by letter", async () => {
  const data = [
    ...Array.from({ length: 15 }, (_, i) =>
      member({ id: `a${i}`, discordName: `a${i}`, displayName: `Alpha ${i}` }),
    ),
    ...Array.from({ length: 15 }, (_, i) =>
      member({ id: `b${i}`, discordName: `b${i}`, displayName: `Bravo ${i}` }),
    ),
  ];
  getRoleMembers.mockImplementationOnce(async () => ({
    success: true as const,
    data,
  }));

  render(<RoleMembersPanel apiToken="tok" roleId="role-3" memberCount={30} />);

  await waitFor(() => {
    expect(document.querySelector('[aria-label="Letter A"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="Letter B"]')).not.toBeNull();
  });
});
