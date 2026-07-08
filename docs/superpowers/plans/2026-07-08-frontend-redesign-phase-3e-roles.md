# Phase 3e — Roles Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 916-line `roles/page.tsx` permission-matrix editor onto the design-system composites (`Checkbox`, `Switch`, `AlertDialog`, `Button`, `Input`) and the page-shell/DI-view/lib structure, with byte-identical behavior and copy.

**Architecture:** Decompose the monolithic page into: a pure `lib.ts` (permission-group metadata + pure state helpers, unit-tested), three presentational components (`PermissionMatrix`, `RegisterRoleForm`, `RoleCard`), a DI `roles-view.tsx` holding all state/effects/handlers, and a thin default-only `page.tsx` shell. Hand-rolled checkboxes/switches/inline-confirm are replaced by composites; no behavior changes.

**Tech Stack:** Next.js 15 / React 19, Tailwind v4 tokens, `@base-ui/react` composites under `components/ui/`, `bun:test` + `@testing-library/react` (tests flat in `packages/web/test/`).

## Global Constraints

- **`page.tsx` MUST export only `default`.** The DI seam (View + Api + defaultApi) lives in `roles-view.tsx`, NOT in `page.tsx`. A non-default export in an app-router `page.tsx` breaks `next build` (silent — tsc/dev/tests all pass). Deploy-readiness is certified by `next build` reaching "Generating static pages", not by tsc/dev/tests alone.
- **Developer superpower:** `canManage = permissions.includes("developer") || permissions.includes("manage:roles")`. Derive it in the view from the raw `permissions: string[]` prop (mirrors `members-view`/`discord-users-view`). Never pass a pre-computed `manage:roles`-only boolean.
- **Adopt composites; no hand-rolled controls.** Use `Checkbox`, `Switch`, `AlertDialog`, `Button`, `Input` from `@/components/ui/*`. No hand-rolled `<input type=checkbox className=sr-only>` + svg, no hand-rolled toggle `<span>` switches, no inline Confirm/Cancel for delete. No raw `bg-white` (composites tokenize their thumbs).
- **No `window.confirm/alert/prompt`.** Delete confirmation uses `AlertDialog`.
- **`AlertDialogContent` max-width is `data-[size]`-qualified** — pass the `size` prop (`"default"` or `"sm"`); a caller `sm:max-w-*` is inert.
- **Preserve behavior exactly:** PERMISSION_GROUPS metadata + the dev-only coverage `console.warn`; register flow (trim, error, "Registering…"); accordion (exactly one role expanded at a time); pending-changes tracking with Save/Discard + "unsaved" badge; `grantsWhitelist` and `isMemberRole` optimistic toggles; auto-refresh paused while any role has pending edits OR a delete dialog is open; `canManage=false` renders a read-only matrix (no toggles, no Save, no Unregister, checkboxes disabled).
- **Preserve copy verbatim:** all labels/descriptions/placeholders/button text listed per task.
- **Commits:** conventional-commit one-liners, NO AI attribution/Co-Authored-By, no emojis.
- **Design tokens only** (existing `text-text-*`, `bg-bg-*`, `text-accent`, `text-success`, `text-warning`, `text-danger`, `border-border`, `facet-border` card chrome). Composite internal tokens (`bg-primary`, `border-input`, …) are already themed.

---

## File Structure

- `packages/web/app/(protected)/roles/lib.ts` — **new.** Types (`PermissionKey`, `PermEntry`, `PermSubGroup`, `PermGroup`), `PERMISSION_GROUPS`, coverage warn, pure helpers (`getAllGroupPerms`, `getGroupActiveCount`, `togglePerm`, `setGroupPerms`, `hasPendingChanges`).
- `packages/web/app/(protected)/roles/permission-matrix.tsx` — **new.** Renders PERMISSION_GROUPS for one role (Checkbox composite cards + group All/None).
- `packages/web/app/(protected)/roles/register-role-form.tsx` — **new.** Register form (Input + Button).
- `packages/web/app/(protected)/roles/role-card.tsx` — **new.** Accordion role card: header/badges, Switch toggles, Save/Discard bar, delete AlertDialog, embeds `PermissionMatrix`.
- `packages/web/app/(protected)/roles/roles-view.tsx` — **new.** `RolesView` + `RolesApi` + `defaultApi`; all state/effects/handlers.
- `packages/web/app/(protected)/roles/page.tsx` — **rewrite** to a thin default-only shell.
- Tests (new, flat): `test/roles-lib.test.ts`, `test/permission-matrix.test.tsx`, `test/register-role-form.test.tsx`, `test/role-card.test.tsx`, `test/roles-view.test.tsx`.

Reference for verbatim carries: the current `packages/web/app/(protected)/roles/page.tsx` (pre-change) — cited below as "current page".

---

### Task 1: `lib.ts` — permission metadata + pure helpers

**Files:**
- Create: `packages/web/app/(protected)/roles/lib.ts`
- Test: `packages/web/test/roles-lib.test.ts`

**Interfaces:**
- Consumes: `Permission`, `PERMISSIONS` from `shared`.
- Produces:
  - `type PermissionKey = Exclude<Permission, "developer">`
  - `interface PermEntry { perm: PermissionKey; label: string; description: string }`
  - `interface PermSubGroup { label: string; description: string; entries: PermEntry[] }`
  - `interface PermGroup { id: string; label: string; description: string; entries: PermEntry[]; subGroups?: PermSubGroup[] }`
  - `const PERMISSION_GROUPS: PermGroup[]`
  - `function getAllGroupPerms(group: PermGroup): PermissionKey[]`
  - `function getGroupActiveCount(group: PermGroup, effectivePerms: Permission[]): { active: number; total: number }`
  - `function togglePerm(current: Permission[], perm: Permission): Permission[]`
  - `function setGroupPerms(current: Permission[], group: PermGroup, select: boolean): Permission[]`
  - `function hasPendingChanges(pending: Permission[] | undefined, rolePerms: Permission[]): boolean`

- [ ] **Step 1: Write the failing test** — `packages/web/test/roles-lib.test.ts`

```ts
import { test, expect } from "bun:test";
import {
  PERMISSION_GROUPS,
  getAllGroupPerms,
  getGroupActiveCount,
  togglePerm,
  setGroupPerms,
  hasPendingChanges,
} from "@/app/(protected)/roles/lib";
import { PERMISSIONS, type Permission } from "shared";

const whitelist = PERMISSION_GROUPS.find((g) => g.id === "whitelist")!;
const tickets = PERMISSION_GROUPS.find((g) => g.id === "tickets")!;

test("every assignable permission is covered by exactly one group entry", () => {
  const grouped = PERMISSION_GROUPS.flatMap((g) => [
    ...g.entries.map((e) => e.perm),
    ...(g.subGroups?.flatMap((sg) => sg.entries.map((e) => e.perm)) ?? []),
  ]);
  const assignable = PERMISSIONS.filter((p) => p !== "developer");
  for (const p of assignable) expect(grouped).toContain(p);
  // no duplicates
  expect(new Set(grouped).size).toBe(grouped.length);
});

test("getAllGroupPerms includes entries and subgroup entries", () => {
  const all = getAllGroupPerms(tickets);
  expect(all).toContain("view:tickets");
  expect(all).toContain("manage:tickets");
  expect(all).toContain("view:tickets:whitelist"); // subgroup
  expect(all.length).toBe(7);
});

test("getGroupActiveCount counts active vs total across entries + subgroups", () => {
  const perms: Permission[] = ["view:tickets", "view:tickets:normal"];
  expect(getGroupActiveCount(tickets, perms)).toEqual({ active: 2, total: 7 });
});

test("togglePerm adds when absent, removes when present, without mutating input", () => {
  const cur: Permission[] = ["view:members"];
  const added = togglePerm(cur, "manage:members");
  expect(added).toEqual(["view:members", "manage:members"]);
  expect(cur).toEqual(["view:members"]); // not mutated
  expect(togglePerm(added, "view:members")).toEqual(["manage:members"]);
});

test("setGroupPerms select=true unions all group perms (deduped)", () => {
  const cur: Permission[] = ["view:whitelist"];
  const result = setGroupPerms(cur, whitelist, true);
  for (const p of getAllGroupPerms(whitelist)) expect(result).toContain(p);
  expect(new Set(result).size).toBe(result.length);
});

test("setGroupPerms select=false removes exactly the group perms, keeps others", () => {
  const cur: Permission[] = [...getAllGroupPerms(whitelist), "view:members"];
  const result = setGroupPerms(cur, whitelist, false);
  expect(result).toEqual(["view:members"]);
});

test("hasPendingChanges: undefined pending is false", () => {
  expect(hasPendingChanges(undefined, ["view:members"])).toBe(false);
});

test("hasPendingChanges: different length is true", () => {
  expect(hasPendingChanges(["view:members"], [])).toBe(true);
});

test("hasPendingChanges: same set (any order) is false", () => {
  expect(hasPendingChanges(["a", "b"] as Permission[], ["b", "a"] as Permission[])).toBe(false);
});

test("hasPendingChanges: same length different members is true", () => {
  expect(hasPendingChanges(["view:members"], ["manage:members"])).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/web/test/roles-lib.test.ts`
Expected: FAIL — module `@/app/(protected)/roles/lib` not found.

- [ ] **Step 3: Write `lib.ts`**

Create `packages/web/app/(protected)/roles/lib.ts`:
- Copy the `PermissionKey`/`PermEntry`/`PermSubGroup`/`PermGroup` type declarations and the entire `PERMISSION_GROUPS` array **verbatim** from the current page (current page lines 22–248), and the coverage-warn block (current page lines 250–263), adding `export` to the types and `PERMISSION_GROUPS`.
- Add the helpers:

```ts
export function getAllGroupPerms(group: PermGroup): PermissionKey[] {
  return [
    ...group.entries.map((e) => e.perm),
    ...(group.subGroups?.flatMap((sg) => sg.entries.map((e) => e.perm)) ?? []),
  ];
}

export function getGroupActiveCount(
  group: PermGroup,
  effectivePerms: Permission[],
): { active: number; total: number } {
  const all = getAllGroupPerms(group);
  return {
    active: all.filter((p) => effectivePerms.includes(p)).length,
    total: all.length,
  };
}

export function togglePerm(current: Permission[], perm: Permission): Permission[] {
  return current.includes(perm)
    ? current.filter((p) => p !== perm)
    : [...current, perm];
}

export function setGroupPerms(
  current: Permission[],
  group: PermGroup,
  select: boolean,
): Permission[] {
  const groupPerms = getAllGroupPerms(group);
  return select
    ? [...new Set([...current, ...groupPerms])]
    : (current.filter((p) => !groupPerms.includes(p as PermissionKey)) as Permission[]);
}

export function hasPendingChanges(
  pending: Permission[] | undefined,
  rolePerms: Permission[],
): boolean {
  if (!pending) return false;
  if (pending.length !== rolePerms.length) return true;
  return !pending.every((p) => rolePerms.includes(p));
}
```

Top of file: `import type { Permission } from "shared";` and `import { PERMISSIONS } from "shared";` (PERMISSIONS only used by the coverage block). Keep the coverage block's `if (typeof window === "undefined")` guard so it stays dev/server-only.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/web/test/roles-lib.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```
git add packages/web/app/(protected)/roles/lib.ts packages/web/test/roles-lib.test.ts
git commit -m "refactor(roles): extract permission metadata and pure helpers into lib"
```

---

### Task 2: `PermissionMatrix` component

**Files:**
- Create: `packages/web/app/(protected)/roles/permission-matrix.tsx`
- Test: `packages/web/test/permission-matrix.test.tsx`

**Interfaces:**
- Consumes: `PERMISSION_GROUPS`, `getGroupActiveCount`, `PermGroup`, `PermEntry` from `./lib`; `Checkbox` from `@/components/ui/checkbox`; `Permission` from `shared`.
- Produces:
```ts
export function PermissionMatrix(props: {
  effectivePerms: Permission[];
  canManage: boolean;
  onToggle: (perm: Permission) => void;
  onSelectGroup: (group: PermGroup, select: boolean) => void;
}): JSX.Element
```

**Behavior to preserve (from current page `renderGroup`/`renderCheckbox`, lines 502–629):** group header with status dot, label, description, `{active}/{total}` count, and an All/None button shown only when `canManage && total > 1`; a responsive grid of permission cards (each = Checkbox + label + description, active card highlighted); subgroups rendered below with their own label/description and grid. Each permission card is a `<label>` wrapping the `Checkbox` so clicking anywhere in the card toggles it.

- [ ] **Step 1: Write the failing test** — `packages/web/test/permission-matrix.test.tsx`

```tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { PermissionMatrix } from "@/app/(protected)/roles/permission-matrix";
import { getAllGroupPerms, PERMISSION_GROUPS } from "@/app/(protected)/roles/lib";
import type { Permission } from "shared";

const whitelist = PERMISSION_GROUPS.find((g) => g.id === "whitelist")!;

function setup(over: Partial<Parameters<typeof PermissionMatrix>[0]> = {}) {
  const onToggle = mock((_p: Permission) => {});
  const onSelectGroup = mock((_g: unknown, _s: boolean) => {});
  render(
    <PermissionMatrix
      effectivePerms={over.effectivePerms ?? []}
      canManage={over.canManage ?? true}
      onToggle={onToggle}
      onSelectGroup={onSelectGroup}
    />,
  );
  return { onToggle, onSelectGroup };
}

test("renders group labels and permission entry labels", () => {
  setup();
  expect(screen.getByText("Whitelist")).toBeDefined();
  expect(screen.getByText("Tickets")).toBeDefined();
  expect(screen.getByText("View Whitelist")).toBeDefined();
  expect(screen.getByText("RCON Console")).toBeDefined();
  // subgroup entry
  expect(screen.getByText("Whitelist Tier")).toBeDefined();
});

test("clicking a permission card calls onToggle with its perm", () => {
  const { onToggle } = setup();
  fireEvent.click(screen.getByText("Manage Whitelist"));
  expect(onToggle).toHaveBeenCalledWith("manage:whitelist");
});

test("group All button (not all selected) calls onSelectGroup with select=true", () => {
  const { onSelectGroup } = setup();
  const group = screen.getByText("Whitelist").closest('[data-group="whitelist"]')!;
  fireEvent.click(within(group as HTMLElement).getByText("All"));
  expect(onSelectGroup).toHaveBeenCalledTimes(1);
  expect((onSelectGroup.mock.calls[0][0] as { id: string }).id).toBe("whitelist");
  expect(onSelectGroup.mock.calls[0][1]).toBe(true);
});

test("group None button (all selected) calls onSelectGroup with select=false", () => {
  const { onSelectGroup } = setup({ effectivePerms: getAllGroupPerms(whitelist) as Permission[] });
  const group = screen.getByText("Whitelist").closest('[data-group="whitelist"]')!;
  fireEvent.click(within(group as HTMLElement).getByText("None"));
  expect(onSelectGroup.mock.calls[0][1]).toBe(false);
});

test("read-only (canManage=false): clicking a card does not toggle and no All/None button", () => {
  const { onToggle } = setup({ canManage: false });
  fireEvent.click(screen.getByText("Manage Whitelist"));
  expect(onToggle).not.toHaveBeenCalled();
  const group = screen.getByText("Whitelist").closest('[data-group="whitelist"]')!;
  expect(within(group as HTMLElement).queryByText("All")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/web/test/permission-matrix.test.tsx`
Expected: FAIL — `PermissionMatrix` not found.

- [ ] **Step 3: Write `permission-matrix.tsx`**

Create the component as a client component (`"use client"`). Map `PERMISSION_GROUPS`. Structure per group:

```tsx
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import {
  PERMISSION_GROUPS,
  getGroupActiveCount,
  type PermEntry,
  type PermGroup,
} from "./lib";
import type { Permission } from "shared";

function PermCard({
  entry,
  active,
  canManage,
  onToggle,
}: {
  entry: PermEntry;
  active: boolean;
  canManage: boolean;
  onToggle: (perm: Permission) => void;
}) {
  return (
    <label
      className={`flex items-start gap-2.5 rounded-sm border px-3 py-2.5 text-xs transition-colors ${
        active ? "border-accent/30 bg-accent/10" : "border-border bg-bg-tertiary"
      } ${canManage ? "cursor-pointer hover:border-accent/40" : "cursor-default"}`}
    >
      <Checkbox
        checked={active}
        onCheckedChange={() => onToggle(entry.perm)}
        disabled={!canManage}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className={`font-medium tracking-wide ${active ? "text-accent" : "text-text-secondary"}`}>
          {entry.label}
        </div>
        <div className="mt-0.5 text-[10px] leading-tight text-text-muted">{entry.description}</div>
      </div>
    </label>
  );
}

export function PermissionMatrix({
  effectivePerms,
  canManage,
  onToggle,
  onSelectGroup,
}: {
  effectivePerms: Permission[];
  canManage: boolean;
  onToggle: (perm: Permission) => void;
  onSelectGroup: (group: PermGroup, select: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {PERMISSION_GROUPS.map((group) => {
        const { active, total } = getGroupActiveCount(group, effectivePerms);
        const allSelected = active === total;
        return (
          <div
            key={group.id}
            data-group={group.id}
            className="rounded-sm border border-border/50 bg-bg-tertiary/30"
          >
            {/* Group header */}
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${active > 0 ? "bg-accent" : "bg-text-muted/30"}`} />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                  {group.label}
                </span>
                <span className="text-[10px] text-text-muted/60">{group.description}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] tabular-nums text-text-muted/60">
                  {active}/{total}
                </span>
                {canManage && total > 1 && (
                  <button
                    type="button"
                    onClick={() => onSelectGroup(group, !allSelected)}
                    className="text-[10px] font-medium text-text-muted transition-colors hover:text-accent"
                  >
                    {allSelected ? "None" : "All"}
                  </button>
                )}
              </div>
            </div>

            {/* Main entries */}
            <div className="grid gap-1.5 px-2 pb-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.entries.map((entry) => (
                <PermCard
                  key={entry.perm}
                  entry={entry}
                  active={effectivePerms.includes(entry.perm)}
                  canManage={canManage}
                  onToggle={onToggle}
                />
              ))}
            </div>

            {/* Sub-groups */}
            {group.subGroups?.map((sg, i) => (
              <div key={i} className="mx-2 mb-2 border-t border-border/40 pt-2">
                <div className="mb-1.5 flex items-center gap-2 px-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted/60">
                    {sg.label}
                  </span>
                  <span className="text-[10px] text-text-muted/40">{sg.description}</span>
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {sg.entries.map((entry) => (
                    <PermCard
                      key={entry.perm}
                      entry={entry}
                      active={effectivePerms.includes(entry.perm)}
                      canManage={canManage}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
```

Note: the `<label>`-wraps-`Checkbox` pattern forwards card clicks to the Checkbox; when `disabled`, `onCheckedChange` does not fire (satisfies the read-only test). Keep the group `All/None` as a compact plain button (micro-control) — the `<Button>` composite's forced uppercase is undesired here.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/web/test/permission-matrix.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/web/app/(protected)/roles/permission-matrix.tsx packages/web/test/permission-matrix.test.tsx
git commit -m "refactor(roles): add PermissionMatrix on Checkbox composite"
```

---

### Task 3: `RegisterRoleForm` component

**Files:**
- Create: `packages/web/app/(protected)/roles/register-role-form.tsx`
- Test: `packages/web/test/register-role-form.test.tsx`

**Interfaces:**
- Consumes: `Input` from `@/components/ui/input`; `Button` from `@/components/ui/button`.
- Produces:
```ts
export function RegisterRoleForm(props: {
  onRegister: (discordRoleId: string, name: string) => Promise<boolean>;
  adding: boolean;
  error: string | null;
}): JSX.Element
```

**Behavior (from current page lines 663–695):** two text inputs (placeholders `"Discord Role ID"` and `"Display Name"`, both `required`), a submit button (`"Register Role"`, `"Registering..."` while `adding`, `disabled` while `adding`). The form manages its own input state. On submit: `preventDefault`; ignore if either trimmed value is empty; else `await onRegister(id.trim(), name.trim())` and clear both inputs **only if it returns `true`** (mirrors the current page, which clears inputs on API success only — the `Promise<boolean>` contract keeps API state in the view, not this component). Show `error` below when present. Card chrome: `className="facet-border mb-8 flex flex-wrap gap-3 rounded-sm bg-bg-card p-4"`.

- [ ] **Step 1: Write the failing test** — `packages/web/test/register-role-form.test.tsx`

```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/web/test/register-role-form.test.tsx`
Expected: FAIL — `RegisterRoleForm` not found.

- [ ] **Step 3: Write `register-role-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RegisterRoleForm({
  onRegister,
  adding,
  error,
}: {
  onRegister: (discordRoleId: string, name: string) => Promise<boolean>;
  adding: boolean;
  error: string | null;
}) {
  const [roleId, setRoleId] = useState("");
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = roleId.trim();
    const nm = name.trim();
    if (!id || !nm) return;
    const ok = await onRegister(id, nm);
    if (ok) {
      setRoleId("");
      setName("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="facet-border mb-8 flex flex-wrap gap-3 rounded-sm bg-bg-card p-4">
      <Input
        value={roleId}
        onChange={(e) => setRoleId(e.target.value)}
        placeholder="Discord Role ID"
        className="h-auto flex-1 rounded-sm border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted"
        required
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display Name"
        className="h-auto w-48 rounded-sm border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted"
        required
      />
      <Button type="submit" disabled={adding} variant="gold" size="lg" className="tracking-wide">
        {adding ? "Registering..." : "Register Role"}
      </Button>
      {error && <div className="w-full text-sm text-danger">{error}</div>}
    </form>
  );
}
```

(The `className` on `Input` restores the current field look — `Input`'s base `h-8` is overridden with `h-auto` + padding so the fields keep their current height.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/web/test/register-role-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/web/app/(protected)/roles/register-role-form.tsx packages/web/test/register-role-form.test.tsx
git commit -m "refactor(roles): add RegisterRoleForm on Input/Button composites"
```

---

### Task 4: `RoleCard` component

**Files:**
- Create: `packages/web/app/(protected)/roles/role-card.tsx`
- Test: `packages/web/test/role-card.test.tsx`

**Interfaces:**
- Consumes: `PermissionMatrix` from `./permission-matrix`; `PermGroup` from `./lib`; `Switch` from `@/components/ui/switch`; `Button` from `@/components/ui/button`; `AlertDialog`, `AlertDialogContent`, `AlertDialogHeader`, `AlertDialogFooter`, `AlertDialogTitle`, `AlertDialogDescription`, `AlertDialogAction`, `AlertDialogCancel` from `@/components/ui/alert-dialog`; `DiscordRole`, `Permission` from `shared`.
- Produces:
```ts
export function RoleCard(props: {
  role: DiscordRole;
  effectivePerms: Permission[];
  changed: boolean;
  isExpanded: boolean;
  canManage: boolean;
  saving: boolean;
  saveError: string | null;
  togglingWl: boolean;
  togglingMember: boolean;
  deleteOpen: boolean;
  onToggleExpand: () => void;
  onTogglePerm: (perm: Permission) => void;
  onSelectGroup: (group: PermGroup, select: boolean) => void;
  onSave: () => void;
  onDiscard: () => void;
  onToggleWl: () => void;
  onToggleMember: () => void;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
}): JSX.Element
```

**Behavior to preserve (current page lines 711–909):**
- Card chrome `facet-border rounded-sm bg-bg-card`.
- Header (clickable → `onToggleExpand`): chevron rotates when expanded; role name (`font-display text-lg`); "unsaved" warning badge when `changed`; meta line `ID: {discordRoleId}` (mono), `{n} permission(s)`/`No permissions`, and inline `Grants Whitelist` (success) / `Member Role` (accent) markers when set.
- When `canManage`, header right side shows the **Unregister** trigger button (opens the AlertDialog). Clicking it must NOT toggle expand — stop propagation.
- When `isExpanded`:
  - If `canManage`, a toggles+save bar (border-top): two `Switch`es —
    - Whitelist: `aria-label="Grants whitelist"`, `checked={role.grantsWhitelist}`, `onCheckedChange={onToggleWl}`, `disabled={togglingWl}`, adjacent text `Grants Whitelist`/`No Whitelist` colored `text-success`/`text-muted`.
    - Member: `aria-label="Member role"`, `checked={role.isMemberRole}`, `onCheckedChange={onToggleMember}`, `disabled={togglingMember}`, adjacent text `Member Role`/`Not Member` colored `text-accent`/`text-muted`.
    - When `changed`: Save (`Button size="sm"`, text `Save Permissions`/`Saving...`, `disabled={saving}`, `onClick={onSave}`) + Discard (`Button variant="ghost" size="sm"`, `onClick={onDiscard}`).
  - `saveError` line when present.
  - `<PermissionMatrix effectivePerms canManage onToggle={onTogglePerm} onSelectGroup={onSelectGroup} />`, wrapped in `px-5 pb-5`. When `!canManage`, wrap with `pointer-events-none opacity-70` (matrix already disables inputs; this mirrors the current read-only affordance).
- Delete AlertDialog (controlled): `open={deleteOpen}`, `onOpenChange={onDeleteOpenChange}`, `AlertDialogContent size="sm"`, title `Unregister {role.name}?`, description `This removes the role registration and its permission assignments.`, footer: Cancel (`AlertDialogCancel`, text `Cancel`) + confirm (`AlertDialogAction` `variant="destructive"`, text `Unregister Role`, `onClick={onConfirmDelete}`).

- [ ] **Step 1: Write the failing test** — `packages/web/test/role-card.test.tsx`

```tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoleCard } from "@/app/(protected)/roles/role-card";
import type { DiscordRole, Permission } from "shared";

const role: DiscordRole = {
  id: "r1",
  discordRoleId: "999888777",
  name: "Admin",
  permissions: ["view:members"],
  grantsWhitelist: false,
  isMemberRole: false,
};

function baseProps(over: Record<string, unknown> = {}) {
  return {
    role,
    effectivePerms: ["view:members"] as Permission[],
    changed: false,
    isExpanded: false,
    canManage: true,
    saving: false,
    saveError: null,
    togglingWl: false,
    togglingMember: false,
    deleteOpen: false,
    onToggleExpand: mock(() => {}),
    onTogglePerm: mock((_p: Permission) => {}),
    onSelectGroup: mock(() => {}),
    onSave: mock(() => {}),
    onDiscard: mock(() => {}),
    onToggleWl: mock(() => {}),
    onToggleMember: mock(() => {}),
    onDeleteOpenChange: mock((_o: boolean) => {}),
    onConfirmDelete: mock(() => {}),
    ...over,
  };
}

test("header shows name, discord id, permission count; collapsed hides the matrix", () => {
  render(<RoleCard {...(baseProps() as any)} />);
  expect(screen.getByText("Admin")).toBeDefined();
  expect(screen.getByText("999888777")).toBeDefined();
  expect(screen.getByText("1 permission")).toBeDefined();
  // matrix hidden while collapsed
  expect(screen.queryByText("View Whitelist")).toBeNull();
});

test("clicking header calls onToggleExpand", () => {
  const props = baseProps();
  render(<RoleCard {...(props as any)} />);
  fireEvent.click(screen.getByText("Admin"));
  expect(props.onToggleExpand).toHaveBeenCalled();
});

test("unsaved badge shows when changed", () => {
  render(<RoleCard {...(baseProps({ changed: true }) as any)} />);
  expect(screen.getByText("unsaved")).toBeDefined();
});

test("expanded shows the matrix and the two switches", () => {
  render(<RoleCard {...(baseProps({ isExpanded: true }) as any)} />);
  expect(screen.getByText("View Whitelist")).toBeDefined();
  expect(screen.getByRole("switch", { name: "Grants whitelist" })).toBeDefined();
  expect(screen.getByRole("switch", { name: "Member role" })).toBeDefined();
});

test("clicking the whitelist switch calls onToggleWl", () => {
  const props = baseProps({ isExpanded: true });
  render(<RoleCard {...(props as any)} />);
  fireEvent.click(screen.getByRole("switch", { name: "Grants whitelist" }));
  expect(props.onToggleWl).toHaveBeenCalled();
});

test("Save/Discard shown when changed; Save calls onSave", () => {
  const props = baseProps({ isExpanded: true, changed: true });
  render(<RoleCard {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Save Permissions" }));
  expect(props.onSave).toHaveBeenCalled();
});

test("Unregister trigger calls onDeleteOpenChange(true) without expanding", () => {
  const props = baseProps();
  render(<RoleCard {...(props as any)} />);
  fireEvent.click(screen.getByRole("button", { name: "Unregister" }));
  expect(props.onDeleteOpenChange).toHaveBeenCalledWith(true);
  expect(props.onToggleExpand).not.toHaveBeenCalled();
});

test("delete dialog open shows warning; confirm calls onConfirmDelete", () => {
  const props = baseProps({ deleteOpen: true });
  render(<RoleCard {...(props as any)} />);
  expect(
    screen.getByText("This removes the role registration and its permission assignments."),
  ).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Unregister Role" }));
  expect(props.onConfirmDelete).toHaveBeenCalled();
});

test("read-only (canManage=false): no Unregister trigger, no switches", () => {
  render(<RoleCard {...(baseProps({ canManage: false, isExpanded: true }) as any)} />);
  expect(screen.queryByRole("button", { name: "Unregister" })).toBeNull();
  expect(screen.queryByRole("switch", { name: "Grants whitelist" })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/web/test/role-card.test.tsx`
Expected: FAIL — `RoleCard` not found.

- [ ] **Step 3: Write `role-card.tsx`**

Implement per the behavior spec above. Carry the header/meta JSX and class strings from the current page (lines 711–795 for the header/badges; 800–906 for the expanded region), replacing:
- the two hand-rolled toggle `<button><span>…` blocks (current 804–867) with `<Switch>` + adjacent label spans (with the `aria-label`s specified);
- the inline delete Confirm/Cancel (current 770–792) with an **Unregister** `<Button variant="ghost" size="sm">` trigger that calls `onDeleteOpenChange(true)` (wrap the header-right cluster in `onClick={(e) => e.stopPropagation()}` exactly as current line 769 does), plus the controlled `<AlertDialog>` block;
- the permission-groups `.map(renderGroup)` (current 903–905) with `<PermissionMatrix .../>`.

Switch usage example:

```tsx
<label className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
  <Switch
    aria-label="Grants whitelist"
    checked={role.grantsWhitelist}
    onCheckedChange={onToggleWl}
    disabled={togglingWl}
  />
  <span className={role.grantsWhitelist ? "text-success" : "text-text-muted"}>
    {role.grantsWhitelist ? "Grants Whitelist" : "No Whitelist"}
  </span>
</label>
```

AlertDialog block:

```tsx
<AlertDialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
  <AlertDialogContent size="sm">
    <AlertDialogHeader>
      <AlertDialogTitle>Unregister {role.name}?</AlertDialogTitle>
      <AlertDialogDescription>
        This removes the role registration and its permission assignments.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction variant="destructive" onClick={onConfirmDelete}>
        Unregister Role
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

Use `Button` for the Unregister trigger, Save, and Discard. Keep the chevron svg and meta line as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/web/test/role-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add packages/web/app/(protected)/roles/role-card.tsx packages/web/test/role-card.test.tsx
git commit -m "refactor(roles): add RoleCard with Switch toggles and AlertDialog delete"
```

---

### Task 5: `RolesView` (DI) + `page.tsx` shell

**Files:**
- Create: `packages/web/app/(protected)/roles/roles-view.tsx`
- Rewrite: `packages/web/app/(protected)/roles/page.tsx`
- Test: `packages/web/test/roles-view.test.tsx`

**Interfaces:**
- Consumes: everything above; `getRoles, createRole, updateRolePermissions, updateRoleWhitelistGrant, updateRoleMemberRole, deleteRole` from `@/lib/api-client`; `useAutoRefresh` from `@/hooks/use-auto-refresh`; `Skeleton, SkeletonList` from `@/components/skeleton`; `DiscordRole, Permission` from `shared`; `usePermissions` (in the shell).
- Produces:
```ts
export type RolesApi = {
  getRoles: typeof getRoles;
  createRole: typeof createRole;
  updateRolePermissions: typeof updateRolePermissions;
  updateRoleWhitelistGrant: typeof updateRoleWhitelistGrant;
  updateRoleMemberRole: typeof updateRoleMemberRole;
  deleteRole: typeof deleteRole;
};
export const defaultApi: RolesApi;
export function RolesView(props: { token: string; permissions: string[]; api?: RolesApi }): JSX.Element;
```

**Behavior:** port all state + handlers from the current page component (lines 291–496 and the main render 635–915), swapping `apiToken`→`token`, `hasPermission("manage:roles")`→derived `canManage`, and the inline sub-blocks for the new components. Specifically:
- State: `roles`, `loading`, `error`, `pendingPerms` (`Record<string, Permission[]>`), `savingId`, `saveError`, `deletingId`, `expandedId`, `togglingWl`, `togglingMember`, register `adding`/`addError`.
- `canManage = permissions.includes("developer") || permissions.includes("manage:roles")`.
- `init` effect + `refreshRoles` callback (verbatim logic; use `api.getRoles`).
- `hasPending = Object.keys(pendingPerms).length > 0`; `useAutoRefresh(refreshRoles, 20_000, !!token && !hasPending && !deletingId)`.
- `handleRegister(id, name): Promise<boolean>` — calls `api.createRole(token, { discordRoleId: id, name })`; on success append role, clear `addError`, return `true`; on failure set `addError`, return `false`. Wrap with `adding` true/false. (Note: the form already trimmed.)
- `togglePermission(roleId, perm)` → uses `togglePerm(current, perm)` from lib on `pendingPerms[roleId] ?? role.permissions`.
- `selectGroupPerms(roleId, group, select)` → uses `setGroupPerms(...)` from lib.
- `getEffectivePerms(role)` = `pendingPerms[role.id] ?? role.permissions`.
- `changed` per role = `hasPendingChanges(pendingPerms[role.id], role.permissions)` from lib.
- `savePermissions(roleId)`, `discardChanges(roleId)`, `toggleWhitelistGrant(role)`, `toggleMemberRole(role)`, `handleDelete(id)` — verbatim logic against `api.*`; `handleDelete` also clears `deletingId`.
- Loading skeleton (current 635–645), error (647–649), header + `{roles.length} registered` badge (652–660), `RegisterRoleForm` when `canManage`, empty state (698–702), else the list of `RoleCard`.
- Wire each `RoleCard`: `deleteOpen={deletingId === role.id}`, `onDeleteOpenChange={(o) => setDeletingId(o ? role.id : null)}`, `onConfirmDelete={() => handleDelete(role.id)}`, `onToggleExpand={() => setExpandedId(isExpanded ? null : role.id)}`, and the toggle/save/discard handlers.

**Shell** (`page.tsx`, default-only):
```tsx
"use client";
import { usePermissions } from "@/lib/permission-context";
import { RolesView } from "./roles-view";

export default function RolesPage() {
  const { apiToken, permissions } = usePermissions();
  if (!apiToken) return null;
  return <RolesView token={apiToken} permissions={permissions as string[]} />;
}
```

- [ ] **Step 1: Write the failing test** — `packages/web/test/roles-view.test.tsx`

```tsx
import { test, expect, mock } from "bun:test";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RolesView, type RolesApi } from "@/app/(protected)/roles/roles-view";
import type { DiscordRole } from "shared";

const admin: DiscordRole = {
  id: "r1",
  discordRoleId: "999",
  name: "Admin",
  permissions: ["view:members"],
  grantsWhitelist: false,
  isMemberRole: false,
};

function makeApi(over: Partial<RolesApi> = {}): RolesApi {
  return {
    getRoles: mock(async () => ({ success: true as const, data: [admin] })),
    createRole: mock(async () => ({
      success: true as const,
      data: { id: "r2", discordRoleId: "111", name: "Mod", permissions: [], grantsWhitelist: false, isMemberRole: false },
    })),
    updateRolePermissions: mock(async () => ({ success: true as const, data: { ...admin, permissions: ["view:members", "manage:members"] } })),
    updateRoleWhitelistGrant: mock(async () => ({ success: true as const, data: admin })),
    updateRoleMemberRole: mock(async () => ({ success: true as const, data: admin })),
    deleteRole: mock(async () => ({ success: true as const })),
    ...over,
  };
}

test("renders roles from the api", async () => {
  render(<RolesView token="t" permissions={["manage:roles"]} api={makeApi()} />);
  expect(await screen.findByText("Admin")).toBeDefined();
});

test("developer-only permission still shows the register form (superpower)", async () => {
  render(<RolesView token="t" permissions={["developer"]} api={makeApi()} />);
  await screen.findByText("Admin");
  expect(screen.getByPlaceholderText("Discord Role ID")).toBeDefined();
});

test("no manage perm and not developer: read-only, no register form", async () => {
  render(<RolesView token="t" permissions={["view:members"]} api={makeApi()} />);
  await screen.findByText("Admin");
  expect(screen.queryByPlaceholderText("Discord Role ID")).toBeNull();
});

test("registering a role calls createRole with entered values", async () => {
  const api = makeApi();
  render(<RolesView token="t" permissions={["manage:roles"]} api={api} />);
  await screen.findByText("Admin");
  fireEvent.change(screen.getByPlaceholderText("Discord Role ID"), { target: { value: "111" } });
  fireEvent.change(screen.getByPlaceholderText("Display Name"), { target: { value: "Mod" } });
  fireEvent.click(screen.getByRole("button", { name: "Register Role" }));
  await waitFor(() =>
    expect(api.createRole).toHaveBeenCalledWith("t", { discordRoleId: "111", name: "Mod" }),
  );
  expect(await screen.findByText("Mod")).toBeDefined();
});

test("expanding a role then toggling a perm and saving calls updateRolePermissions", async () => {
  const api = makeApi();
  render(<RolesView token="t" permissions={["manage:roles"]} api={api} />);
  await screen.findByText("Admin");
  fireEvent.click(screen.getByText("Admin")); // expand
  fireEvent.click(await screen.findByText("Manage Members")); // toggle a perm on
  fireEvent.click(screen.getByRole("button", { name: "Save Permissions" }));
  await waitFor(() => expect(api.updateRolePermissions).toHaveBeenCalledTimes(1));
  const call = (api.updateRolePermissions as ReturnType<typeof mock>).mock.calls[0];
  expect(call[0]).toBe("t");
  expect(call[1]).toBe("r1");
  expect(call[2]).toContain("view:members");
  expect(call[2]).toContain("manage:members");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/web/test/roles-view.test.tsx`
Expected: FAIL — `RolesView` not found.

- [ ] **Step 3: Write `roles-view.tsx` and rewrite `page.tsx`**

Port the logic as specified. `defaultApi` bundles the six api-client fns. Signature `RolesView({ token, permissions, api = defaultApi })`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/web/test/roles-view.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full gate + build**

Run: `bun test packages/web` (whole web suite — expect 0 failures)
Run: `cd packages/web && bunx tsc --noEmit` (expect 0 errors)
Run grep-gate (page.tsx must be default-only): `grep -nE "export (const|function|type|interface|class|default function [A-Za-z]+View)" "packages/web/app/(protected)/roles/page.tsx"` — only the `export default function RolesPage` line may appear; NO `export const`/`export function`/named `View` export.
Run: `cd packages/web && bunx next build` — must reach "Generating static pages (N/N)" with no `is not a valid Page export field` error. (A local Windows EPERM on the post-gen standalone symlink step is expected and non-blocking; page-gen success is the pass signal.)

- [ ] **Step 6: Commit**

```
git add "packages/web/app/(protected)/roles/roles-view.tsx" "packages/web/app/(protected)/roles/page.tsx" packages/web/test/roles-view.test.tsx
git commit -m "refactor(roles): DI RolesView plus default-only page shell"
```

---

## Self-Review (controller, after plan authoring)

- **Spec coverage:** roles = "reskin + structural cleanup" (spec §517, table §693). Covered: composites adopted (Checkbox/Switch/AlertDialog/Button/Input), page-shell/DI-view/lib split, behavior + copy preserved, developer superpower, default-only page.tsx.
- **Type consistency:** `togglePerm`/`setGroupPerms`/`hasPendingChanges` signatures match their call sites in Task 5; `RolesApi` fns match `api-client` exports; `RoleCard` prop names match the view's wiring.
- **Placeholder scan:** none — verbatim carries cite exact current-page line ranges; all new logic and all tests are complete.

## Version bump

After Task 5 merges to the integration branch, bump `package.json` version (minor: `2.15.0` → `2.16.0`) in the same or a follow-up commit (`chore: bump webpage to v2.16.0`), per the semver-on-push rule. (If `feat/team-balancer` merges first and re-bumps, reconcile the number then.)
