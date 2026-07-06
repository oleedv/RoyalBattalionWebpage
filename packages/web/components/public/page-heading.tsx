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
