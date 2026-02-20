import Link from "next/link";

export default function NotFound() {
  return (
    <div className="noise-overlay relative flex min-h-screen flex-col items-center justify-center px-6">
      {/* Background grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(200,168,78,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(200,168,78,0.5) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />
      {/* Radial vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#08080a_65%)]" />

      <div className="relative z-10 mx-auto max-w-lg text-center">
        {/* Label */}
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-5 py-1.5">
          <span className="text-xs font-medium tracking-[0.2em] text-accent/80 uppercase">
            404
          </span>
        </div>

        <h1 className="font-display mb-4 text-4xl font-bold tracking-[0.08em] text-text-primary sm:text-5xl">
          PAGE NOT FOUND
        </h1>

        {/* Decorative line */}
        <div className="mx-auto mb-6 w-32">
          <div className="geo-line" />
          <div className="mx-auto mt-2 flex items-center justify-center gap-1">
            <div className="h-1 w-1 rotate-45 bg-accent/40" />
            <div className="h-1.5 w-1.5 rotate-45 bg-accent/60" />
            <div className="h-1 w-1 rotate-45 bg-accent/40" />
          </div>
        </div>

        <p className="mb-10 text-text-secondary">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/"
          className="glow-button inline-flex items-center gap-2 rounded-sm border border-accent bg-accent px-8 py-3 text-sm font-semibold tracking-wide text-bg-primary transition-all hover:bg-accent-bright hover:shadow-[0_0_30px_rgba(200,168,78,0.3)]"
        >
          Return Home
        </Link>
      </div>
    </div>
  );
}
