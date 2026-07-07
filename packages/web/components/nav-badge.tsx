/** Count pill for a sidebar nav item (danger tone). On the collapsed icon
 * rail the pill hides and a small dot on the item shows instead. */
export function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <>
      <span
        data-slot="nav-badge-count"
        className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 font-mono text-[10px] font-bold leading-none text-destructive-foreground group-data-[collapsible=icon]:hidden"
      >
        {count > 99 ? "99+" : count}
      </span>
      <span
        data-slot="nav-badge-dot"
        aria-hidden="true"
        className="absolute right-1 top-1 hidden size-1.5 rounded-full bg-danger group-data-[collapsible=icon]:block"
      />
    </>
  );
}
