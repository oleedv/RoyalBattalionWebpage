import Link from "next/link";

const FEATURES = [
  {
    title: "Active Squad Server",
    description:
      "Join our 100-player Squad server with active administration, balanced teams, and a strong tactical community.",
    icon: "SERVER",
  },
  {
    title: "Organized Gameplay",
    description:
      "We run regular events, training sessions, and competitive matches for clan members at all skill levels.",
    icon: "TACTICAL",
  },
  {
    title: "Whitelisting System",
    description:
      "Members get priority queue access to our server through our automated whitelisting system linked to Discord.",
    icon: "ACCESS",
  },
  {
    title: "Active Community",
    description:
      "Our Discord is home to a growing community of Squad players who value teamwork and communication.",
    icon: "COMMUNITY",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-bg-primary/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-wide text-accent">
              ROYAL BATTALION
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link
              href="/server"
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Server
            </Link>
            <Link
              href="/login"
              className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Login with Discord
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-16">
        {/* Background grid effect */}
        <div
          className="pointer-events-none absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "linear-gradient(rgba(200,168,78,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(200,168,78,0.3) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        {/* Radial gradient overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_0%,_#0a0a0a_70%)]" />

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-block rounded-full border border-accent/30 bg-accent/5 px-4 py-1.5 text-xs font-medium tracking-widest text-accent uppercase">
            Squad Gaming Clan
          </div>
          <h1 className="mb-6 text-5xl leading-tight font-extrabold tracking-tight sm:text-7xl">
            <span className="text-text-primary">ROYAL</span>
            <br />
            <span className="text-accent">BATTALION</span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-text-secondary">
            A tactical gaming community built around Squad. We run a dedicated
            server with active admins, organized events, and a priority
            whitelist system for our members.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="https://discord.gg/royalbattalion"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded bg-[#5865F2] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#4752C4]"
            >
              <svg
                className="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Join Discord
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded border border-accent bg-accent px-8 py-3 text-sm font-semibold text-bg-primary transition-colors hover:bg-accent-muted"
            >
              Login with Discord
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
          <div className="h-8 w-5 rounded-full border-2 border-text-muted">
            <div className="mx-auto mt-1.5 h-2 w-1 animate-bounce rounded-full bg-text-muted" />
          </div>
        </div>
      </section>

      {/* Server Info */}
      <section className="border-y border-border bg-bg-secondary py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center gap-8 md:flex-row md:justify-between">
            <div>
              <h2 className="mb-2 text-2xl font-bold text-text-primary">
                Server Information
              </h2>
              <p className="text-text-secondary">
                Connect directly or find us in the Squad server browser.
              </p>
            </div>
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="flex items-center gap-3 rounded border border-border bg-bg-tertiary px-6 py-3">
                <div className="text-center">
                  <div className="mb-0.5 text-[10px] font-medium tracking-widest text-text-muted uppercase">Main</div>
                  <code className="text-lg font-bold tracking-wide text-accent">37.153.157.204:27050</code>
                </div>
                <a
                  href="steam://connect/37.153.157.204:27050"
                  className="inline-flex items-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-accent transition-colors hover:bg-accent/20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                  </svg>
                  Connect
                </a>
              </div>
              <div className="flex items-center gap-3 rounded border border-border bg-bg-tertiary px-6 py-3">
                <div className="text-center">
                  <div className="mb-0.5 text-[10px] font-medium tracking-widest text-text-muted uppercase">Battle</div>
                  <code className="text-lg font-bold tracking-wide text-accent">37.153.157.204:27060</code>
                </div>
                <a
                  href="steam://connect/37.153.157.204:27060"
                  className="inline-flex items-center gap-1.5 rounded border border-accent bg-accent/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-accent transition-colors hover:bg-accent/20"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                    <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                  </svg>
                  Connect
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold">Why Royal Battalion</h2>
            <p className="mx-auto max-w-xl text-text-secondary">
              More than just a server -- we are a community of tactical players
              who value coordination, communication, and fair play.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group rounded border border-border bg-bg-secondary p-6 transition-all hover:border-border-accent hover:bg-bg-card"
              >
                <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded bg-accent/10 text-xs font-bold tracking-wider text-accent">
                  {feature.icon.charAt(0)}
                </div>
                <h3 className="mb-2 text-lg font-semibold text-text-primary">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-text-secondary">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-bg-secondary py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-4 text-3xl font-bold">Ready to Join?</h2>
          <p className="mb-8 text-text-secondary">
            Hop on our Discord, link your Steam account, and get whitelisted to
            join the fight.
          </p>
          <a
            href="https://discord.gg/royalbattalion"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded bg-accent px-8 py-3 text-sm font-semibold text-bg-primary transition-colors hover:bg-accent-muted"
          >
            Get Started
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-text-muted">
              Royal Battalion. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-text-muted">
              <span>Built with</span>
              {["Next.js", "Tailwind CSS", "Hono", "Prisma", "MariaDB", "Bun"].map(
                (tech) => (
                  <span
                    key={tech}
                    className="rounded border border-border bg-bg-tertiary px-2 py-0.5"
                  >
                    {tech}
                  </span>
                )
              )}
            </div>
            <p className="text-xs text-text-muted">
              Built by Ole
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
