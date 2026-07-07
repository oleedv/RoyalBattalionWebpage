import Link from "next/link";

/** Styled permission-denied panel for gated pages (live-server monitor + console). */
export function AccessDeniedCard({
  title = "Insufficient Permissions",
  message,
  cta,
}: {
  title?: string;
  message: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="facet-border w-full max-w-md rounded-sm bg-bg-card p-8 text-center">
      <h1 className="font-display mb-3 text-xl font-bold tracking-wide text-text-primary">
        {title}
      </h1>
      <p className="text-sm text-text-secondary">{message}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-4 inline-block rounded-sm bg-accent px-6 py-2.5 text-sm font-semibold tracking-wide text-bg-primary transition-colors hover:bg-accent-bright"
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}
