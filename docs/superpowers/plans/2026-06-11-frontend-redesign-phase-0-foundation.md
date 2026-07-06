# Gilded Regiment Phase 0: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design-system foundation (tokens, self-hosted fonts, restyled shadcn/ui, composite components, both app shells, theme infrastructure) without migrating any existing page.

**Architecture:** All work happens in `packages/web`. Design tokens live as CSS custom properties in `app/globals.css` consumed via Tailwind v4 `@theme`; shadcn/ui primitives are installed into `components/ui/` and themed through those variables; composite components (`DataTable`, `FilterBar`, `SearchInput`, `PageHeader`, `StatCard`, `StatusBadge`, `EmptyState`) live in `components/` and are the only table/search/filter patterns future pages may use. New shells (`AppSidebar`, `PublicHeader`) are built but NOT wired into layouts (that happens in Phases 1–2). A dev-only `/design` route renders everything in both themes for verification.

**Tech Stack:** Next.js 15 (App Router, Turbopack), React 19, Tailwind v4, shadcn/ui (Radix), TanStack Table v8, lucide-react, next/font, Bun (runtime + test runner), happy-dom + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-06-11-frontend-redesign-design.md`

**Conventions (from CLAUDE.md / project):** Conventional one-line commits, no AI attribution, no emojis. All commands run from `packages/web` unless noted. The repo's working branch is `production`.

---

### Task 1: Test infrastructure (bun test + happy-dom + Testing Library)

The repo has zero test infra. Set up Bun's test runner with happy-dom so component behavior (debounce, sorting, selection, theme) can be TDD'd.

**Files:**
- Create: `packages/web/bunfig.toml`
- Create: `packages/web/test/setup.ts`
- Create: `packages/web/test/smoke.test.tsx`
- Modify: `packages/web/package.json` (add `test` script)

- [ ] **Step 1: Install dev dependencies**

```bash
cd packages/web
bun add -d @happy-dom/global-registrator @testing-library/react
```

- [ ] **Step 2: Create test preload and config**

`packages/web/bunfig.toml`:

```toml
[test]
preload = ["./test/setup.ts"]
```

`packages/web/test/setup.ts`:

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
```

- [ ] **Step 3: Write the smoke test**

`packages/web/test/smoke.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";

test("testing library renders into happy-dom", () => {
  render(<div data-testid="probe">gilded</div>);
  expect(screen.getByTestId("probe").textContent).toBe("gilded");
});
```

- [ ] **Step 4: Add test script and run**

In `packages/web/package.json` scripts add: `"test": "bun test"`.

Run: `cd packages/web && bun test`
Expected: `1 pass, 0 fail`

- [ ] **Step 5: Commit**

```bash
git add packages/web/bunfig.toml packages/web/test packages/web/package.json bun.lock
git commit -m "test: add bun test runner with happy-dom and testing-library"
```

---

### Task 2: Self-hosted fonts via next/font

Replace the Google Fonts CSS import with `next/font/google` (downloads at build, serves from our origin) and add JetBrains Mono as the data voice.

**Files:**
- Create: `packages/web/lib/fonts.ts`
- Modify: `packages/web/app/layout.tsx`
- Modify: `packages/web/app/globals.css:1` (remove the `@import url(...)` line) and `:27-28` (font tokens)

- [ ] **Step 1: Create the font module**

`packages/web/lib/fonts.ts`:

```ts
import { Cinzel, Outfit, JetBrains_Mono } from "next/font/google";

export const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700", "900"],
  variable: "--font-cinzel",
  display: "swap",
});

export const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-outfit",
  display: "swap",
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const fontVariables = `${cinzel.variable} ${outfit.variable} ${jetbrainsMono.variable}`;
```

- [ ] **Step 2: Wire variables onto `<html>`**

In `packages/web/app/layout.tsx`, add the import and extend the `<html>` className:

```tsx
import { fontVariables } from "@/lib/fonts";
```

```tsx
<html lang="en" className={`dark ${fontVariables}`} suppressHydrationWarning>
```

- [ ] **Step 3: Switch globals.css to the variables**

Delete line 1 of `packages/web/app/globals.css`:

```css
@import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Outfit:wght@300;400;500;600;700&display=swap");
```

Inside the `@theme` block, replace the two font tokens and add the mono token:

```css
  --font-display: var(--font-cinzel), serif;
  --font-body: var(--font-outfit), system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
```

- [ ] **Step 4: Verify build and rendering**

Run: `cd packages/web && bun run build`
Expected: build succeeds; no `fonts.googleapis.com` reference remains (`grep -r "fonts.googleapis" app/ lib/` returns nothing).

Run: `bun run dev`, open http://localhost:3000 — headings still render Cinzel, body Outfit (inspect computed font-family).

- [ ] **Step 5: Commit**

```bash
git add packages/web/lib/fonts.ts packages/web/app/layout.tsx packages/web/app/globals.css
git commit -m "feat: self-host Cinzel, Outfit and JetBrains Mono via next/font"
```

---

### Task 3: Design tokens — parchment light theme + shadcn variable bridge

Formalize the token layer: parchment light values (replacing the basic gray inversion), shadcn/ui-compatible variables mapped to our palette for both themes, and radius tokens. All existing utility classes and keyframes in `globals.css` stay untouched (old pages depend on them).

**Files:**
- Modify: `packages/web/app/globals.css`

- [ ] **Step 1: Replace the `html.light` block (lines 36–48) with parchment values**

```css
html.light {
  color-scheme: light;
  --color-bg-primary: #f3efe5;
  --color-bg-secondary: #ece7d9;
  --color-bg-tertiary: #e2dbc8;
  --color-bg-card: #faf7ef;
  --color-bg-card-hover: #f5f1e6;
  --color-accent: #8a7430;
  --color-accent-muted: #7d6a2c;
  --color-accent-dim: #a3925a;
  --color-accent-bright: #6e5c24;
  --color-text-primary: #1c1a14;
  --color-text-secondary: #5c574a;
  --color-text-muted: #a39d8a;
  --color-border: #e2dbc8;
  --color-border-accent: #8a743055;
  --color-danger: #b91c1c;
  --color-success: #15803d;
  --color-warning: #b45309;
}
```

Note: in light mode, "accent-bright" must read as *stronger* contrast on light ground, hence darker bronze. Status colors also darken for AA contrast on ivory.

- [ ] **Step 2: Add shadcn variable bridge after the `html.light` block**

```css
/* shadcn/ui variable bridge - both themes resolve through our tokens */
:root {
  --radius: 0.125rem;
  --background: var(--color-bg-primary);
  --foreground: var(--color-text-primary);
  --card: var(--color-bg-card);
  --card-foreground: var(--color-text-primary);
  --popover: var(--color-bg-secondary);
  --popover-foreground: var(--color-text-primary);
  --primary: var(--color-accent);
  --primary-foreground: #08080a;
  --secondary: var(--color-bg-tertiary);
  --secondary-foreground: var(--color-text-primary);
  --muted: var(--color-bg-tertiary);
  --muted-foreground: var(--color-text-secondary);
  --accent: var(--color-bg-card-hover);
  --accent-foreground: var(--color-text-primary);
  --destructive: var(--color-danger);
  --destructive-foreground: #eeeee8;
  --border: var(--color-border);
  --input: var(--color-border);
  --ring: var(--color-accent);
  --sidebar: var(--color-bg-secondary);
  --sidebar-foreground: var(--color-text-primary);
  --sidebar-primary: var(--color-accent);
  --sidebar-primary-foreground: #08080a;
  --sidebar-accent: var(--color-bg-card-hover);
  --sidebar-accent-foreground: var(--color-text-primary);
  --sidebar-border: var(--color-border);
  --sidebar-ring: var(--color-accent);
}

html.light {
  --primary-foreground: #faf7ef;
  --destructive-foreground: #faf7ef;
  --sidebar-primary-foreground: #faf7ef;
}
```

- [ ] **Step 3: Expose the bridge to Tailwind v4 utilities**

Add after the existing `@theme` block:

```css
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent-ui: var(--accent);
  --color-accent-ui-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --radius-sm: calc(var(--radius) - 1px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
  --radius-xl: calc(var(--radius) + 6px);
}
```

IMPORTANT: `--color-border` already exists in the original `@theme` block (it powers existing `border-border`-style usage via `--color-border: #222228`). Do not redefine it in `@theme inline`. Also note shadcn's `accent` is intentionally renamed to `accent-ui` here because `--color-accent` (gold) already exists; shadcn component files installed in Task 4 must have `bg-accent`/`text-accent-foreground` rewritten to `bg-accent-ui`/`text-accent-ui-foreground` (Task 5 covers this).

- [ ] **Step 4: Verify both themes on existing pages**

Run: `bun run dev`. Check http://localhost:3000 (dark, unchanged) and toggle light via existing settings or DevTools (`document.documentElement.classList.replace('dark','light')`) — light mode now shows parchment ivory, bronze accents, readable text. No layout breakage on `/`, `/server`, `/matches`.

- [ ] **Step 5: Commit**

```bash
git add packages/web/app/globals.css
git commit -m "feat: add parchment light theme tokens and shadcn variable bridge"
```

---

### Task 4: shadcn/ui installation

**Files:**
- Create: `packages/web/components.json`
- Create: `packages/web/lib/utils.ts`
- Create: `packages/web/components/ui/*` (generated)
- Modify: `packages/web/package.json` (deps)

- [ ] **Step 1: Install base dependencies**

```bash
cd packages/web
bun add class-variance-authority clsx tailwind-merge lucide-react @tanstack/react-table sonner
bun add -d tw-animate-css
```

- [ ] **Step 2: Create `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 3: Create `components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "app/globals.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 4: Add `tw-animate-css` import**

In `packages/web/app/globals.css`, after `@import "tailwindcss";` add:

```css
@import "tw-animate-css";
```

- [ ] **Step 5: Install the base component set**

```bash
bunx shadcn@latest add button card dialog alert-dialog dropdown-menu tabs table input select checkbox badge tooltip command sidebar sheet skeleton sonner popover calendar separator label
```

Expected: files appear under `components/ui/` (button.tsx, card.tsx, ..., sidebar.tsx) plus `hooks/use-mobile.ts`. If the CLI asks to overwrite `globals.css` theme variables, answer NO (our bridge from Task 3 is canonical). If the CLI errors on css var detection, re-check Task 3 Step 2 ran.

- [ ] **Step 6: Verify compile**

Run: `bunx tsc --noEmit`
Expected: no errors (swagger-ui-react pre-existing warnings acceptable if present before this task — compare with `git stash; bunx tsc --noEmit; git stash pop` if unsure).

Run: `bun test` — still passing.

- [ ] **Step 7: Commit**

```bash
git add packages/web/components.json packages/web/lib/utils.ts packages/web/components/ui packages/web/hooks packages/web/app/globals.css packages/web/package.json bun.lock
git commit -m "feat: install shadcn/ui base component set"
```

---

### Task 5: Restyle shadcn primitives to Gilded Regiment

Theme is mostly carried by the Task 3 variables; this task applies the structural signature: sharp radii (already via `--radius`), uppercase tracked button/label text, gold focus rings, flat panels, and the `accent` -> `accent-ui` rename.

**Files:**
- Modify: `packages/web/components/ui/button.tsx`
- Modify: `packages/web/components/ui/badge.tsx`
- Modify: all files in `packages/web/components/ui/` containing `accent` classes
- Test: `packages/web/test/button.test.tsx`

- [ ] **Step 1: Global accent rename in ui components**

In every file under `components/ui/`, replace Tailwind classes that reference shadcn's accent with the renamed token (PowerShell from `packages/web`):

```powershell
Get-ChildItem components/ui -Filter *.tsx | ForEach-Object {
  (Get-Content $_.FullName -Raw) `
    -replace 'accent-foreground', 'accent-ui-foreground' `
    -replace '(?<![\w-])(hover:|focus:|data-\[highlighted\]:|data-\[state=open\]:|data-\[selected=true\]:|aria-selected:)?bg-accent(?![\w-])', '$1bg-accent-ui' |
  Set-Content $_.FullName -NoNewline
}
```

Then verify: `grep -rn "bg-accent\b" components/ui/` returns only `bg-accent-ui` matches and `grep -rn "accent-foreground" components/ui/ | grep -v "accent-ui-foreground"` returns nothing.

- [ ] **Step 2: Write the failing button test**

`packages/web/test/button.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

test("default button carries the Gilded Regiment signature classes", () => {
  render(<Button>Connect</Button>);
  const btn = screen.getByRole("button", { name: "Connect" });
  expect(btn.className).toContain("uppercase");
  expect(btn.className).toContain("tracking-[0.14em]");
});

test("gold variant renders solid accent", () => {
  render(<Button variant="gold">Add Entry</Button>);
  const btn = screen.getByRole("button", { name: "Add Entry" });
  expect(btn.className).toContain("bg-primary");
});
```

Run: `bun test test/button.test.tsx`
Expected: FAIL (`uppercase` not present; variant `gold` not defined).

- [ ] **Step 3: Restyle button.tsx**

In `components/ui/button.tsx`, edit the `buttonVariants` cva. Replace the base string's `text-sm font-medium` portion so the base contains the signature:

```ts
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs font-medium uppercase tracking-[0.14em] transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
```

In `variants.variant`, keep the generated entries and add:

```ts
gold: "bg-primary text-primary-foreground hover:bg-accent-bright shadow-none",
outlineGold: "border border-border-accent bg-transparent text-accent hover:bg-primary/10",
```

(`text-accent`/`border-border-accent`/`bg-accent-bright` resolve through the original `@theme` gold tokens.)

- [ ] **Step 4: Run the test**

Run: `bun test test/button.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Restyle badge.tsx**

In `components/ui/badge.tsx` base cva string: add `uppercase tracking-[0.1em]` and change any `rounded-full` to `rounded-sm`.

- [ ] **Step 6: Typecheck and commit**

Run: `bunx tsc --noEmit` — clean.

```bash
git add packages/web/components/ui packages/web/test/button.test.tsx
git commit -m "feat: restyle shadcn primitives to gilded regiment signature"
```

---

### Task 6: Theme infrastructure (useTheme hook + ThemeToggle + Sonner wiring)

Centralize the existing `rb-theme` localStorage mechanism into a reusable hook and toggle component. Do not touch the settings page (Phase 3 migrates it onto this hook).

**Files:**
- Create: `packages/web/lib/use-theme.ts`
- Create: `packages/web/components/theme-toggle.tsx`
- Modify: `packages/web/components/ui/sonner.tsx`
- Test: `packages/web/test/use-theme.test.tsx`

- [ ] **Step 1: Write the failing hook test**

`packages/web/test/use-theme.test.tsx`:

```tsx
import { test, expect, beforeEach } from "bun:test";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "@/lib/use-theme";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.className = "dark";
});

test("defaults to dark", () => {
  const { result } = renderHook(() => useTheme());
  expect(result.current.theme).toBe("dark");
  expect(result.current.resolvedTheme).toBe("dark");
});

test("setTheme('light') swaps the html class and persists", () => {
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setTheme("light"));
  expect(document.documentElement.classList.contains("light")).toBe(true);
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(localStorage.getItem("rb-theme")).toBe("light");
});

test("setTheme('system') resolves via matchMedia", () => {
  const { result } = renderHook(() => useTheme());
  act(() => result.current.setTheme("system"));
  expect(localStorage.getItem("rb-theme")).toBe("system");
  expect(["dark", "light"]).toContain(result.current.resolvedTheme);
});
```

Run: `bun test test/use-theme.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 2: Implement the hook**

`packages/web/lib/use-theme.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "rb-theme";

function systemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function apply(theme: Theme) {
  const resolved = theme === "system" ? systemTheme() : theme;
  const html = document.documentElement;
  html.classList.remove("dark", "light");
  html.classList.add(resolved);
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "dark";
    setThemeState(stored);
    setResolvedTheme(apply(stored));
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    setResolvedTheme(apply(next));
  }, []);

  return { theme, resolvedTheme, setTheme };
}
```

- [ ] **Step 3: Run the test**

Run: `bun test test/use-theme.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 4: Create ThemeToggle**

`packages/web/components/theme-toggle.tsx`:

```tsx
"use client";

import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/lib/use-theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS: { value: Theme; label: string; icon: typeof Moon }[] = [
  { value: "dark", label: "Dark", icon: Moon },
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const Icon = resolvedTheme === "light" ? Sun : Moon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme">
          <Icon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(({ value, label, icon: OptIcon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            data-active={theme === value}
            className="data-[active=true]:text-accent"
          >
            <OptIcon className="size-4" /> {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 5: Wire Sonner to our theme**

shadcn's generated `components/ui/sonner.tsx` imports `useTheme` from `next-themes` (not installed). Replace its content:

```tsx
"use client";

import { useTheme } from "@/lib/use-theme";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      {...props}
    />
  );
};

export { Toaster };
```

- [ ] **Step 6: Typecheck, test, commit**

Run: `bunx tsc --noEmit && bun test` — clean / all pass.

```bash
git add packages/web/lib/use-theme.ts packages/web/components/theme-toggle.tsx packages/web/components/ui/sonner.tsx packages/web/test/use-theme.test.tsx
git commit -m "feat: add theme hook, toggle component and sonner theme wiring"
```

---

### Task 7: StatusBadge + EmptyState

**Files:**
- Create: `packages/web/components/status-badge.tsx`
- Create: `packages/web/components/empty-state.tsx`
- Test: `packages/web/test/status-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/web/test/status-badge.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "@/components/status-badge";

test("renders label and tone class", () => {
  render(<StatusBadge tone="success">Online</StatusBadge>);
  const el = screen.getByText("Online");
  expect(el.className).toContain("text-success");
});

test("pulse renders the live dot", () => {
  render(<StatusBadge tone="success" pulse>Live</StatusBadge>);
  expect(document.querySelector("[data-slot=pulse-dot]")).not.toBeNull();
});
```

Run: `bun test test/status-badge.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement StatusBadge**

`packages/web/components/status-badge.tsx`:

```tsx
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  success: "text-success border-success/40 bg-success/10",
  warning: "text-warning border-warning/40 bg-warning/10",
  danger: "text-danger border-danger/40 bg-danger/10",
  accent: "text-accent border-border-accent bg-accent/10",
  neutral: "text-text-secondary border-border bg-bg-tertiary/50",
};

export function StatusBadge({
  tone = "neutral",
  pulse = false,
  className,
  children,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em]",
        TONES[tone],
        className,
      )}
    >
      {pulse && (
        <span data-slot="pulse-dot" className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
```

Run: `bun test test/status-badge.test.tsx` — Expected: PASS.

- [ ] **Step 3: Implement EmptyState**

`packages/web/components/empty-state.tsx`:

```tsx
import Image from "next/image";
import { cn } from "@/lib/utils";

export function EmptyState({
  message,
  action,
  className,
}: {
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-14 text-center",
        className,
      )}
    >
      <Image
        src="/img/rb_newlion2024_4_RS.png"
        alt=""
        width={48}
        height={48}
        className="opacity-25 grayscale"
      />
      <p className="text-sm text-text-muted">{message}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/status-badge.tsx packages/web/components/empty-state.tsx packages/web/test/status-badge.test.tsx
git commit -m "feat: add StatusBadge and EmptyState components"
```

---

### Task 8: Canonical SearchInput

Replaces the existing ad-hoc `components/search-input.tsx` pattern (old component stays until pages migrate; the new one lives at `components/search-input-v2.tsx` until Phase 3 deletes the old one — at that point it is renamed).

**Files:**
- Create: `packages/web/components/search-input-v2.tsx`
- Test: `packages/web/test/search-input.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/web/test/search-input.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchInput } from "@/components/search-input-v2";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("debounces onSearch", async () => {
  const calls: string[] = [];
  render(<SearchInput onSearch={(v) => calls.push(v)} debounceMs={50} placeholder="Search" />);
  const input = screen.getByPlaceholderText("Search");
  fireEvent.change(input, { target: { value: "fal" } });
  fireEvent.change(input, { target: { value: "falke" } });
  expect(calls).toEqual([]);
  await sleep(80);
  expect(calls).toEqual(["falke"]);
});

test("clear button empties and fires immediately", async () => {
  const calls: string[] = [];
  render(<SearchInput onSearch={(v) => calls.push(v)} debounceMs={50} placeholder="Search" />);
  const input = screen.getByPlaceholderText("Search") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "x" } });
  await sleep(80);
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  expect(input.value).toBe("");
  expect(calls).toEqual(["x", ""]);
});
```

Run: `bun test test/search-input.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

`packages/web/components/search-input-v2.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
  onSearch,
  placeholder = "Search...",
  debounceMs = 250,
  className,
}: {
  onSearch: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(onSearch);
  latest.current = onSearch;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function handleChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(next), debounceMs);
  }

  function handleClear() {
    if (timer.current) clearTimeout(timer.current);
    setValue("");
    latest.current("");
  }

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
      <Input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `bun test test/search-input.test.tsx` — Expected: PASS (2 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/search-input-v2.tsx packages/web/test/search-input.test.tsx
git commit -m "feat: add canonical debounced SearchInput component"
```

---

### Task 9: FilterBar

**Files:**
- Create: `packages/web/components/filter-bar.tsx`
- Test: `packages/web/test/filter-bar.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/web/test/filter-bar.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "@/components/filter-bar";

const filters = [
  { key: "clan", label: "Clan: RB" },
  { key: "expired", label: "Expired only" },
];

test("renders active filter chips and clears one", () => {
  const cleared: string[] = [];
  render(
    <FilterBar activeFilters={filters} onClear={(k) => cleared.push(k)} onClearAll={() => {}}>
      <span>controls</span>
    </FilterBar>,
  );
  expect(screen.getByText("Clan: RB")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Remove filter Clan: RB" }));
  expect(cleared).toEqual(["clan"]);
});

test("clear all appears only with active filters", () => {
  const { rerender } = render(
    <FilterBar activeFilters={[]} onClear={() => {}} onClearAll={() => {}} />,
  );
  expect(screen.queryByRole("button", { name: "Clear all filters" })).toBeNull();
  rerender(<FilterBar activeFilters={filters} onClear={() => {}} onClearAll={() => {}} />);
  expect(screen.getByRole("button", { name: "Clear all filters" })).toBeDefined();
});
```

Run: `bun test test/filter-bar.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

`packages/web/components/filter-bar.tsx`:

```tsx
"use client";

import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ActiveFilter = { key: string; label: string };

export function FilterBar({
  children,
  activeFilters,
  onClear,
  onClearAll,
  className,
}: {
  children?: React.ReactNode;
  activeFilters: ActiveFilter[];
  onClear: (key: string) => void;
  onClearAll: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((f) => (
            <span
              key={f.key}
              className="inline-flex items-center gap-1 rounded-sm border border-border-accent bg-accent/10 px-2 py-0.5 text-[11px] uppercase tracking-[0.08em] text-accent"
            >
              {f.label}
              <button
                type="button"
                aria-label={`Remove filter ${f.label}`}
                onClick={() => onClear(f.key)}
                className="hover:text-text-primary"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <button
            type="button"
            aria-label="Clear all filters"
            onClick={onClearAll}
            className="px-1 text-[11px] uppercase tracking-[0.08em] text-text-muted hover:text-text-primary"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests, commit**

Run: `bun test test/filter-bar.test.tsx` — Expected: PASS.

```bash
git add packages/web/components/filter-bar.tsx packages/web/test/filter-bar.test.tsx
git commit -m "feat: add FilterBar with active filter chips"
```

---

### Task 10: DataTable (TanStack Table + compact density + selection + bulk bar)

The single table component every admin page migrates onto. The existing `components/data-table.tsx` stays untouched until Phase 3; this one is `components/data-table-v2.tsx` (renamed when the old one is deleted).

**Files:**
- Create: `packages/web/components/data-table-v2.tsx`
- Test: `packages/web/test/data-table.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/web/test/data-table.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table-v2";

type Row = { id: string; name: string; steamId: string };

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "steamId", header: "Steam ID", meta: { mono: true } },
];

const data: Row[] = [
  { id: "1", name: "Brick", steamId: "765611980999" },
  { id: "2", name: "Aldo", steamId: "765611980111" },
  { id: "3", name: "Falke", steamId: "765611980555" },
];

test("renders rows and mono cells", () => {
  render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);
  expect(screen.getAllByRole("row")).toHaveLength(4); // header + 3
  const steamCell = screen.getByText("765611980999");
  expect(steamCell.closest("td")!.className).toContain("font-mono");
});

test("sorts by column header click", () => {
  render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} />);
  fireEvent.click(screen.getByRole("button", { name: /Name/ }));
  const rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("Aldo")).toBeDefined();
});

test("selection drives the bulk bar", () => {
  render(
    <DataTable
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      enableSelection
      bulkActions={(rows) => <span>{rows.length} selected</span>}
    />,
  );
  expect(screen.queryByText(/selected/)).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all rows" }));
  expect(screen.getByText("3 selected")).toBeDefined();
});

test("paginates", () => {
  render(<DataTable columns={columns} data={data} getRowId={(r) => r.id} pageSize={2} />);
  expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
  fireEvent.click(screen.getByRole("button", { name: "Next page" }));
  expect(screen.getByText("Falke")).toBeDefined();
});
```

Run: `bun test test/data-table.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

`packages/web/components/data-table-v2.tsx`:

```tsx
"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ColumnMeta = { mono?: boolean; className?: string };

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  getRowId?: (row: TData) => string;
  enableSelection?: boolean;
  bulkActions?: (rows: TData[], clear: () => void) => React.ReactNode;
  pageSize?: number;
  emptyState?: React.ReactNode;
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  enableSelection = false,
  bulkActions,
  pageSize = 20,
  emptyState,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});

  const allColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!enableSelection) return columns;
    const select: ColumnDef<TData, unknown> = {
      id: "__select",
      size: 32,
      enableSorting: false,
      header: ({ table }) => (
        <Checkbox
          aria-label="Select all rows"
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label="Select row"
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
        />
      ),
    };
    return [select, ...columns];
  }, [columns, enableSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId,
    enableRowSelection: enableSelection,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const pageCount = table.getPageCount();

  return (
    <div className={cn("relative", className)}>
      <div className="rounded-sm border border-border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    className="h-9 text-[10px] font-medium uppercase tracking-[0.18em] text-text-muted"
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-text-primary"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: <ArrowUp className="size-3" />,
                          desc: <ArrowDown className="size-3" />,
                        }[header.column.getIsSorted() as string] ?? (
                          <ArrowUpDown className="size-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={allColumns.length} className="h-32">
                  {emptyState ?? (
                    <p className="text-center text-sm text-text-muted">No results.</p>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className="h-8"
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                    return (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          "py-1 text-[13px]",
                          meta?.mono && "font-mono text-xs tabular-nums text-text-secondary",
                          meta?.className,
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="font-mono text-xs tabular-nums text-text-muted">
            {table.getState().pagination.pageIndex + 1}/{pageCount}
          </span>
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous page"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next page"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {enableSelection && selectedRows.length > 0 && bulkActions && (
        <div className="sticky bottom-4 z-10 mt-3 flex items-center gap-3 rounded-sm border border-border-accent bg-bg-card/95 px-4 py-2 shadow-lg backdrop-blur">
          {bulkActions(selectedRows, () => table.resetRowSelection())}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `bun test test/data-table.test.tsx`
Expected: PASS (4 tests). If the Radix checkbox click does not register in happy-dom, change the test to `fireEvent.click` on the element returned by `screen.getByRole("checkbox", ...)` (already the case) — Radix renders `button[role=checkbox]`, which happy-dom handles.

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/data-table-v2.tsx packages/web/test/data-table.test.tsx
git commit -m "feat: add DataTable with sorting, selection, bulk bar and pagination"
```

---

### Task 11: PageHeader

**Files:**
- Create: `packages/web/components/page-header.tsx`
- Test: `packages/web/test/page-header.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/web/test/page-header.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@/components/page-header";

test("renders breadcrumb, title and actions", () => {
  render(
    <PageHeader breadcrumb={["Operations", "Whitelist"]} title="Whitelist"
      actions={<button>Add Entry</button>} />,
  );
  expect(screen.getByText("OPERATIONS / WHITELIST")).toBeDefined();
  expect(screen.getByRole("heading", { level: 1, name: "Whitelist" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Add Entry" })).toBeDefined();
});
```

Run: `bun test test/page-header.test.tsx` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement**

`packages/web/components/page-header.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
  className,
}: {
  breadcrumb?: string[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div>
        {breadcrumb && breadcrumb.length > 0 && (
          <p className="mb-1 font-mono text-[10px] tracking-[0.22em] text-text-muted">
            {breadcrumb.join(" / ").toUpperCase()}
          </p>
        )}
        <h1 className="font-display text-2xl font-black tracking-[0.06em] text-text-primary">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-prose text-sm font-light text-text-secondary">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
```

- [ ] **Step 3: Run tests, commit**

Run: `bun test test/page-header.test.tsx` — Expected: PASS.

```bash
git add packages/web/components/page-header.tsx packages/web/test/page-header.test.tsx
git commit -m "feat: add PageHeader with breadcrumb and actions slot"
```

---

### Task 12: StatCard + Sparkline

Shared replacements for the inline SVG sparklines duplicated in dashboard and live-server.

**Files:**
- Create: `packages/web/components/sparkline.tsx`
- Create: `packages/web/components/stat-card.tsx`
- Test: `packages/web/test/sparkline.test.ts`

- [ ] **Step 1: Write the failing path-utility test**

`packages/web/test/sparkline.test.ts`:

```ts
import { test, expect } from "bun:test";
import { sparklinePath } from "@/components/sparkline";

test("builds a polyline path across the full width", () => {
  const d = sparklinePath([0, 5, 10], 100, 30);
  expect(d.startsWith("M0,")).toBe(true);
  expect(d).toContain("L50,");
  expect(d).toContain("L100,");
});

test("flat series renders a midline", () => {
  const d = sparklinePath([4, 4, 4], 100, 30);
  expect(d).toBe("M0,15 L50,15 L100,15");
});

test("empty series yields empty path", () => {
  expect(sparklinePath([], 100, 30)).toBe("");
});
```

Run: `bun test test/sparkline.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement Sparkline**

`packages/web/components/sparkline.tsx`:

```tsx
export function sparklinePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  if (values.length === 1) return `M0,${height / 2} L${width},${height / 2}`;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const pad = 2;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = span === 0
        ? height / 2
        : height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  width = 120,
  height = 32,
  className = "text-accent",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={className}
      role="img"
      aria-label="Trend sparkline"
    >
      <path d={sparklinePath(values, width, height)} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
```

Run: `bun test test/sparkline.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 3: Implement StatCard**

`packages/web/components/stat-card.tsx`:

```tsx
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  children,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("flex flex-row items-center justify-between gap-4 p-4", className)}>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted">
          {label}
        </p>
        <p className="mt-1 font-mono text-xl tabular-nums text-text-primary">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-text-secondary">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/components/sparkline.tsx packages/web/components/stat-card.tsx packages/web/test/sparkline.test.ts
git commit -m "feat: add StatCard and Sparkline components"
```

---

### Task 13: App shells — AppSidebar (admin) + PublicHeader

Built as standalone components, NOT wired into `(protected)/layout.tsx` or `(public)` pages yet. They take data via props so the layouts can adopt them in Phases 1–2 without rework.

**Files:**
- Create: `packages/web/components/shell/nav-config.ts`
- Create: `packages/web/components/shell/app-sidebar.tsx`
- Create: `packages/web/components/shell/public-header.tsx`
- Test: `packages/web/test/nav-config.test.ts`

- [ ] **Step 1: Write the failing nav-config test**

`packages/web/test/nav-config.test.ts`:

```ts
import { test, expect } from "bun:test";
import { NAV_GROUPS, filterNavGroups } from "@/components/shell/nav-config";

test("nav groups cover the three sections", () => {
  expect(NAV_GROUPS.map((g) => g.label)).toEqual(["Operations", "Community", "System"]);
});

test("filters items by permission", () => {
  const groups = filterNavGroups(["view:whitelist"]);
  const items = groups.flatMap((g) => g.items).map((i) => i.href);
  expect(items).toContain("/whitelist");
  expect(items).not.toContain("/roles");
});

test("developer sees everything", () => {
  const groups = filterNavGroups(["developer"]);
  const count = groups.flatMap((g) => g.items).length;
  expect(count).toBe(NAV_GROUPS.flatMap((g) => g.items).length);
});
```

Run: `bun test test/nav-config.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 2: Implement nav-config**

Before writing, read the current nav items and their permission strings in `packages/web/app/(protected)/layout.tsx` and copy the EXACT `href`/permission pairs used there today. The structure below uses the spec's grouping; permissions must match the existing layout's values exactly (do not invent new permission strings).

`packages/web/components/shell/nav-config.ts`:

```ts
import {
  LayoutDashboard, ShieldCheck, Radio, Ticket, Sprout, Swords,
  Users, MessageSquare, Trophy, Bot, Settings2, KeyRound,
  ScrollText, Cog, FlaskConical, type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string; // undefined = visible to all authenticated users
};

export type NavGroup = { label: string; items: NavItem[] };

// PERMISSIONS: copy exact strings from app/(protected)/layout.tsx nav definition.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Whitelist", href: "/whitelist", icon: ShieldCheck, permission: "view:whitelist" },
      { label: "Live Server", href: "/live-server", icon: Radio, permission: "view:live-server" },
      { label: "Tickets", href: "/tickets", icon: Ticket, permission: "view:tickets" },
      { label: "Seeding Tracker", href: "/seeding-tracker", icon: Sprout, permission: "view:seeding" },
      { label: "Match Manager", href: "/match-manager", icon: Swords, permission: "manage:matches" },
    ],
  },
  {
    label: "Community",
    items: [
      { label: "Members", href: "/members", icon: Users, permission: "view:members" },
      { label: "Discord Users", href: "/discord-users", icon: MessageSquare, permission: "view:discord-users" },
      { label: "Matches", href: "/matches-admin", icon: Trophy, permission: "view:matches" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Discord Bot", href: "/discord-bot", icon: Bot, permission: "manage:discord-bot" },
      { label: "SquadJS Config", href: "/squadjs-config", icon: Cog, permission: "manage:squadjs" },
      { label: "Roles", href: "/roles", icon: KeyRound, permission: "manage:roles" },
      { label: "Audit Logs", href: "/audit-logs", icon: ScrollText, permission: "view:audit-logs" },
      { label: "Settings", href: "/settings", icon: Settings2 },
      { label: "Lobby Monitor", href: "/lobby-monitor", icon: FlaskConical, permission: "developer" },
    ],
  },
];

export const DASHBOARD_ITEM: NavItem = {
  label: "Dashboard",
  href: "/dashboard",
  icon: LayoutDashboard,
};

export function filterNavGroups(permissions: string[]): NavGroup[] {
  const isDev = permissions.includes("developer");
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) => !i.permission || isDev || permissions.includes(i.permission),
    ),
  })).filter((g) => g.items.length > 0);
}
```

NOTE FOR IMPLEMENTER: after copying real permission strings/hrefs from the existing layout, update the test expectations in Step 1 if a string differs (e.g. if the real permission is `whitelist:view` not `view:whitelist`). The test must assert the REAL values.

- [ ] **Step 3: Run nav-config tests**

Run: `bun test test/nav-config.test.ts` — Expected: PASS (3 tests).

- [ ] **Step 4: Implement AppSidebar**

`packages/web/components/shell/app-sidebar.tsx`:

```tsx
"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { DASHBOARD_ITEM, filterNavGroups } from "@/components/shell/nav-config";

function BracketShortcut() {
  const { toggleSidebar } = useSidebar();
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "[") return;
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      toggleSidebar();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);
  return null;
}

export function AppSidebar({
  permissions,
  footer,
}: {
  permissions: string[];
  footer?: React.ReactNode; // online users widget + profile, supplied by layout in Phase 2
}) {
  const pathname = usePathname();
  const groups = filterNavGroups(permissions);

  return (
    <Sidebar collapsible="icon">
      <BracketShortcut />
      <SidebarHeader className="border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 px-2 py-1.5">
          <Image src="/img/rb_newlion2024_4_RS.png" alt="Royal Battalion" width={24} height={24} />
          <span className="font-display text-[11px] font-bold tracking-[0.16em] text-accent group-data-[collapsible=icon]:hidden">
            ROYAL BATTALION
          </span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === DASHBOARD_ITEM.href}
                  tooltip={DASHBOARD_ITEM.label}
                >
                  <Link href={DASHBOARD_ITEM.href}>
                    <DASHBOARD_ITEM.icon />
                    <span>{DASHBOARD_ITEM.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[9px] tracking-[0.26em]">
              {group.label.toUpperCase()}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(item.href)}
                      tooltip={item.label}
                      className="data-[active=true]:bg-accent/10 data-[active=true]:text-accent-bright data-[active=true]:shadow-[inset_2px_0_0_var(--color-accent)]"
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      {footer && <SidebarFooter className="border-t border-sidebar-border">{footer}</SidebarFooter>}
      <SidebarRail />
    </Sidebar>
  );
}
```

Persistence/`SidebarProvider` note: shadcn's `SidebarProvider` persists collapse state via cookie out of the box; the layout (Phase 2) wraps pages with `<SidebarProvider defaultOpen={...}>`. Nothing extra needed here.

- [ ] **Step 5: Implement PublicHeader**

`packages/web/components/shell/public-header.tsx`:

```tsx
import Image from "next/image";
import Link from "next/link";
import { NavAuthButton } from "@/components/nav-auth-button";

const LINKS = [
  { label: "Servers", href: "/server" },
  { label: "Matches", href: "/matches" },
];

export function PublicHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-bg-primary/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src="/img/rb_newlion2024_4_RS.png" alt="Royal Battalion" width={28} height={28} />
          <span className="font-display text-sm font-bold tracking-[0.18em] text-text-primary">
            ROYAL <span className="text-accent">BATTALION</span>
          </span>
        </Link>
        <nav className="flex items-center gap-6">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hidden text-xs uppercase tracking-[0.16em] text-text-secondary transition-colors hover:text-accent sm:block"
            >
              {l.label}
            </Link>
          ))}
          <NavAuthButton />
        </nav>
      </div>
    </header>
  );
}
```

NOTE FOR IMPLEMENTER: check `components/nav-auth-button.tsx` for its actual export name and props before importing; adjust the import to match reality.

- [ ] **Step 6: Typecheck, test, commit**

Run: `bunx tsc --noEmit && bun test` — clean / all pass.

```bash
git add packages/web/components/shell packages/web/test/nav-config.test.ts
git commit -m "feat: add AppSidebar and PublicHeader shell components"
```

---

### Task 14: /design preview route + final verification + version bump

A dev-only gallery that renders every Phase 0 component in both themes. This is the phase's acceptance artifact.

**Files:**
- Create: `packages/web/app/design/page.tsx`
- Modify: `packages/web/package.json`, root `package.json` (version bumps)

- [ ] **Step 1: Create the gallery page**

`packages/web/app/design/page.tsx`:

```tsx
"use client";

import { notFound } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input-v2";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table-v2";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Sparkline } from "@/components/sparkline";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar } from "@/components/shell/app-sidebar";

type DemoRow = { id: string; name: string; steamId: string; clan: string; expires: string };

const demoColumns: ColumnDef<DemoRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "steamId", header: "Steam ID", meta: { mono: true } },
  { accessorKey: "clan", header: "Clan" },
  { accessorKey: "expires", header: "Expires", meta: { mono: true } },
];

const demoData: DemoRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  name: `Player_${i}`,
  steamId: `7656119801234${String(i).padStart(2, "0")}`,
  clan: i % 3 === 0 ? "RB" : "",
  expires: "2026-08-01",
}));

export default function DesignGallery() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      <PageHeader
        breadcrumb={["Design System"]}
        title="GILDED REGIMENT"
        description="Phase 0 component gallery. Toggle the theme to verify parchment."
        actions={<ThemeToggle />}
      />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Buttons</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="gold">Gold</Button>
          <Button variant="outlineGold">Outline Gold</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Badges + Status</h2>
        <div className="flex flex-wrap gap-2">
          <Badge>Badge</Badge>
          <StatusBadge tone="success" pulse>Online</StatusBadge>
          <StatusBadge tone="danger">Offline</StatusBadge>
          <StatusBadge tone="warning">Pending</StatusBadge>
          <StatusBadge tone="accent">Whitelist</StatusBadge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Stats</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Players Online" value="87/100" hint="Narva AAS v2">
            <Sparkline values={[40, 55, 60, 72, 80, 87]} />
          </StatCard>
          <StatCard label="Queue" value="4">
            <Sparkline values={[0, 2, 6, 3, 4, 4]} className="text-warning" />
          </StatCard>
          <StatCard label="Admins on Duty" value="3" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Search + Filters + Table</h2>
        <div className="flex gap-2">
          <SearchInput onSearch={() => {}} placeholder="Search steam ID, name, clan..." className="flex-1" />
          <Button variant="outlineGold">Filters</Button>
          <Button variant="gold">Add Entry</Button>
        </div>
        <FilterBar
          activeFilters={[{ key: "clan", label: "Clan: RB" }]}
          onClear={() => {}}
          onClearAll={() => {}}
        />
        <DataTable
          columns={demoColumns}
          data={demoData}
          getRowId={(r) => r.id}
          enableSelection
          pageSize={8}
          bulkActions={(rows, clear) => (
            <>
              <span className="text-sm text-text-secondary">{rows.length} selected</span>
              <Button variant="outlineGold" size="sm" onClick={clear}>Clear</Button>
            </>
          )}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Overlay + misc</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild><Button variant="outlineGold">Open Dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Confirm Action</DialogTitle></DialogHeader>
              <p className="text-sm text-text-secondary">Dialog body on card background.</p>
            </DialogContent>
          </Dialog>
          <Tabs defaultValue="a" className="w-64">
            <TabsList>
              <TabsTrigger value="a">Entries</TabsTrigger>
              <TabsTrigger value="b">Requests</TabsTrigger>
            </TabsList>
            <TabsContent value="a" className="text-sm text-text-secondary">Tab A</TabsContent>
            <TabsContent value="b" className="text-sm text-text-secondary">Tab B</TabsContent>
          </Tabs>
          <Input placeholder="Plain input" className="w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <Card className="p-0">
          <EmptyState message="No whitelist entries match your filters." action={<Button variant="outlineGold" size="sm">Clear filters</Button>} />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Admin sidebar (embedded preview)</h2>
        <div className="h-[420px] overflow-hidden rounded-sm border border-border">
          <SidebarProvider>
            <AppSidebar permissions={["developer"]} />
            <main className="flex-1 p-6">
              <PageHeader breadcrumb={["Operations", "Whitelist"]} title="WHITELIST" />
              <p className="text-sm text-text-secondary">
                Collapse with the rail or the [ key.
              </p>
            </main>
          </SidebarProvider>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Full verification pass**

Run: `bun test` — Expected: all tests pass.
Run: `bunx tsc --noEmit` — Expected: clean.
Run: `bun run build` — Expected: succeeds.
Run: `bun run dev`, open http://localhost:3000/design and verify manually:

1. All sections render in dark; ThemeToggle switches to parchment light and every component remains legible (gold -> bronze, ivory grounds).
2. DataTable: sort, select-all, bulk bar, pagination work.
3. Sidebar preview: collapses to icon rail via rail click and `[` key; tooltips appear when collapsed.
4. Existing pages (`/`, `/server`, `/matches`, `/dashboard`) are visually UNCHANGED in dark mode.
5. Dialog, tabs, dropdown render above content with correct theme surfaces.

- [ ] **Step 3: Version bump (project convention: bump on every push)**

Root `package.json`: `"version": "1.1.2"` -> `"1.2.0"`.
`packages/web/package.json`: `"version": "0.0.2"` -> `"0.1.0"`.

- [ ] **Step 4: Final commit**

```bash
git add packages/web/app/design packages/web/package.json package.json
git commit -m "feat: add design system gallery route and bump version for phase 0"
```

---

## Out of scope for Phase 0 (later phases)

- Wiring shells into `(public)`/`(protected)` layouts (Phases 1–2)
- Landing hero, ember canvas, telemetry strip, screenshot grading (Phase 1)
- Footer tech-link removal (Phase 1)
- Page migrations, whitelist decomposition (Phases 2–3)
- Deleting legacy components (`modal.tsx`, old `data-table.tsx`, old `search-input.tsx`), legacy CSS utilities, and renaming `-v2` components (Phase 3)

## Self-review notes

- Spec coverage: Phase 0 scope from the spec (tokens, fonts, shadcn restyle, composites, shells, theme infra, no migrations) is covered by Tasks 2–14; Task 1 enables the TDD discipline the plan relies on.
- Known reality-checks embedded for the executor: exact permission strings (Task 13 Step 2), `NavAuthButton` import shape (Task 13 Step 5), shadcn CLI overwrite prompt (Task 4 Step 5), pre-existing tsc warnings baseline (Task 4 Step 6).
- Type consistency: `DataTable` props (`columns`, `data`, `getRowId`, `enableSelection`, `bulkActions`, `pageSize`, `emptyState`) match between Task 10 implementation and Task 14 usage; `SearchInput` (`onSearch`, `debounceMs`, `placeholder`, `className`) matches Tasks 8/14; `filterNavGroups(permissions)` matches Tasks 13/14.
