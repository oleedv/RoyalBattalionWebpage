# Frontend Redesign Phase 1 (Public Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the entire public face of the Royal Battalion webpage (landing with ember hero + telemetry strip, server, matches, tickets, prospect, login/signout, privacy/terms, global error/404) on the Gilded Regiment design system, shipping in one release.

**Architecture:** Shared public chrome (PublicHeader/Footer) moves into `app/(public)/layout.tsx`; the 8 hand-rolled page headers are deleted. Behavior is extracted into small tested components (`components/public/*`, new composites); pages become thin compositions verified against the per-page checklist. The dead lobby-backed Connect flow on `/server` is REMOVED (spec default — the backing service was decommissioned 2026-06-30).

**Tech Stack:** Next.js 15 (App Router), React 19, Tailwind v4 (token classes only), Phase 0 design system (shadcn on Base UI), bun test + happy-dom + @testing-library/react, lucide-react.

## Global Constraints

- Branch: work on `integration/gilded-regiment` in the worktree `.claude/worktrees/gilded-regiment` (repo root `C:/Users/OleEd/Azure/RoyalBattalionWebpage`). Do NOT push (pushing `production` deploys Railway staging+prod).
- All test/tsc commands run from `packages/web` (`bun test`, `bunx tsc --noEmit`). `next build` is NOT verifiable locally (known Windows EPERM); CI/Docker verifies it.
- Tokens only: no raw hex in components. New tokens introduced by this plan: `--color-team-one`, `--color-team-one-bright`, `--color-team-two`, `--color-team-two-bright`, `--color-discord` (Task 1).
- Typography roles: Cinzel (`font-display`) for titles/headings only; Outfit (default `font-body`) for UI/body; JetBrains Mono (`font-mono`) for IDs, timestamps, scores, map names, telemetry values.
- Copy policy (public site): no tech specs, no protocol/plugin names, never advertise recording player data. Existing hero/body copy is RETAINED verbatim where the spec says so.
- Skeletons: initial load only (mainline `components/skeleton.tsx` system); background refresh keeps stale data on screen. No new `Loading...` text, no spinners.
- Motion: CSS-first, one-time scroll reveals, 150-200ms micro-transitions; `prefers-reduced-motion` disables all non-essential motion (ember canvas degrades to static logo). No animation libraries.
- No `window.confirm`/`alert`. No hover glow shadows (`glow-button` is being retired).
- Commits: conventional one-liners, no AI attribution. Commit after every task.
- `color-mix(in srgb, ...)` is sanctioned for token-derived translucent colors in CSS (Chrome 111+/FF 113+/Safari 16.2+).
- Existing brand mark for everything: `/img/rb_newlion2024_4_RS.png`.

## Per-page verification checklist (run at the end of every page task)

1. Same data displayed and same actions available as the current page (except the sanctioned Connect-flow removal on `/server`).
2. Both themes (`/settings` toggle or `document.documentElement.classList.replace("dark","light")` in devtools) — no unreadable text, no dark-only hex artifacts.
3. Mobile (375px) + desktop widths.
4. Loading (initial skeleton), empty, and error states render.
5. `bun test` green, `bunx tsc --noEmit` green.

---

### Task 1: Tokens, grade/reveal CSS, Reveal component, PublicPageHeading

**Files:**
- Modify: `packages/web/app/globals.css` (token blocks at `:root` ~line 5-25, `html.light` ~line 40-57; utilities section near `.facet-border` ~line 312)
- Create: `packages/web/components/public/reveal.tsx`
- Create: `packages/web/components/public/page-heading.tsx`
- Test: `packages/web/test/reveal.test.tsx`, `packages/web/test/page-heading.test.tsx`

**Interfaces:**
- Produces: `<Reveal delay?: number className?: string>{children}</Reveal>` (client component, one-time scroll reveal).
- Produces: `<PublicPageHeading title: string lede?: string />` (server-safe centered Cinzel heading with gold ornament).
- Produces CSS: `.graded-media` (vignette + gold wash over child `img`/`video`), `.reveal`/`.reveal-visible`, `.ember-lion-glow`, and the 5 new color tokens in BOTH theme blocks.

- [ ] **Step 1: Write the failing tests**

`packages/web/test/reveal.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { Reveal } from "@/components/public/reveal";

test("reveal is immediately visible when IntersectionObserver is unavailable", () => {
  // happy-dom has no IntersectionObserver — the guard path must show content
  const { container } = render(
    <Reveal>
      <p>Section content</p>
    </Reveal>,
  );
  const el = container.firstElementChild!;
  expect(el.className).toContain("reveal");
  expect(el.className).toContain("reveal-visible");
});

test("reveal applies stagger delay", () => {
  const { container } = render(<Reveal delay={160}>x</Reveal>);
  const el = container.firstElementChild as HTMLElement;
  expect(el.style.transitionDelay).toBe("160ms");
});
```

`packages/web/test/page-heading.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { PublicPageHeading } from "@/components/public/page-heading";

test("renders Cinzel title and lede", () => {
  render(<PublicPageHeading title="Match History" lede="Recent matches." />);
  const h1 = screen.getByRole("heading", { level: 1, name: "Match History" });
  expect(h1.className).toContain("font-display");
  expect(screen.getByText("Recent matches.")).toBeDefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `packages/web`): `bun test test/reveal.test.tsx test/page-heading.test.tsx`
Expected: FAIL — cannot resolve `@/components/public/reveal` / `page-heading` (modules missing).

- [ ] **Step 3: Add tokens + utilities to globals.css**

In the `:root` token block (after `--color-warning: #f59e0b;`):

```css
  /* Team + external-brand tokens (chart/team surfaces) */
  --color-team-one: #4a90d9;
  --color-team-one-bright: #7ab3ef;
  --color-team-two: #d94a4a;
  --color-team-two-bright: #ef7a7a;
  --color-discord: #5865f2;
```

In the `html.light` block (after its `--color-warning`):

```css
  --color-team-one: #35659f;
  --color-team-one-bright: #4a7db8;
  --color-team-two: #b03a3a;
  --color-team-two-bright: #c25858;
  --color-discord: #5865f2;
```

In the utilities section (next to `.facet-border`):

```css
/* Gilded grade for in-game media: dark vignette + gold wash. */
.graded-media {
  position: relative;
  overflow: hidden;
}
.graded-media > img,
.graded-media > video {
  filter: saturate(0.82) contrast(1.06);
}
.graded-media::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at center, transparent 45%, color-mix(in srgb, var(--color-bg-primary) 78%, transparent) 100%),
    linear-gradient(160deg, color-mix(in srgb, var(--color-accent) 14%, transparent) 0%, transparent 55%);
}

/* One-time scroll reveal (JS adds .reveal-visible once). */
.reveal {
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.6s ease-out, transform 0.6s ease-out;
}
.reveal-visible {
  opacity: 1;
  transform: none;
}
@media (prefers-reduced-motion: reduce) {
  .reveal {
    opacity: 1;
    transform: none;
    transition: none;
  }
}

/* Gold aura for the hero lion (token-derived, no raw rgba). */
.ember-lion-glow {
  filter: drop-shadow(0 0 40px color-mix(in srgb, var(--color-accent) 30%, transparent));
}
```

- [ ] **Step 4: Implement Reveal**

`packages/web/components/public/reveal.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** One-time scroll reveal. Instantly visible under reduced motion or when
 * IntersectionObserver is unavailable (SSR snapshot, old browsers, tests). */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || typeof IntersectionObserver === "undefined" || !ref.current) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn("reveal", visible && "reveal-visible", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Implement PublicPageHeading**

`packages/web/components/public/page-heading.tsx`:

```tsx
/** Centered public page heading: gold ornament + Cinzel title + optional lede. */
export function PublicPageHeading({
  title,
  lede,
}: {
  title: string;
  lede?: string;
}) {
  return (
    <header className="mb-10 text-center sm:mb-14">
      <div className="mb-5 flex items-center justify-center gap-3" aria-hidden="true">
        <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/40" />
        <div className="h-1.5 w-1.5 rotate-45 bg-accent/50" />
        <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/40" />
      </div>
      <h1 className="font-display mb-3 text-3xl font-bold tracking-[0.06em] text-text-primary sm:text-4xl lg:text-5xl">
        {title}
      </h1>
      {lede && (
        <p className="mx-auto max-w-xl text-base text-text-secondary sm:text-lg">
          {lede}
        </p>
      )}
    </header>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test test/reveal.test.tsx test/page-heading.test.tsx` — Expected: PASS.
Run: `bun test && bunx tsc --noEmit` — Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(web): add public design utilities (grade, reveal, page heading, team/discord tokens)"
```

---

### Task 2: StatusBadge domain variants

**Files:**
- Modify: `packages/web/components/status-badge.tsx` (whole file shown below)
- Test: `packages/web/test/status-badge.test.tsx` (append)

**Interfaces:**
- Consumes: existing `StatusBadge` tone API (`success|warning|danger|accent|neutral`, `pulse`, `children`).
- Produces: `variant?: StatusVariant` prop where `StatusVariant = "match-win"|"match-loss"|"match-draw"|"server-online"|"server-offline"|"ticket-open"|"ticket-closed"|"ticket-accepted"|"ticket-denied"|"ticket-legacy"`. Variant supplies default tone/label/pulse; explicit `tone`/`pulse`/`children` still override. Existing call sites are unaffected.

- [ ] **Step 1: Write the failing tests** (append to `packages/web/test/status-badge.test.tsx`)

```tsx
test("variant supplies tone, label and pulse defaults", () => {
  const { container, rerender } = render(<StatusBadge variant="match-win" />);
  expect(container.textContent).toBe("WIN");
  expect(container.querySelector("span")!.className).toContain("text-success");

  rerender(<StatusBadge variant="server-online" />);
  expect(container.textContent).toBe("Online");
  expect(container.querySelector('[data-slot="pulse-dot"]')).not.toBeNull();

  rerender(<StatusBadge variant="ticket-legacy" />);
  expect(container.textContent).toBe("Legacy");
  expect(container.querySelector("span")!.className).toContain("text-warning");
});

test("children override the variant label", () => {
  render(<StatusBadge variant="ticket-open">Open — escalated</StatusBadge>);
  expect(screen.getByText("Open — escalated")).toBeDefined();
});
```

(Match the file's existing imports; it already imports `render`/`screen` from `@testing-library/react` and `StatusBadge`.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/status-badge.test.tsx`
Expected: FAIL — `variant` prop not accepted / no label rendered.

- [ ] **Step 3: Implement** — replace `packages/web/components/status-badge.tsx` with:

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

/** Domain states rendered across pages. Variant sets defaults; explicit
 * tone/pulse/children props still override. */
const VARIANTS = {
  "match-win": { tone: "success", label: "WIN" },
  "match-loss": { tone: "danger", label: "LOSS" },
  "match-draw": { tone: "neutral", label: "DRAW" },
  "server-online": { tone: "success", label: "Online", pulse: true },
  "server-offline": { tone: "neutral", label: "Offline" },
  "ticket-open": { tone: "accent", label: "Open" },
  "ticket-closed": { tone: "neutral", label: "Closed" },
  "ticket-accepted": { tone: "success", label: "Accepted" },
  "ticket-denied": { tone: "danger", label: "Denied" },
  "ticket-legacy": { tone: "warning", label: "Legacy" },
} as const satisfies Record<string, { tone: Tone; label: string; pulse?: boolean }>;

export type StatusVariant = keyof typeof VARIANTS;

export function StatusBadge({
  variant,
  tone,
  pulse,
  className,
  children,
}: {
  variant?: StatusVariant;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const v = variant ? VARIANTS[variant] : undefined;
  const resolvedTone = tone ?? v?.tone ?? "neutral";
  const resolvedPulse = pulse ?? v?.pulse ?? false;
  const content = children ?? v?.label;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.1em]",
        TONES[resolvedTone],
        className,
      )}
    >
      {resolvedPulse && (
        <span
          data-slot="pulse-dot"
          aria-hidden="true"
          className="relative flex size-1.5"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      )}
      {content}
    </span>
  );
}
```

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit` — Expected: PASS (existing status-badge tests must stay green).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add domain variants to StatusBadge"
```

---

### Task 3: PublicHeader v2 + public layout adoption

**Files:**
- Modify: `packages/web/components/shell/public-header.tsx` (whole file below)
- Modify: `packages/web/app/(public)/layout.tsx` (whole file below)
- Test: `packages/web/test/public-header.test.tsx`

**Interfaces:**
- Consumes: `useSession` from `next-auth/react` (SessionProvider comes from `app/providers.tsx`, already wrapping the app).
- Produces: `<PublicHeader />` — fixed, blur-backdrop header with lion + wordmark, Servers/Matches nav, and an internal session-aware auth button (Dashboard when authenticated, Login otherwise). `components/nav-auth-button.tsx` is NOT deleted yet (pages still import it until Tasks 12-18 land; Task 20 deletes it).
- The public layout now renders PublicHeader for every `(public)` page. The header is `fixed`, so every non-landing page adds its own top padding (`pt-28` on `<main>`; the landing hero deliberately extends under the translucent header).

- [ ] **Step 1: Write the failing test**

`packages/web/test/public-header.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import { PublicHeader } from "@/components/shell/public-header";

test("shows Login when unauthenticated", () => {
  render(
    <SessionProvider session={null}>
      <PublicHeader />
    </SessionProvider>,
  );
  const link = screen.getByRole("link", { name: "Login" });
  expect(link.getAttribute("href")).toBe("/login");
});

test("shows Dashboard when authenticated", () => {
  render(
    <SessionProvider
      session={{ user: { name: "Ole" }, expires: "2099-01-01T00:00:00.000Z" }}
    >
      <PublicHeader />
    </SessionProvider>,
  );
  const link = screen.getByRole("link", { name: "Dashboard" });
  expect(link.getAttribute("href")).toBe("/dashboard");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/public-header.test.tsx`
Expected: FAIL — current header renders `NavAuthButton` with no styling and no session in test... it will actually throw or render Login without our styles; the authenticated test must fail because `useSession` is not used directly yet. Confirm at least one test fails before proceeding.

- [ ] **Step 3: Implement PublicHeader v2** — replace `packages/web/components/shell/public-header.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useSession } from "next-auth/react";

const LINKS = [
  { label: "Servers", href: "/server" },
  { label: "Matches", href: "/matches" },
];

function AuthButton() {
  const { status } = useSession();
  const authed = status === "authenticated";
  return (
    <Link
      href={authed ? "/dashboard" : "/login"}
      className="rounded-sm border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent transition-colors hover:border-accent/70 hover:bg-accent/15 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {authed ? "Dashboard" : "Login"}
    </Link>
  );
}

export function PublicHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-bg-primary/70 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/img/rb_newlion2024_4_RS.png"
            alt="Royal Battalion"
            width={28}
            height={28}
          />
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
          <AuthButton />
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Adopt in the public layout** — replace `packages/web/app/(public)/layout.tsx`:

```tsx
import { Footer } from "@/components/footer";
import { PublicHeader } from "@/components/shell/public-header";
import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      {children}
      <Footer />
    </>
  );
}
```

Note: until Tasks 12-18 rebuild each page, pages briefly render BOTH the layout header and their own legacy `<nav>`. That is acceptable mid-plan (the wave ships as one release); each page task deletes its legacy nav.

- [ ] **Step 5: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): session-aware PublicHeader v2 rendered from the public layout"
```

---

### Task 4: Footer cleanup + CookieConsent restyle

**Files:**
- Modify: `packages/web/components/footer.tsx` (whole file below)
- Modify: `packages/web/components/cookie-consent.tsx` (render block only)
- Test: `packages/web/test/footer.test.tsx`

**Interfaces:**
- Produces: `<Footer />` without the "Built With" tech-stack section (standing policy: no tech specs in public copy). Brand, legal links, Discord contact, attribution lines retained verbatim.

- [ ] **Step 1: Write the failing test**

`packages/web/test/footer.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/footer";

test("footer has no tech-stack links (public copy policy)", () => {
  render(<Footer />);
  expect(screen.queryByText(/Built With/i)).toBeNull();
  expect(screen.queryByText("Next.js")).toBeNull();
  expect(screen.queryByText("Prisma")).toBeNull();
});

test("footer keeps brand and legal links", () => {
  render(<Footer />);
  expect(screen.getByText("ROYAL BATTALION")).toBeDefined();
  expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
  expect(screen.getByRole("link", { name: "Terms of Service" }).getAttribute("href")).toBe("/terms");
  expect(screen.getByRole("link", { name: "Contact (Discord)" })).toBeDefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test test/footer.test.tsx`
Expected: first test FAILS ("Built With" and tech links present today).

- [ ] **Step 3: Implement** — replace `packages/web/components/footer.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-primary">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/img/rb_newlion2024_4_RS.png"
                alt="Royal Battalion"
                width={32}
                height={32}
                className="rounded-sm"
              />
              <span className="font-display text-sm font-semibold tracking-[0.15em] text-accent">
                ROYAL BATTALION
              </span>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              A tactical gaming community built around Squad.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
              Legal
            </h3>
            <nav className="flex flex-col gap-2 sm:items-end">
              <Link
                href="/privacy"
                className="text-sm text-text-secondary transition-colors hover:text-accent"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-text-secondary transition-colors hover:text-accent"
              >
                Terms of Service
              </Link>
              <a
                href="https://discord.gg/royalbattalion"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-text-secondary transition-colors hover:text-accent"
              >
                Contact (Discord)
              </a>
            </nav>
          </div>
        </div>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-text-muted">
            Made by <span className="font-semibold text-accent">RB | Ole</span>
          </p>
          <p className="text-xs text-text-muted">
            &copy; 2024 &ndash; 2026 Royal Battalion. All rights reserved.
          </p>
          <p className="max-w-2xl text-[10px] leading-relaxed text-text-muted/60">
            Squad is a trademark of Offworld Industries. Steam is a trademark of
            Valve Corporation. All other trademarks are property of their
            respective owners.
          </p>
          <p className="text-[10px] text-text-muted/50">
            Not affiliated with Valve Corporation or Offworld Industries
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Restyle the cookie banner** — in `packages/web/components/cookie-consent.tsx`, replace the returned JSX (keep all logic, `CONSENT_KEY`, handlers) with:

```tsx
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-accent/25 bg-bg-secondary/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-4 sm:flex-row sm:justify-between">
        <p className="text-sm text-text-secondary">
          This site uses cookies for authentication and preferences.{" "}
          <Link
            href="/privacy"
            className="text-accent underline-offset-2 hover:underline"
          >
            Learn more
          </Link>
        </p>
        <button
          onClick={handleAccept}
          className="shrink-0 cursor-pointer rounded-sm border border-accent bg-accent px-6 py-2 text-sm font-semibold uppercase tracking-[0.1em] text-bg-primary transition-colors hover:bg-accent-bright focus-visible:outline-2 focus-visible:outline-accent"
        >
          Accept
        </button>
      </div>
    </div>
  );
```

- [ ] **Step 5: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): drop footer tech-stack links and restyle footer + cookie banner"
```

---

### Task 5: Extract map-thumbnail resolution to lib (tested)

**Files:**
- Create: `packages/web/lib/map-thumbnails.ts`
- Modify: `packages/web/app/(public)/matches/page.tsx` (remove the local copy, import from lib — full page rewrite happens in Task 14; here ONLY swap the import so the lib is the single source)
- Test: `packages/web/test/map-thumbnails.test.ts`

**Interfaces:**
- Produces: `getMapThumbnailUrls(layer: string): string[]` and `THUMBNAILS_BASE` — moved VERBATIM from the current `matches/page.tsx` lines 11-85 logic (do not change behavior; the tests below encode current behavior).

- [ ] **Step 1: Write the failing test**

`packages/web/test/map-thumbnails.test.ts`:

```ts
import { test, expect } from "bun:test";
import { getMapThumbnailUrls, THUMBNAILS_BASE } from "@/lib/map-thumbnails";

test("resolves spaced A2S layer names to CamelCase repo names", () => {
  const urls = getMapThumbnailUrls("Goose Bay RAAS v2");
  expect(urls).toContain(`${THUMBNAILS_BASE}/GooseBay_RAAS_v2.jpg`);
});

test("strips SquadJS SEC prefixes", () => {
  const urls = getMapThumbnailUrls("SEC_26_Narva RAAS v1");
  expect(urls).toContain(`${THUMBNAILS_BASE}/Narva_RAAS_v1.jpg`);
});

test("adds zero-padded version fallbacks", () => {
  const urls = getMapThumbnailUrls("Yehorivka RAAS v2");
  expect(urls).toContain(`${THUMBNAILS_BASE}/Yehorivka_RAAS_v02.jpg`);
});

test("handles mode-only layers without version", () => {
  const urls = getMapThumbnailUrls("Fallujah Skirmish");
  expect(urls).toContain(`${THUMBNAILS_BASE}/Fallujah_Skirmish.jpg`);
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/map-thumbnails.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Create the lib** — `packages/web/lib/map-thumbnails.ts`: copy the constant `THUMBNAILS_BASE` (line 11-12 of the matches page) and the ENTIRE `getMapThumbnailUrls` function (lines 38-85) verbatim, prefixing both with `export`. No behavior edits.

- [ ] **Step 4: Point the matches page at the lib** — in `packages/web/app/(public)/matches/page.tsx`: delete the local `THUMBNAILS_BASE` constant and `getMapThumbnailUrls` function; add `import { getMapThumbnailUrls, THUMBNAILS_BASE } from "@/lib/map-thumbnails";` (keep `THUMBNAILS_BASE` import only if still referenced; otherwise import only the function).

- [ ] **Step 5: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(web): extract map thumbnail resolution into tested lib"
```

---

### Task 6: Extract shared message parts (Linkify, attachments)

**Files:**
- Create: `packages/web/components/public/message-parts.tsx`
- Test: `packages/web/test/message-parts.test.tsx`

**Interfaces:**
- Produces (used by Tasks 15-16): `Linkify({ text: string })`, `MessageAttachments({ attachments: string | string[] | null })`, `parseAttachments(raw: string | string[] | null): string[]`, `isImageUrl(url: string): boolean`, `isVideoUrl(url: string): boolean`.
- Behavior is the SUPERSET of the two current page-local copies: video extensions render `<video controls>` + download link (ticket page behavior); image extensions OR `cdn.discordapp.com` URLs (that are not videos) render `<img>` (prospect page behavior); everything else renders an "Attachment N" chip.

- [ ] **Step 1: Write the failing tests**

`packages/web/test/message-parts.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import {
  Linkify,
  MessageAttachments,
  parseAttachments,
  isImageUrl,
  isVideoUrl,
} from "@/components/public/message-parts";

test("parseAttachments handles JSON arrays, object urls, csv and null", () => {
  expect(parseAttachments(null)).toEqual([]);
  expect(parseAttachments('["https://a/x.png"]')).toEqual(["https://a/x.png"]);
  expect(parseAttachments('[{"url":"https://a/y.jpg"}]')).toEqual(["https://a/y.jpg"]);
  expect(parseAttachments("https://a/1.png, https://a/2.png")).toEqual([
    "https://a/1.png",
    "https://a/2.png",
  ]);
});

test("url type detection ignores query strings and trusts discord cdn", () => {
  expect(isImageUrl("https://x/y.webp?w=1")).toBe(true);
  expect(isVideoUrl("https://x/y.mp4?t=2")).toBe(true);
  expect(isImageUrl("https://cdn.discordapp.com/attachments/1/2/blob")).toBe(true);
  expect(isVideoUrl("https://cdn.discordapp.com/attachments/1/2/c.mov")).toBe(true);
});

test("Linkify turns bare urls into anchors", () => {
  render(<p><Linkify text="see https://example.com/x now" /></p>);
  const a = screen.getByRole("link");
  expect(a.getAttribute("href")).toBe("https://example.com/x");
});

test("MessageAttachments renders video for video urls", () => {
  const { container } = render(
    <MessageAttachments attachments='["https://x/clip.mp4"]' />,
  );
  expect(container.querySelector("video")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Download" })).toBeDefined();
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/message-parts.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `packages/web/components/public/message-parts.tsx`:

```tsx
"use client";

function extractUrls(arr: unknown[]): string[] {
  return arr
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "url" in item)
        return (item as { url: string }).url;
      return null;
    })
    .filter(Boolean) as string[];
}

export function parseAttachments(raw: string | string[] | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return extractUrls(raw);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return extractUrls(parsed);
  } catch {
    // Not JSON
  }
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function stripQuery(url: string): string {
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)$/i.test(stripQuery(url));
}

export function isImageUrl(url: string): boolean {
  if (isVideoUrl(url)) return false;
  return (
    /\.(png|jpe?g|gif|webp)$/i.test(stripQuery(url)) ||
    url.includes("cdn.discordapp.com")
  );
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

export function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_REGEX);
  return (
    <>
      {parts.map((part, i) =>
        URL_REGEX.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline break-all hover:text-accent-bright"
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function MessageAttachments({
  attachments,
}: {
  attachments: string | string[] | null;
}) {
  const urls = parseAttachments(attachments);
  if (urls.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((url, i) => {
        if (isVideoUrl(url)) {
          return (
            <div key={i} className="flex flex-col gap-1">
              <video
                src={url}
                controls
                preload="metadata"
                className="max-h-64 max-w-96 rounded-sm border border-border/50"
              />
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="self-start text-xs text-accent underline hover:text-accent-bright"
              >
                Download
              </a>
            </div>
          );
        }
        if (isImageUrl(url)) {
          return (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={url}
                alt={`Attachment ${i + 1}`}
                className="max-h-32 max-w-48 rounded-sm border border-border/50 object-cover transition-opacity hover:opacity-80"
                loading="lazy"
              />
            </a>
          );
        }
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-accent transition-colors hover:bg-bg-card-hover"
          >
            Attachment {i + 1}
          </a>
        );
      })}
    </div>
  );
}
```

Note the one intentional edge-case: `Linkify` reuses a global regex across `.test()` calls; `String.split` with a global regex resets `lastIndex` per part in practice, matching current page behavior. Keep as-is (behavior-preserving).

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "refactor(web): extract shared public message parts with tests"
```

---

### Task 7: DiscordEmbedCard composite

**Files:**
- Create: `packages/web/components/discord-embed.tsx`
- Test: `packages/web/test/discord-embed.test.tsx`

**Interfaces:**
- Consumes: `type DiscordEmbed` from `"shared"`.
- Produces: `DiscordEmbedCard({ embed: DiscordEmbed })` — the themed Discord-authentic embed renderer (deliberate exemption from the panel recipe). Stripe fallback goes through `var(--color-discord)`; real embed colors from Discord data still render via `colorToHex` (authentic-content exemption). Task 16 swaps the prospect page to this and deletes `ProspectForumEmbed.tsx`.

- [ ] **Step 1: Write the failing tests**

`packages/web/test/discord-embed.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DiscordEmbedCard } from "@/components/discord-embed";

test("uses the discord token for the stripe when no color is set", () => {
  const { container } = render(
    <DiscordEmbedCard embed={{ description: "hello" }} />,
  );
  const card = container.firstElementChild as HTMLElement;
  expect(card.style.borderLeft).toContain("var(--color-discord)");
});

test("renders author, linked title and fields grid", () => {
  render(
    <DiscordEmbedCard
      embed={{
        color: 0xff0000,
        author: { name: "Royal Secretary" },
        title: "Application",
        url: "https://example.com",
        fields: [
          { name: "Steam", value: "7656119...", inline: true },
          { name: "Why RB", value: "Because.", inline: false },
        ],
      }}
    />,
  );
  expect(screen.getByText("Royal Secretary")).toBeDefined();
  expect(screen.getByRole("link", { name: "Application" }).getAttribute("href")).toBe("https://example.com");
  expect(screen.getByText("Why RB")).toBeDefined();
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/discord-embed.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `packages/web/components/discord-embed.tsx`: copy the ENTIRE current `packages/web/app/(public)/prospect/[uuid]/ProspectForumEmbed.tsx` with exactly these changes:
  1. Rename the exported function `ProspectForumEmbed` → `DiscordEmbedCard`.
  2. Replace `colorToHex`:

```tsx
function stripeColor(color?: number): string {
  if (color == null) return "var(--color-discord)";
  return "#" + color.toString(16).padStart(6, "0");
}
```

  3. Replace `const stripe = colorToHex(embed.color);` with `const stripe = stripeColor(embed.color);`. Everything else (layout, author row, title/url, description, fields grid, image, footer, thumbnail) stays byte-identical.

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add DiscordEmbedCard composite with tokened stripe fallback"
```

---

### Task 8: DescriptionList/InfoField + CopyableId composites

**Files:**
- Create: `packages/web/components/description-list.tsx`
- Create: `packages/web/components/copyable-id.tsx`
- Test: `packages/web/test/description-list.test.tsx`, `packages/web/test/copyable-id.test.tsx`

**Interfaces:**
- Produces: `DescriptionList({ children, className? })` (renders `<dl>` grid) and `InfoField({ label: string, mono?: boolean, children })` (uppercase micro-label `<dt>` + `<dd>` value). Read-only variants only (inline edit variants are later-phase work).
- Produces: `CopyableId({ value: string, className? })` — mono ID button with hover Copy / Copied affordance via `navigator.clipboard`.

- [ ] **Step 1: Write the failing tests**

`packages/web/test/description-list.test.tsx`:

```tsx
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
```

`packages/web/test/copyable-id.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen, fireEvent } from "@testing-library/react";
import { CopyableId } from "@/components/copyable-id";

test("copies the value to the clipboard", async () => {
  const written: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (t: string) => (written.push(t), Promise.resolve()) },
  });
  render(<CopyableId value="76561198000000000" />);
  fireEvent.click(
    screen.getByRole("button", { name: "Copy 76561198000000000" }),
  );
  await Promise.resolve();
  expect(written).toEqual(["76561198000000000"]);
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/description-list.test.tsx test/copyable-id.test.tsx` — Expected: FAIL (modules missing).

- [ ] **Step 3: Implement DescriptionList** — `packages/web/components/description-list.tsx`:

```tsx
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Uppercase micro-label + value grid used in detail panels. */
export function DescriptionList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {children}
    </dl>
  );
}

export function InfoField({
  label,
  mono = false,
  children,
}: {
  label: string;
  mono?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm text-text-primary",
          mono && "font-mono text-xs tabular-nums text-text-secondary",
        )}
      >
        {children}
      </dd>
    </div>
  );
}
```

- [ ] **Step 4: Implement CopyableId** — `packages/web/components/copyable-id.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/** Mono ID with a hover Copy / Copied affordance. */
export function CopyableId({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function copy() {
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${value}`}
      className={cn(
        "group inline-flex items-center gap-1.5 font-mono text-xs tabular-nums text-text-secondary transition-colors hover:text-text-primary",
        className,
      )}
    >
      {value}
      {copied ? (
        <Check className="size-3 text-success" />
      ) : (
        <Copy className="size-3 opacity-0 transition-opacity group-hover:opacity-60" />
      )}
    </button>
  );
}
```

- [ ] **Step 5: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): add DescriptionList/InfoField and CopyableId composites"
```

---

### Task 9: Ember field math (pure, tested)

**Files:**
- Create: `packages/web/lib/ember-field.ts`
- Test: `packages/web/test/ember-field.test.ts`

**Interfaces:**
- Produces (consumed by Task 10):
  - `type Mote = { x: number; y: number; depth: number; r: number; phase: number; vy: number; sway: number }` — positions normalized to [0,1].
  - `createMotes(count: number, rng?: () => number): Mote[]`
  - `stepMote(m: Mote, dt: number, rng?: () => number): Mote` — drifts upward, wraps to the bottom with a fresh x.
  - `swayOffset(m: Mote, t: number): number` — horizontal sway in normalized units.
  - `flicker(phase: number, t: number): number` — alpha in [0.35, 1].
  - `parallax(depth: number, mouse: { x: number; y: number }, max?: number): { dx: number; dy: number }` — px offset scaled by depth (mouse normalized [-1,1], max default 18).
  - `shouldAnimateEmbers(env: { reducedMotion: boolean; coarsePointer: boolean; hasCanvas2d: boolean }): boolean`

- [ ] **Step 1: Write the failing tests**

`packages/web/test/ember-field.test.ts`:

```ts
import { test, expect } from "bun:test";
import {
  createMotes,
  stepMote,
  flicker,
  parallax,
  shouldAnimateEmbers,
} from "@/lib/ember-field";

const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length];
};

test("createMotes produces count motes within normalized bounds", () => {
  const motes = createMotes(70, seq(0.1, 0.5, 0.9));
  expect(motes).toHaveLength(70);
  for (const m of motes) {
    expect(m.x).toBeGreaterThanOrEqual(0);
    expect(m.x).toBeLessThanOrEqual(1);
    expect(m.depth).toBeGreaterThanOrEqual(0.25);
    expect(m.depth).toBeLessThanOrEqual(1);
    expect(m.vy).toBeGreaterThan(0);
  }
});

test("stepMote drifts upward and wraps to the bottom", () => {
  const m = createMotes(1, seq(0.5))[0];
  const up = stepMote(m, 1);
  expect(up.y).toBeLessThan(m.y);
  const wrapped = stepMote({ ...m, y: -0.06 }, 0.016, seq(0.25));
  expect(wrapped.y).toBeGreaterThan(1);
  expect(wrapped.x).toBe(0.25);
});

test("flicker stays within its alpha band", () => {
  for (const t of [0, 0.5, 1, 2, 9.7]) {
    const a = flicker(1.3, t);
    expect(a).toBeGreaterThanOrEqual(0.35);
    expect(a).toBeLessThanOrEqual(1);
  }
});

test("parallax scales with depth", () => {
  const deep = parallax(1, { x: 1, y: 0 });
  const shallow = parallax(0.25, { x: 1, y: 0 });
  expect(deep.dx).toBe(18);
  expect(shallow.dx).toBeCloseTo(4.5);
});

test("degradation matrix", () => {
  expect(shouldAnimateEmbers({ reducedMotion: false, coarsePointer: false, hasCanvas2d: true })).toBe(true);
  expect(shouldAnimateEmbers({ reducedMotion: true, coarsePointer: false, hasCanvas2d: true })).toBe(false);
  expect(shouldAnimateEmbers({ reducedMotion: false, coarsePointer: true, hasCanvas2d: true })).toBe(false);
  expect(shouldAnimateEmbers({ reducedMotion: false, coarsePointer: false, hasCanvas2d: false })).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/ember-field.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `packages/web/lib/ember-field.ts`:

```ts
/** Pure math for the hero ember field. Rendering lives in
 * components/public/ember-hero.tsx; everything here is deterministic given
 * an injected rng, so it is unit-testable. Positions are normalized [0,1]. */

export type Mote = {
  x: number;
  y: number;
  depth: number;
  r: number;
  phase: number;
  vy: number;
  sway: number;
};

export function createMotes(
  count: number,
  rng: () => number = Math.random,
): Mote[] {
  return Array.from({ length: count }, () => {
    const depth = 0.25 + rng() * 0.75;
    return {
      x: rng(),
      y: rng(),
      depth,
      r: 0.6 + depth * 1.6,
      phase: rng() * Math.PI * 2,
      vy: 0.015 + depth * 0.035,
      sway: 0.004 + rng() * 0.01,
    };
  });
}

export function stepMote(
  m: Mote,
  dt: number,
  rng: () => number = Math.random,
): Mote {
  let y = m.y - m.vy * dt;
  let x = m.x;
  if (y < -0.05) {
    y = 1.05;
    x = rng();
  }
  return { ...m, x, y };
}

export function swayOffset(m: Mote, t: number): number {
  return Math.sin(t * 0.8 + m.phase) * m.sway;
}

export function flicker(phase: number, t: number): number {
  return 0.675 + 0.325 * Math.sin(t * 2 + phase);
}

export function parallax(
  depth: number,
  mouse: { x: number; y: number },
  max = 18,
): { dx: number; dy: number } {
  return { dx: mouse.x * max * depth, dy: mouse.y * max * depth };
}

export function shouldAnimateEmbers(env: {
  reducedMotion: boolean;
  coarsePointer: boolean;
  hasCanvas2d: boolean;
}): boolean {
  return !env.reducedMotion && !env.coarsePointer && env.hasCanvas2d;
}
```

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS. (Note: `flicker` bottoms out at 0.35 exactly because 0.675 − 0.325 = 0.35.)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add pure ember-field math for the hero canvas"
```

---

### Task 10: EmberHero canvas component

**Files:**
- Create: `packages/web/components/public/ember-hero.tsx`
- Test: `packages/web/test/ember-hero.test.tsx`

**Interfaces:**
- Consumes: everything from `@/lib/ember-field`; `getChartTokens` from `@/lib/chart-tokens` (for the gold draw color — series[1] is accent-bright).
- Produces: `<EmberHero motes?: number size?: number className?: string />` — decorative (`aria-hidden`), lion + ember canvas. Degrades to the static lion (no RAF, empty canvas) when `shouldAnimateEmbers` is false; pauses RAF while offscreen via IntersectionObserver (runs unconditionally if IO is unavailable).

- [ ] **Step 1: Write the failing test**

`packages/web/test/ember-hero.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render } from "@testing-library/react";
import { EmberHero } from "@/components/public/ember-hero";

test("renders the static lion and stays decorative without canvas 2d", () => {
  // happy-dom canvas has no usable 2d context -> degrade path
  const { container } = render(<EmberHero size={300} />);
  const root = container.firstElementChild as HTMLElement;
  expect(root.getAttribute("aria-hidden")).toBe("true");
  expect(container.querySelector("img")).not.toBeNull();
  expect(container.querySelector("canvas")).not.toBeNull();
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/ember-hero.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `packages/web/components/public/ember-hero.tsx`:

```tsx
"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import {
  createMotes,
  stepMote,
  swayOffset,
  flicker,
  parallax,
  shouldAnimateEmbers,
  type Mote,
} from "@/lib/ember-field";
import { getChartTokens } from "@/lib/chart-tokens";
import { cn } from "@/lib/utils";

/** Lion emblem in a drifting gold ember field with depth parallax.
 * Decorative only. Degrades to the static lion under reduced motion, on
 * touch devices, or when canvas 2d is unavailable; pauses offscreen. */
export function EmberHero({
  motes = 70,
  size = 340,
  className,
}: {
  motes?: number;
  size?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const lion = lionRef.current;
    if (!canvas || !wrap || !lion) return;

    const ctx = canvas.getContext("2d");
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (
      !shouldAnimateEmbers({
        reducedMotion,
        coarsePointer,
        hasCanvas2d: !!ctx,
      }) ||
      !ctx
    ) {
      return; // static lion, empty canvas
    }

    const gold = getChartTokens().series[1];
    let field: Mote[] = createMotes(motes);
    const mouse = { x: 0, y: 0 };
    let visible = true;
    let raf = 0;
    let last = performance.now();

    function onMouseMove(e: MouseEvent) {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener("mousemove", onMouseMove);

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      observer = new IntersectionObserver(
        (entries) => {
          visible = entries.some((e) => e.isIntersecting);
          if (visible) {
            last = performance.now();
            raf = requestAnimationFrame(frame);
          }
        },
        { threshold: 0 },
      );
      observer.observe(wrap);
    }

    function frame(now: number) {
      if (!visible || !ctx) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now / 1000;

      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      field = field.map((m) => stepMote(m, dt));
      for (const m of field) {
        const p = parallax(m.depth, mouse);
        const x = (m.x + swayOffset(m, t)) * canvas!.width + p.dx;
        const y = m.y * canvas!.height + p.dy;
        ctx.globalAlpha = flicker(m.phase, t) * (0.35 + m.depth * 0.65);
        ctx.fillStyle = gold;
        ctx.beginPath();
        ctx.arc(x, y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const breath = 1 + 0.015 * Math.sin(t * 0.5);
      const lp = parallax(0.5, mouse);
      lion!.style.transform = `translate(${lp.dx * 0.4}px, ${lp.dy * 0.4}px) scale(${breath})`;

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMouseMove);
      observer?.disconnect();
    };
  }, [motes]);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={cn("relative select-none", className)}
      style={{ width: size, height: size }}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        className="absolute inset-0"
      />
      <div ref={lionRef} className="absolute inset-0 grid place-items-center">
        <Image
          src="/img/rb_newlion2024_4_RS.png"
          alt=""
          width={Math.round(size * 0.62)}
          height={Math.round(size * 0.62)}
          className="ember-lion-glow"
          priority
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add EmberHero canvas with reduced-motion/touch/offscreen degradation"
```

---

### Task 11: HeroTelemetry strip

**Files:**
- Create: `packages/web/components/public/hero-telemetry.tsx`
- Test: `packages/web/test/hero-telemetry.test.tsx`

**Interfaces:**
- Consumes: `getServerStatus`, `getAdminTeamCount`, `getPublicMatches`, `type ServerStatus` from `@/lib/api-client`; `type Match` from `"shared"`; `useAutoRefresh` from `@/hooks/use-auto-refresh` (interval-only — the component does its own initial fetch); `StatusBadge` (Task 2 variants).
- Produces: `<HeroTelemetry fetchers?: Partial<TelemetryFetchers> />` where `type TelemetryFetchers = { servers: typeof getServerStatus; admins: typeof getAdminTeamCount; matches: typeof getPublicMatches }` (DI for tests; defaults are the api-client functions). Renders 4 tiles: Main server (players/map), Battle server (players/map), Admins on duty, Last match result. Mono values, pulsing status dots, 30s refresh, `--` fallbacks. Count-up runs once on first data only.

- [ ] **Step 1: Write the failing test**

`packages/web/test/hero-telemetry.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { HeroTelemetry } from "@/components/public/hero-telemetry";

const ok = <T,>(data: T) => Promise.resolve({ success: true as const, data });

const fetchers = {
  servers: () =>
    ok([
      { status: "online", players: 84, maxPlayers: 100, map: "Narva", ip: "", port: 0, playerList: [] },
      { status: "offline", players: 0, maxPlayers: 100, map: "-", ip: "", port: 0, playerList: [] },
    ] as never),
  admins: () => ok({ count: 4 }),
  matches: () =>
    ok({ items: [{ id: 1, map: "Narva", layer: "Narva RAAS v1", result: "WIN", date: "2026-07-06", server: "Main" }], total: 1, page: 1, limit: 1, hasNext: false } as never),
};

test("renders four tiles with live values and result badge", async () => {
  render(<HeroTelemetry fetchers={fetchers} />);
  expect(screen.getByText("Main Server")).toBeDefined();
  expect(screen.getByText("Battle Server")).toBeDefined();
  expect(screen.getByText("Admins on Duty")).toBeDefined();
  expect(screen.getByText("Last Match")).toBeDefined();
  await waitFor(() => {
    expect(screen.getByText("84/100")).toBeDefined();
    expect(screen.getByText("Narva")).toBeDefined();
    expect(screen.getByText("4")).toBeDefined();
    expect(screen.getByText("WIN")).toBeDefined();
  });
});

test("renders -- fallbacks when fetchers fail", async () => {
  const failing = {
    servers: () => Promise.resolve({ success: false as const, error: "x" }),
    admins: () => Promise.resolve({ success: false as const, error: "x" }),
    matches: () => Promise.resolve({ success: false as const, error: "x" }),
  };
  render(<HeroTelemetry fetchers={failing as never} />);
  await waitFor(() => {
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/hero-telemetry.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `packages/web/components/public/hero-telemetry.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAdminTeamCount,
  getPublicMatches,
  getServerStatus,
  type ServerStatus,
} from "@/lib/api-client";
import type { Match } from "shared";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { StatusBadge, type StatusVariant } from "@/components/status-badge";

export type TelemetryFetchers = {
  servers: typeof getServerStatus;
  admins: typeof getAdminTeamCount;
  matches: typeof getPublicMatches;
};

const DEFAULT_FETCHERS: TelemetryFetchers = {
  servers: getServerStatus,
  admins: getAdminTeamCount,
  matches: getPublicMatches,
};

function matchVariant(result: string): StatusVariant {
  const r = result.toLowerCase();
  if (r === "win") return "match-win";
  if (r === "loss") return "match-loss";
  return "match-draw";
}

function Dot({ online }: { online: boolean }) {
  return (
    <span aria-hidden="true" className="relative flex size-1.5">
      {online && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
      )}
      <span
        className={`relative inline-flex size-1.5 rounded-full ${online ? "bg-success" : "bg-text-muted"}`}
      />
    </span>
  );
}

function Tile({
  label,
  dot,
  value,
  hint,
}: {
  label: string;
  dot?: boolean | null;
  value: React.ReactNode;
  hint?: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 px-5 py-3">
      <div className="flex items-center gap-2">
        {dot != null && <Dot online={dot} />}
        <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-text-muted">
          {label}
        </span>
      </div>
      <div className="font-mono text-lg font-semibold tabular-nums text-text-primary">
        {value}
      </div>
      {hint && (
        <div className="truncate font-mono text-[11px] text-text-secondary">
          {hint}
        </div>
      )}
    </div>
  );
}

/** Live telemetry strip pinned to the hero base. Replaces LiveSnapshot. */
export function HeroTelemetry({
  fetchers,
}: {
  fetchers?: Partial<TelemetryFetchers>;
}) {
  const f = { ...DEFAULT_FETCHERS, ...fetchers };
  const fRef = useRef(f);
  fRef.current = f;

  const [servers, setServers] = useState<ServerStatus[] | null>(null);
  const [admins, setAdmins] = useState<number | null>(null);
  const [lastMatch, setLastMatch] = useState<Match | null>(null);

  const load = useCallback(async () => {
    const [s, a, m] = await Promise.all([
      fRef.current.servers(),
      fRef.current.admins(),
      fRef.current.matches(1, 1),
    ]);
    if (s.success && s.data) setServers(s.data);
    if (a.success && a.data) setAdmins(a.data.count);
    if (m.success && m.data && m.data.items.length > 0)
      setLastMatch(m.data.items[0]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, 30_000);

  const main = servers?.[0] ?? null;
  const battle = servers?.[1] ?? null;

  return (
    <div className="border-t border-border/60 bg-bg-primary/70 backdrop-blur-md">
      <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-border/40 lg:grid-cols-4">
        <Tile
          label="Main Server"
          dot={main ? main.status === "online" : null}
          value={main ? `${main.players}/${main.maxPlayers}` : "--"}
          hint={main?.map}
        />
        <Tile
          label="Battle Server"
          dot={battle ? battle.status === "online" : null}
          value={battle ? `${battle.players}/${battle.maxPlayers}` : "--"}
          hint={battle?.map}
        />
        <Tile label="Admins on Duty" value={admins ?? "--"} />
        <Tile
          label="Last Match"
          value={
            lastMatch ? (
              <StatusBadge variant={matchVariant(lastMatch.result)} />
            ) : (
              "--"
            )
          }
          hint={lastMatch?.map}
        />
      </div>
    </div>
  );
}
```

Design note: count-up motion was considered and intentionally reduced to a static first paint here — the strip's values are small (`84/100`) and the spec's constraint is that count-up must never re-trigger on refresh; rendering static values satisfies that trivially. If count-up is added later it must be gated on first data + `prefers-reduced-motion`.

- [ ] **Step 4: Verify green** — `bun test && bunx tsc --noEmit`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(web): add HeroTelemetry strip on auto-refresh with DI fetchers"
```

---

### Task 12: Landing page rebuild

**Files:**
- Modify: `packages/web/app/(public)/page.tsx` (full replacement below)
- Create: `packages/web/app/(public)/landing-sections.tsx`
- Delete: `packages/web/components/live-snapshot.tsx`
- Test: none new (behavior lives in Tasks 9-11 components; page is composition — verify via checklist)

**Interfaces:**
- Consumes: `EmberHero`, `HeroTelemetry`, `Reveal`, `StatusBadge`, `getServerStatus`, `getPublicMatches`, `getMapThumbnailUrls`, `useAutoRefresh`.
- Copy retained verbatim: kicker "Squad Gaming Community"; body "Tactical Squad across two community servers. Active admins, organized rounds and priority whitelist earned by helping keep the lights on."; CTAs "Connect to Server" (→ `/server`) and "Join Discord" (→ `https://discord.gg/royalbattalion`).
- `HERO_IMAGE: string | null = null` — abstract fallback until RB supplies a screenshot; when provided, drop the file in `public/img/hero/` and set the constant.

- [ ] **Step 1: Create the landing sections** — `packages/web/app/(public)/landing-sections.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  getPublicMatches,
  getServerStatus,
  type ServerStatus,
} from "@/lib/api-client";
import type { Match } from "shared";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { getMapThumbnailUrls } from "@/lib/map-thumbnails";
import { StatusBadge, type StatusVariant } from "@/components/status-badge";
import { DiscordIcon } from "@/components/public/discord-icon";

const SERVER_LABELS = ["Main Server", "Battle Server"] as const;
const SERVER_NAMES = ["Royal Battalion", "RB Battle"] as const;

export function ServersSection() {
  const [servers, setServers] = useState<ServerStatus[] | null>(null);
  const load = useCallback(async () => {
    const res = await getServerStatus();
    if (res.success && res.data) setServers(res.data);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useAutoRefresh(load, 30_000);

  return (
    <section className="mx-auto max-w-4xl px-6 py-20">
      <h2 className="font-display mb-3 text-center text-3xl font-bold tracking-wide sm:text-4xl">
        Join the Fight
      </h2>
      <p className="mb-10 text-center text-text-secondary">
        Connect directly through Steam or search &quot;Royal Battalion&quot; in
        the server browser.
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        {SERVER_LABELS.map((label, i) => {
          const s = servers?.[i] ?? null;
          const online = s?.status === "online";
          return (
            <Link
              key={label}
              href="/server"
              className="facet-border group flex flex-col gap-3 rounded-sm bg-bg-card px-8 py-7 transition-colors hover:bg-bg-card-hover"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
                  {label}
                </span>
                <StatusBadge
                  variant={online ? "server-online" : "server-offline"}
                />
              </div>
              <span className="font-display text-lg font-semibold tracking-wide text-text-primary">
                {SERVER_NAMES[i]}
              </span>
              <span className="font-mono text-sm tabular-nums text-text-secondary">
                {s ? `${s.players}/${s.maxPlayers} — ${s.map}` : "--"}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function resultVariant(result: string): StatusVariant {
  const r = result.toLowerCase();
  if (r === "win") return "match-win";
  if (r === "loss") return "match-loss";
  return "match-draw";
}

export function RecentMatchesSection() {
  const [matches, setMatches] = useState<Match[]>([]);
  useEffect(() => {
    getPublicMatches(1, 3).then((res) => {
      if (res.success && res.data) setMatches(res.data.items);
    });
  }, []);

  if (matches.length === 0) return null;

  return (
    <section className="border-t border-border bg-bg-secondary py-20">
      <div className="mx-auto max-w-5xl px-6">
        <h2 className="font-display mb-10 text-center text-3xl font-bold tracking-wide sm:text-4xl">
          Recent Matches
        </h2>
        <div className="grid gap-5 sm:grid-cols-3">
          {matches.map((m) => (
            <Link
              key={m.id}
              href="/matches"
              className="facet-border group overflow-hidden rounded-sm bg-bg-card transition-colors hover:bg-bg-card-hover"
            >
              <div className="graded-media h-28">
                <img
                  src={getMapThumbnailUrls(m.layer)[0]}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-display text-sm font-semibold tracking-wide text-text-primary">
                    {m.map}
                  </div>
                  <div className="font-mono text-[11px] text-text-muted">
                    {new Date(m.date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}
                  </div>
                </div>
                <StatusBadge variant={resultVariant(m.result)} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const WHITELIST_STEPS = [
  {
    title: "Join the Fight",
    body: "Play on our servers and become part of the community.",
  },
  {
    title: "Support the Battalion",
    body: "Help keep the lights on — seed the servers or support the community.",
  },
  {
    title: "Earn Your Slot",
    body: "Receive priority whitelist and skip the queue.",
  },
];

export function WhitelistSection() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-20">
      <h2 className="font-display mb-10 text-center text-3xl font-bold tracking-wide sm:text-4xl">
        How Whitelist Works
      </h2>
      <ol className="grid gap-5 sm:grid-cols-3">
        {WHITELIST_STEPS.map((step, i) => (
          <li
            key={step.title}
            className="facet-border rounded-sm bg-bg-card px-6 py-7"
          >
            <div className="font-display mb-3 text-3xl font-bold text-accent/60">
              {String(i + 1).padStart(2, "0")}
            </div>
            <h3 className="font-display mb-2 text-base font-semibold tracking-wide text-text-primary">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-text-secondary">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DiscordCtaSection() {
  return (
    <section className="border-t border-border bg-bg-secondary py-20 text-center">
      <div className="mx-auto max-w-2xl px-6">
        <h2 className="font-display mb-4 text-3xl font-bold tracking-wide sm:text-4xl">
          Ready to Enlist?
        </h2>
        <p className="mb-8 text-text-secondary">
          The battalion organizes on Discord — events, squads and the community
          all live there.
        </p>
        <a
          href="https://discord.gg/royalbattalion"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 rounded-sm bg-(--color-discord) px-8 py-3.5 text-sm font-semibold tracking-wide text-white transition-colors hover:opacity-90"
        >
          <DiscordIcon className="h-5 w-5" />
          Join Discord
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create the shared Discord icon** — `packages/web/components/public/discord-icon.tsx` (the SVG path is copied from the current landing page line 158):

```tsx
export function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
    </svg>
  );
}
```

- [ ] **Step 3: Rebuild the landing page** — replace `packages/web/app/(public)/page.tsx`:

```tsx
import Link from "next/link";
import { EmberHero } from "@/components/public/ember-hero";
import { HeroTelemetry } from "@/components/public/hero-telemetry";
import { Reveal } from "@/components/public/reveal";
import { DiscordIcon } from "@/components/public/discord-icon";
import {
  ServersSection,
  RecentMatchesSection,
  WhitelistSection,
  DiscordCtaSection,
} from "./landing-sections";

/** Set to an in-game screenshot path (e.g. "/img/hero/main.jpg") when RB
 * supplies one; null keeps the abstract gradient fallback. */
const HERO_IMAGE: string | null = null;

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="noise-overlay relative flex min-h-screen flex-col justify-end overflow-hidden">
        {/* Backdrop: graded screenshot, or abstract fallback */}
        {HERO_IMAGE ? (
          <div className="graded-media absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HERO_IMAGE}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(color-mix(in srgb, var(--color-accent) 50%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 50%, transparent) 1px, transparent 1px)",
                backgroundSize: "80px 80px",
              }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-bg-primary)_70%)]" />
          </div>
        )}

        {/* Ember lion, center-right (desktop only) */}
        <div className="pointer-events-none absolute right-[6%] top-1/2 hidden -translate-y-[60%] lg:block">
          <EmberHero size={380} />
        </div>

        {/* Copy, bottom-left */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-28 pt-32 sm:pb-32">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-accent/80">
            Squad Gaming Community
          </p>
          <h1 className="font-display mb-6 text-5xl font-black leading-[0.95] tracking-[0.06em] text-text-primary sm:text-7xl lg:text-8xl">
            ROYAL
            <br />
            <span className="text-accent">BATTALION</span>
          </h1>
          <div
            className="mb-6 h-px w-48 bg-gradient-to-r from-accent/60 to-transparent"
            aria-hidden="true"
          />
          <p className="mb-10 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
            Tactical Squad across two community servers. Active admins,
            organized rounds and priority whitelist earned by helping keep the
            lights on.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/server"
              className="inline-flex items-center justify-center gap-2.5 rounded-sm border border-accent bg-accent px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.1em] text-bg-primary transition-colors hover:bg-accent-bright focus-visible:outline-2 focus-visible:outline-accent"
            >
              Connect to Server
            </Link>
            <a
              href="https://discord.gg/royalbattalion"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 rounded-sm bg-(--color-discord) px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:opacity-90"
            >
              <DiscordIcon className="h-5 w-5" />
              Join Discord
            </a>
          </div>
        </div>

        {/* Telemetry strip pinned to the hero base */}
        <div className="relative z-10">
          <HeroTelemetry />
        </div>
      </section>

      {/* Scroll-revealed sections */}
      <Reveal>
        <ServersSection />
      </Reveal>
      <Reveal delay={80}>
        <RecentMatchesSection />
      </Reveal>
      <Reveal delay={80}>
        <WhitelistSection />
      </Reveal>
      <Reveal delay={80}>
        <DiscordCtaSection />
      </Reveal>
    </div>
  );
}
```

- [ ] **Step 4: Delete LiveSnapshot**

```bash
git rm packages/web/components/live-snapshot.tsx
```

Then confirm nothing else imports it: `grep -rn "live-snapshot" packages/web` must return nothing.

- [ ] **Step 5: Verify** — `bun test && bunx tsc --noEmit` green; dev-smoke `bun run dev` and run the per-page checklist on `/` (hero copy retained, telemetry strip values, ember lion on desktop, static lion under devtools "emulate prefers-reduced-motion", sections reveal on scroll).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): rebuild landing with ember hero, telemetry strip and reveal sections"
```

---

### Task 13: /server rebuild — Connect flow removal

**Files:**
- Modify: `packages/web/app/(public)/server/page.tsx`
- Create: `packages/web/app/(public)/server/server-card.tsx`
- Test: `packages/web/test/server-card.test.tsx`

**Interfaces:**
- Consumes: `type ServerStatus` from `@/lib/api-client`, `StatusBadge` variants, `formatDuration` (moves into server-card.tsx).
- Produces: `ServerCard({ config: { label: string; displayName: string }, status: ServerStatus | null })` — the current card WITHOUT the Join/lobby block: header (label, name, StatusBadge server-online/offline), players `84/100` (mono), current map, address (mono), capacity bar, collapsible player list. `createLobby` is no longer imported anywhere on the page (the api-client function itself is deleted in Phase 3 with the lobby-monitor removal).

- [ ] **Step 1: Write the failing test**

`packages/web/test/server-card.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { ServerCard } from "@/app/(public)/server/server-card";

const status = {
  status: "online",
  players: 84,
  maxPlayers: 100,
  map: "Narva AAS v1",
  ip: "1.2.3.4",
  port: 27015,
  playerList: [{ name: "Brick", duration: 3900 }],
} as never;

test("renders live status without any join flow", () => {
  render(
    <ServerCard
      config={{ label: "Main Server", displayName: "Royal Battalion" }}
      status={status}
    />,
  );
  expect(screen.getByText("Online")).toBeDefined();
  expect(screen.getByText("84")).toBeDefined();
  expect(screen.getByText("Narva AAS v1")).toBeDefined();
  expect(screen.queryByText(/Join Server/i)).toBeNull();
  expect(screen.queryByText(/Creating lobby/i)).toBeNull();
});

test("player list toggle reveals players", () => {
  render(
    <ServerCard
      config={{ label: "Main Server", displayName: "Royal Battalion" }}
      status={status}
    />,
  );
  screen.getByText(/Show Players \(1\)/).click();
  expect(screen.getByText("Brick")).toBeDefined();
  expect(screen.getByText("1h 5m")).toBeDefined();
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/server-card.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement ServerCard** — `packages/web/app/(public)/server/server-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ServerStatus } from "@/lib/api-client";
import { StatusBadge } from "@/components/status-badge";

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ServerCard({
  config,
  status,
}: {
  config: { label: string; displayName: string };
  status: ServerStatus | null;
}) {
  const [showPlayers, setShowPlayers] = useState(false);
  const isOnline = status?.status === "online";

  return (
    <div className="facet-border w-full rounded-sm bg-bg-card">
      <div className="flex items-center justify-between border-b border-border/50 px-6 py-5">
        <div>
          <div className="mb-0.5 text-xs font-medium uppercase tracking-[0.2em] text-text-muted">
            {config.label}
          </div>
          <div className="font-display text-lg font-semibold tracking-wide text-text-primary">
            {config.displayName}
          </div>
        </div>
        <StatusBadge variant={isOnline ? "server-online" : "server-offline"} />
      </div>

      {status && (
        <div className="px-6 py-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                Players
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums text-text-primary">
                {status.players}
                <span className="text-base font-normal text-text-muted">
                  /{status.maxPlayers}
                </span>
              </div>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                Current Map
              </div>
              <div className="font-mono text-sm text-text-primary">
                {status.map}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                Address
              </div>
              <div className="font-mono text-sm tabular-nums text-text-secondary">
                {status.ip}:{status.port}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-tertiary">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{
                  width: `${(status.players / status.maxPlayers) * 100}%`,
                }}
              />
            </div>
          </div>

          {status.playerList.length > 0 && (
            <div className="mt-4">
              <button
                onClick={() => setShowPlayers(!showPlayers)}
                className="flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-accent"
              >
                <ChevronDown
                  className={`size-4 transition-transform duration-200 ${showPlayers ? "rotate-180" : ""}`}
                />
                {showPlayers
                  ? "Hide Players"
                  : `Show Players (${status.playerList.length})`}
              </button>

              {showPlayers && (
                <div className="mt-3 max-h-64 overflow-y-auto rounded-sm border border-border/50 bg-bg-primary/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                          Player
                        </th>
                        <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-[0.1em] text-text-muted">
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.playerList.map((p, i) => (
                        <tr key={i} className="border-b border-border/20">
                          <td className="px-3 py-1.5 text-text-primary">
                            {p.name}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-text-secondary">
                            {formatDuration(p.duration)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rebuild the page** — replace `packages/web/app/(public)/server/page.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { getServerStatus, getAdminTeamCount } from "@/lib/api-client";
import type { ServerStatus } from "@/lib/api-client";
import { Skeleton, SkeletonCard, SkeletonRegion } from "@/components/skeleton";
import { PublicPageHeading } from "@/components/public/page-heading";
import { ServerCard } from "./server-card";

const SERVERS = [
  { label: "Main Server", displayName: "Royal Battalion" },
  { label: "Battle Server", displayName: "RB Battle" },
];

export default function ServerPage() {
  const [statuses, setStatuses] = useState<ServerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminCount, setAdminCount] = useState<number | null>(null);

  useEffect(() => {
    async function fetchStatus() {
      const res = await getServerStatus();
      if (res.success && res.data) {
        setStatuses(res.data);
      }
      setLoading(false);
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    getAdminTeamCount().then((res) => {
      if (res.success && res.data) setAdminCount(res.data.count);
    });
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 pb-16 pt-28">
      <PublicPageHeading
        title="Server Status"
        lede="Live information for the Royal Battalion Squad servers."
      />

      <section className="mb-16">
        {loading && statuses.length === 0 ? (
          <SkeletonRegion
            className="grid gap-6 lg:grid-cols-2"
            label="Loading server status…"
          >
            {SERVERS.map((config) => (
              <SkeletonCard key={config.label} pad="p-0">
                <div className="flex items-center justify-between border-b border-border/50 px-6 py-5">
                  <div className="space-y-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="px-6 py-4">
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Skeleton className="h-2.5 w-12" />
                      <Skeleton className="h-7 w-16" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-2.5 w-16" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="col-span-2 space-y-2 sm:col-span-1">
                      <Skeleton className="h-2.5 w-14" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </div>
                  <Skeleton className="mt-4 h-1.5 w-full rounded-full" />
                </div>
              </SkeletonCard>
            ))}
          </SkeletonRegion>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {SERVERS.map((config, i) => (
              <ServerCard
                key={config.label}
                config={config}
                status={statuses[i] || null}
              />
            ))}
          </div>
        )}
        <div className="mt-6 text-center text-sm text-text-muted">
          Search for &quot;Royal Battalion&quot; in the Squad server browser to
          connect.
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-gradient-to-r from-accent/20 to-transparent" />
          <h2 className="font-display text-xl font-semibold tracking-wide text-text-primary">
            Server Details
          </h2>
          <div className="h-px flex-1 bg-gradient-to-l from-accent/20 to-transparent" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Game", value: "Squad" },
            { label: "Max Players", value: "100" },
            { label: "Region", value: "Europe" },
            { label: "Tickrate", value: "64" },
            {
              label: "Admin Team",
              value: adminCount === null ? "--" : `${adminCount} on duty`,
            },
            { label: "Reserved Slots", value: "Whitelist" },
          ].map((item) => (
            <div
              key={item.label}
              className="facet-border rounded-sm bg-bg-card p-5 transition-colors hover:bg-bg-card-hover"
            >
              <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.2em] text-text-muted">
                {item.label}
              </div>
              <div className="font-display text-lg font-semibold tracking-wide text-text-primary">
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
```

Note what disappeared: the hand-rolled `<nav>` (layout header now), `createLobby`/`NavAuthButton` imports, `handleJoin`/`joining`/`joinError`, the "Join Server" button block, and the per-server SVG icons (the card header simplifies to label + name + StatusBadge). The `SERVERS` config loses `lobbyName` and `icon`.

- [ ] **Step 5: Verify** — `bun test && bunx tsc --noEmit` green. Confirm removal: `grep -rn "createLobby" "packages/web/app"` returns nothing. Dev-smoke `/server` with the checklist (Connect-flow removal is the sanctioned exception to "same actions").

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): rebuild server page on design system and remove dead lobby connect flow"
```

---

### Task 14: /matches rebuild

**Files:**
- Modify: `packages/web/app/(public)/matches/page.tsx`
- Create: `packages/web/app/(public)/matches/match-card.tsx`
- Test: `packages/web/test/match-card.test.tsx`

**Interfaces:**
- Consumes: `getMapThumbnailUrls` (Task 5), `StatusBadge` variants (Task 2), team tokens (Task 1), types `Match`, `MatchPlayer` from `"shared"`.
- Produces: `MatchCard({ match: Match })` — the current `MatchRow` + `PlayerTable` + `FactionFlag` + `MapImg` moved into one file with these changes ONLY:
  1. `resultBadge()` string-class helper is deleted; every result chip becomes `<StatusBadge variant={resultVariant(x)} />` with `resultVariant` mapping WIN→`match-win`, LOSS→`match-loss`, else `match-draw`.
  2. Raw team hexes are replaced by tokens: `text-[#4a90d9]`→`text-(--color-team-one)`, `text-[#d94a4a]`→`text-(--color-team-two)`, `bg-[#4a90d9]`→`bg-(--color-team-one)`, `bg-[#d94a4a]`→`bg-(--color-team-two)`, `text-[#7ab3ef]`→`text-(--color-team-one-bright)`, `text-[#ef7a7a]`→`text-(--color-team-two-bright)`.
  3. The thumbnail containers gain the grade: the background `MapImg` wrapper div and the 14×14 thumb wrapper each get `graded-media` added to their className.
  4. K/D/Rev/TK cells in `PlayerTable` get `font-mono tabular-nums` added.
  5. Import `getMapThumbnailUrls` from `@/lib/map-thumbnails`.
  Everything else (expansion logic, gradient masks, VOD chip, date format, squad grouping) is moved verbatim.

- [ ] **Step 1: Write the failing test**

`packages/web/test/match-card.test.tsx`:

```tsx
import { test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { MatchCard } from "@/app/(public)/matches/match-card";

const match = {
  id: 1,
  map: "Narva",
  layer: "Narva RAAS v1",
  date: "2026-07-01T18:00:00Z",
  server: "Main",
  result: "WIN",
  vodUrl: null,
  matchDetail: null,
} as never;

test("renders summary with StatusBadge result", () => {
  render(<MatchCard match={match} />);
  expect(screen.getByText("Narva")).toBeDefined();
  expect(screen.getByText("WIN")).toBeDefined();
});

test("no raw team hex classes remain", () => {
  const { container } = render(<MatchCard match={match} />);
  expect(container.innerHTML).not.toContain("#4a90d9");
  expect(container.innerHTML).not.toContain("#d94a4a");
});
```

- [ ] **Step 2: Run to verify failure** — `bun test test/match-card.test.tsx` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — create `match-card.tsx` by moving `FactionFlag`, `MapImg`, `PlayerTable`, and `MatchRow` (renamed `MatchCard`) out of `page.tsx`, applying exactly the 5 changes listed in Interfaces. Add at the top:

```tsx
"use client";

import React, { useState } from "react";
import type { Match, MatchPlayer } from "shared";
import { getMapThumbnailUrls } from "@/lib/map-thumbnails";
import { StatusBadge, type StatusVariant } from "@/components/status-badge";

function resultVariant(result: string): StatusVariant {
  const r = result.toLowerCase();
  if (r === "win") return "match-win";
  if (r === "loss") return "match-loss";
  return "match-draw";
}
```

(The `FACTION_FLAGS`/`FLAG_BASE` tables move verbatim too.) In the summary row, the non-detail fallback chip becomes `<StatusBadge variant={resultVariant(match.result)} />`; the two team chips become `<StatusBadge variant={resultVariant(detail.team1.result)} />` / team2 equivalent.

- [ ] **Step 4: Slim the page** — `packages/web/app/(public)/matches/page.tsx` keeps only: state/pagination/fetch logic (unchanged), and renders:

```tsx
"use client";

import { useState, useEffect } from "react";
import { SkeletonList } from "@/components/skeleton";
import { getPublicMatches } from "@/lib/api-client";
import type { Match } from "shared";
import { PublicPageHeading } from "@/components/public/page-heading";
import { MatchCard } from "./match-card";

const PAGE_SIZE = 20;

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await getPublicMatches(page, PAGE_SIZE);
      if (res.success && res.data) {
        setMatches(res.data.items);
        setTotal(res.data.total);
      }
      setLoading(false);
    }
    load();
  }, [page]);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-16 pt-28 sm:px-6">
      <PublicPageHeading
        title="Match History"
        lede="Recent matches played on Royal Battalion servers."
      />

      <section>
        {loading ? (
          <SkeletonList rows={3} avatar />
        ) : matches.length === 0 ? (
          <div className="py-16 text-center text-text-muted">
            No matches recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <MatchCard key={match.id} match={match} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <div className="font-mono text-xs tabular-nums text-text-muted">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-sm border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-tertiary disabled:opacity-40 disabled:hover:bg-transparent"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
```

(The hand-rolled `<nav>` and `NavAuthButton`/`Image`/`Link` imports are gone.)

- [ ] **Step 5: Verify** — `bun test && bunx tsc --noEmit` green; dev-smoke `/matches` with checklist (expansion, pagination, VOD links, both themes — team colors now flip with theme).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(web): rebuild matches page with graded thumbnails, StatusBadge results and team tokens"
```

---

### Task 15: Ticket pages rebuild (public + legacy)

**Files:**
- Modify: `packages/web/app/(public)/ticket/[uuid]/page.tsx`
- Modify: `packages/web/app/(public)/ticket/legacy/[uuid]/page.tsx`
- Test: existing suites only (shared behavior already tested via Tasks 2/6/8)

**Interfaces:**
- Consumes: `Linkify`/`MessageAttachments` from `@/components/public/message-parts` (Task 6), `DescriptionList`/`InfoField` (Task 8), `StatusBadge` ticket variants (Task 2), `PublicPageHeading` (Task 1), `SkeletonText` from `@/components/skeleton`.

- [ ] **Step 1: Rebuild `ticket/[uuid]/page.tsx`.** Keep the data logic (`use(params)`, `getTicketByUuid`, state) IDENTICAL. Apply these structural changes:
  1. Delete the local `StatusBadge`, `TierBadge`, `extractUrls`, `parseAttachments`, `stripQuery`, `isImageUrl`, `isVideoUrl`, `Linkify`, `MessageAttachments` definitions and the `<nav>` block + its imports (`NavAuthButton`, `Image`).
  2. New imports:

```tsx
import { Linkify, MessageAttachments } from "@/components/public/message-parts";
import { DescriptionList, InfoField } from "@/components/description-list";
import { StatusBadge } from "@/components/status-badge";
import { PublicPageHeading } from "@/components/public/page-heading";
import { SkeletonRegion, SkeletonText } from "@/components/skeleton";
```

  3. Wrapper becomes `<main className="mx-auto max-w-4xl px-6 pb-16 pt-28">`.
  4. Loading state (replaces the "Loading ticket..." text — no-Loading-text rule):

```tsx
{loading && (
  <SkeletonRegion label="Loading ticket…" className="space-y-4">
    <SkeletonText lines={2} />
    <SkeletonText lines={4} />
  </SkeletonRegion>
)}
```

  5. Header block becomes:

```tsx
<PublicPageHeading title={`Ticket #${ticket.id}`} />
<div className="-mt-6 mb-8 flex items-center justify-center gap-3">
  <StatusBadge
    variant={ticket.status === "open" ? "ticket-open" : "ticket-closed"}
  />
  <StatusBadge tone="neutral">{TIER_LABELS[ticket.tier] || ticket.tier}</StatusBadge>
</div>
```

     with the tier label table kept as a plain constant:

```tsx
const TIER_LABELS: Record<string, string> = {
  normal: "Normal",
  community_officer: "Community Officer",
  admin_officer: "Admin Officer",
  comp_team: "Comp Team",
  whitelist: "Whitelist",
};
```

  6. The info grid card becomes DescriptionList:

```tsx
<div className="facet-border mb-6 rounded-sm bg-bg-card p-5">
  <DescriptionList className="lg:grid-cols-4">
    <InfoField label="User ID" mono>{ticket.userId}</InfoField>
    <InfoField label="Created">{new Date(ticket.createdAt).toLocaleString()}</InfoField>
    {ticket.closedAt && (
      <InfoField label="Closed">{new Date(ticket.closedAt).toLocaleString()}</InfoField>
    )}
    {ticket.closedBy && (
      <InfoField label="Closed By">{ticket.closedBy}</InfoField>
    )}
  </DescriptionList>
</div>
```

  7. Timeline and Messages sections keep their exact current JSX (they already use tokens), except message timestamps gain `font-mono` on the date span and section `<h2>`s stay `font-display`.

- [ ] **Step 2: Rebuild `ticket/legacy/[uuid]/page.tsx`** the same way (it is a sibling of the same shape using `getLegacyTicketByUuid` + `LegacyTicket`). Its header badges: `<StatusBadge variant="ticket-legacy" />` always, plus the open/closed badge as above if the legacy model has `status`. Delete its local helper copies; import from the shared modules.

- [ ] **Step 3: Verify** — `bun test && bunx tsc --noEmit` green. `grep -rn "function Linkify" "packages/web/app"` must return nothing (both local copies deleted; prospect's copy dies in Task 16). Dev-smoke a real ticket UUID if available; otherwise verify the not-found error state renders.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): rebuild public ticket pages on shared message parts and DescriptionList"
```

---

### Task 16: Prospect page rebuild

**Files:**
- Modify: `packages/web/app/(public)/prospect/[uuid]/page.tsx`
- Delete: `packages/web/app/(public)/prospect/[uuid]/ProspectForumEmbed.tsx`
- Test: existing suites only

**Interfaces:**
- Consumes: `DiscordEmbedCard` (Task 7), `Linkify`/`MessageAttachments` (Task 6), `DescriptionList`/`InfoField` (Task 8), `CopyableId` (Task 8), `StatusBadge` (Task 2), `PublicPageHeading` (Task 1).

- [ ] **Step 1: Rebuild the page.** Keep data logic identical (`getProspectByUuid`). Changes:
  1. Delete local `extractUrls`/`parseAttachments`/`isImageUrl`/`Linkify`/`MessageAttachments`/`StatusBadge` + the `<nav>` block; import the shared modules instead.
  2. Replace `import { ProspectForumEmbed } from "./ProspectForumEmbed";` with `import { DiscordEmbedCard } from "@/components/discord-embed";` and each `<ProspectForumEmbed embed={embed} />` with `<DiscordEmbedCard embed={embed} />`.
  3. Status badge mapping: `open`→`ticket-open`, `accepted`→`ticket-accepted`, `denied`→`ticket-denied`, anything else→`ticket-closed`:

```tsx
const STATUS_VARIANT: Record<string, StatusVariant> = {
  open: "ticket-open",
  accepted: "ticket-accepted",
  denied: "ticket-denied",
};
// usage: <StatusBadge variant={STATUS_VARIANT[prospect.status] ?? "ticket-closed"} />
```

  4. Header: `<PublicPageHeading title={prospect.alias} />` + the badge row.
  5. Application info card → DescriptionList; the Steam ID field becomes `<InfoField label="Steam ID"><CopyableId value={prospect.steamId} /></InfoField>`; User ID / Mentor fields get `mono`.
  6. Loading state → SkeletonRegion (same pattern as Task 15 step 4; label "Loading prospect…").
  7. Why RB / Votes / Forum / Timeline / Messages sections keep current JSX with shared parts swapped in.

- [ ] **Step 2: Delete the old embed** — `git rm "packages/web/app/(public)/prospect/[uuid]/ProspectForumEmbed.tsx"`, then `grep -rn "ProspectForumEmbed" packages/web` must return nothing.

- [ ] **Step 3: Verify** — `bun test && bunx tsc --noEmit` green; dev-smoke `/prospect/<uuid>` or its error state; checklist.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): rebuild prospect page with DiscordEmbedCard and CopyableId"
```

---

### Task 17: Login + signout rebuild

**Files:**
- Modify: `packages/web/app/(auth)/login/page.tsx` (full replacement below)
- Modify: `packages/web/app/(auth)/signout/page.tsx` (full replacement below)

**Interfaces:**
- Consumes: `EmberHero` (Task 10 — reduced intensity via `motes={28}`), `DiscordIcon` (Task 12), `Skeleton` from `@/components/skeleton`. Auth logic (signIn/signOut/redirects) unchanged.

- [ ] **Step 1: Replace `app/(auth)/login/page.tsx`:**

```tsx
"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { EmberHero } from "@/components/public/ember-hero";
import { DiscordIcon } from "@/components/public/discord-icon";
import { Skeleton } from "@/components/skeleton";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "loading") {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-bg-primary"
        role="status"
        aria-label="Checking session"
      >
        <div className="w-full max-w-sm space-y-3 px-6">
          <Skeleton className="mx-auto h-8 w-48" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (status === "authenticated") {
    return null;
  }

  function handleSignIn() {
    setSigningIn(true);
    signIn("discord", { callbackUrl: "/dashboard" });
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg-primary px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-bg-primary)_75%)]" />

      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <EmberHero size={180} motes={28} />
        </div>
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-display text-2xl font-bold tracking-[0.12em] text-text-primary"
          >
            ROYAL <span className="text-accent">BATTALION</span>
          </Link>
          <p className="mt-2 text-sm text-text-secondary">
            Sign in to access your clan dashboard
          </p>
        </div>

        <div className="facet-border rounded-sm bg-bg-card p-8">
          <h1 className="font-display mb-6 text-center text-xl font-semibold tracking-wide">
            Sign In
          </h1>

          <button
            onClick={handleSignIn}
            disabled={signingIn}
            className="flex w-full items-center justify-center gap-3 rounded-sm bg-(--color-discord) px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-70"
          >
            <DiscordIcon className="h-5 w-5" />
            {signingIn ? "Redirecting to Discord…" : "Continue with Discord"}
          </button>

          <p className="mt-6 text-center text-xs text-text-muted">
            By signing in, you agree to link your Discord account with Royal
            Battalion.
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/(auth)/signout/page.tsx`:**

```tsx
"use client";

import { signOut } from "next-auth/react";
import { useEffect } from "react";
import Image from "next/image";

export default function SignOutPage() {
  useEffect(() => {
    signOut({ callbackUrl: "/" });
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg-primary">
      <Image
        src="/img/rb_newlion2024_4_RS.png"
        alt=""
        width={64}
        height={64}
        className="ember-lion-glow opacity-80"
      />
      <p className="text-sm uppercase tracking-[0.2em] text-text-secondary">
        Signing out…
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Verify** — `bun test && bunx tsc --noEmit` green; dev-smoke `/login` (ember at reduced intensity, Discord button, redirect still works) and sign-out flow.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): rebuild login and signout with reduced-intensity ember treatment"
```

---

### Task 18: Privacy + Terms rebuild

**Files:**
- Modify: `packages/web/app/(public)/privacy/page.tsx`
- Modify: `packages/web/app/(public)/terms/page.tsx`

**Interfaces:**
- Consumes: `PublicPageHeading`. ALL legal prose is preserved byte-for-byte — this task touches only chrome and heading markup.

- [ ] **Step 1: For each of the two pages:**
  1. Delete the fixed `<nav>...</nav>` block and its now-unused imports (`NavAuthButton`, `Image`; keep `Link` only if the prose uses it).
  2. Replace the page's own `<h1>`/ornament header with `<PublicPageHeading title="Privacy Policy" />` (respectively `title="Terms of Service"`), importing it.
  3. Wrap content as `<main className="mx-auto max-w-3xl px-6 pb-16 pt-28">`.
  4. Do NOT touch the prose sections/copy.

- [ ] **Step 2: Verify** — `bun test && bunx tsc --noEmit`; dev-smoke both pages, both themes.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(web): adopt shared public chrome on privacy and terms"
```

---

### Task 19: Global error + 404 rebuild

**Files:**
- Modify: `packages/web/app/error.tsx` (full replacement below)
- Modify: `packages/web/app/not-found.tsx` (full replacement below)

**Interfaces:**
- These render OUTSIDE both shells (root layout only). `error.tsx` MUST keep the `logClientError` auto-logging effect exactly as-is. Both must be theme-correct (no hardcoded `#08080a`), and stop using `geo-line`/`glow-button`/`noise-overlay`.

- [ ] **Step 1: Replace `app/error.tsx`:**

```tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { logClientError } from "@/lib/log-actions";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logClientError({
      message: error.message,
      name: error.name,
      stack: error.stack,
      digest: error.digest,
      path: typeof window !== "undefined" ? window.location.pathname : undefined,
    }).catch(() => {});
  }, [error]);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg-primary px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-bg-primary)_70%)]" />

      <div className="relative z-10 mx-auto max-w-lg text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-danger/20 bg-danger/5 px-5 py-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-danger/80">
            Error
          </span>
        </div>

        <h1 className="font-display mb-4 text-4xl font-bold tracking-[0.08em] text-text-primary sm:text-5xl">
          SOMETHING WENT WRONG
        </h1>

        <div
          className="mx-auto mb-6 h-px w-32 bg-gradient-to-r from-transparent via-accent/50 to-transparent"
          aria-hidden="true"
        />

        <p className="mb-10 text-text-secondary">
          An unexpected error occurred. Please try again or return to the home
          page.
        </p>

        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="rounded-sm border border-border bg-bg-tertiary px-8 py-3 text-sm font-semibold tracking-wide text-text-secondary transition-colors hover:border-accent/40 hover:text-text-primary"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="rounded-sm border border-accent bg-accent px-8 py-3 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
          >
            Return Home
          </Link>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `app/not-found.tsx`:**

```tsx
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-bg-primary px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-bg-primary)_70%)]" />

      <div className="relative z-10 mx-auto max-w-lg text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-5 py-1.5">
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-accent/80">
            404
          </span>
        </div>

        <h1 className="font-display mb-4 text-4xl font-bold tracking-[0.08em] text-text-primary sm:text-5xl">
          PAGE NOT FOUND
        </h1>

        <div
          className="mx-auto mb-6 h-px w-32 bg-gradient-to-r from-transparent via-accent/50 to-transparent"
          aria-hidden="true"
        />

        <p className="mb-10 text-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist or has been
          moved.
        </p>

        <Link
          href="/"
          className="rounded-sm border border-accent bg-accent px-8 py-3 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify** — `bun test && bunx tsc --noEmit`; dev-smoke `http://localhost:3000/definitely-not-a-page` in BOTH themes (this was the dark-only-hex offender), and confirm error.tsx still logs (check the API log-actions endpoint receives the POST, or at minimum that the effect code is unchanged).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(web): rebuild global error and 404 pages theme-correct"
```

---

### Task 20: Wave cleanup + release prep

**Files:**
- Delete: `packages/web/components/nav-auth-button.tsx`
- Modify: `packages/web/app/globals.css` (remove dead utilities)
- Modify: `package.json` (root — version bump)

- [ ] **Step 1: Delete NavAuthButton** — `grep -rn "nav-auth-button" packages/web` must show ZERO imports (all 8 legacy headers deleted in Tasks 12-18). Then `git rm packages/web/components/nav-auth-button.tsx`.

- [ ] **Step 2: Purge dead CSS utilities.** For each of `glow-button`, `geo-line`, `animate-fade-in-up`, `animate-fade-in`, `animate-shimmer`, `animate-pulse-glow`, `animate-float`, `animate-scroll-hint`, `animate-spin-slow`: run `grep -rn "<name>" packages/web --include="*.tsx"`. If zero usages, delete its class block AND its `@keyframes` from `globals.css`. KEEP `.noise-overlay` (hero grain is sanctioned) and `.facet-border` (used by admin pages + rebuilt public cards). KEEP `line-draw` only if referenced.

- [ ] **Step 3: Verify the full wave** — from `packages/web`: `bun test` (all suites) and `bunx tsc --noEmit`. Then `bun run dev` and walk the per-page checklist for: `/`, `/server`, `/matches`, a ticket URL (or its error state), a prospect URL (or its error state), `/login`, `/privacy`, `/terms`, a 404 URL — each in dark AND parchment, desktop AND 375px.

- [ ] **Step 4: Bump the version (wave ships as a minor).** In root `package.json`: `"version": "2.5.0"` → `"version": "2.6.0"`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore(web): phase 1 cleanup, drop dead public chrome and bump to 2.6.0"
```

- [ ] **Step 6: Report.** Phase 1 is complete on `integration/gilded-regiment`. Do NOT push — deployment to Railway (staging+prod simultaneously) is the user's explicit call.

---

## Self-review notes (already applied)

- Spec coverage: hero (grade/fallback/copy-bottom-left/embers/telemetry ✓ Tasks 9-12), sections with one-time reveals ✓ (12), server Connect removal ✓ (13, spec-default), matches graded thumbs ✓ (14), ticket/prospect incl. DiscordEmbed treatment ✓ (15-16), login/signout reduced ember ✓ (17), privacy/terms ✓ (18), error/404 outside shells + auto-logging preserved ✓ (19), PublicHeader rollout deleting 8 hand-rolled headers ✓ (3 + 12-18), footer tech-links removal ✓ (4), cookie-consent restyle ✓ (4), LiveSnapshot deleted in the landing wave ✓ (12), theme toggle stays on /settings (no new public toggle — optional work, skipped).
- The spec's "count-up on telemetry numbers" is documented as intentionally reduced to static first paint in Task 11 (constraint-safe); revisit only if the user asks for it.
- Type consistency: `StatusVariant` (Task 2) is imported by Tasks 11/12/14/16; `TelemetryFetchers` names match `getServerStatus`/`getAdminTeamCount`/`getPublicMatches` signatures; `getMapThumbnailUrls` consumed by 12/14 comes from Task 5's lib.
- Placeholders: none — every code step carries the actual code; page tasks that "keep current JSX" enumerate the exact deltas instead.
