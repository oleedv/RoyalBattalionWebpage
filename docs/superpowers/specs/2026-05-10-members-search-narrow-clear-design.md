# Members Page — Narrower Search + Clear (X) Button

Date: 2026-05-10
Status: Approved

## Problem

The members page search input (`packages/web/app/(protected)/members/page.tsx:647-655`) is full-width, which feels oversized on wide screens, and offers no quick way to clear the current query other than selecting and deleting the text.

## Goal

Cap the search input at a sensible max width and add an inline "X" button that clears the search and refocuses the input.

## Non-Goals

- Changing the placeholder, padding, or text size.
- Changing search behavior (matched fields, debouncing, filters).

## Design

### Markup change

Current (line 647–655):

```tsx
<div className="mb-4">
  <input
    type="text"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Search by name, Steam ID, EOS ID, or Discord ID..."
    className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
  />
</div>
```

New:

```tsx
<div className="mb-4 relative w-full max-w-md">
  <input
    ref={searchInputRef}
    type="text"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="Search by name, Steam ID, EOS ID, or Discord ID..."
    className="w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
  />
  {search && (
    <button
      type="button"
      onClick={() => {
        setSearch("");
        searchInputRef.current?.focus();
      }}
      aria-label="Clear search"
      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-text-muted transition-colors hover:text-text-primary"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  )}
</div>
```

### Ref

Add `const searchInputRef = useRef<HTMLInputElement>(null);` near the existing `useState` hooks for the page.

### Width choice

`max-w-md` (28rem ≈ 448px). Rationale: input still comfortably fits the placeholder text on a single line at typical font size, but no longer dominates wide screens. Keep `w-full` so the input shrinks naturally on narrow screens.

### Padding choice

Reserve right-side padding (`pr-9`) unconditionally so the text never sits under the X when it's visible. The button position is `right-2` so the icon centers in that reserved space.

## Migration / Compatibility

None. Pure UI tweak.

## Testing

- Manual: type in the search — confirm input is capped at `max-w-md` width on a wide viewport and shrinks on a narrow viewport.
- Manual: type a query — confirm X appears; click it — confirm input clears and is refocused (cursor visible).
- Manual: empty search — confirm no X is rendered.
- Manual: existing filter behavior unchanged.

## Open Questions

None.
