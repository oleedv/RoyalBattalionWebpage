import Link from "next/link";
import Image from "next/image";

const FEATURES = [
  {
    title: "Active Squad Server",
    description:
      "Join our 100-player Squad server with active administration, balanced teams, and a strong tactical community.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008zm-3 6h.008v.008h-.008v-.008zm0-6h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    title: "Organized Gameplay",
    description:
      "We run regular events, training sessions, and competitive matches for clan members at all skill levels.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    title: "Priority Whitelist",
    description:
      "Members get priority queue access to our server through our automated whitelisting system linked to Discord.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: "Active Community",
    description:
      "Our Discord is home to a growing community of Squad players who value teamwork and communication.",
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-bg-primary/60 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/img/rb_newlion2024_4_RS.png"
              alt="Royal Battalion"
              width={36}
              height={36}
              className="rounded-sm"
            />
            <span className="font-display text-lg font-semibold tracking-[0.15em] text-accent">
              ROYAL BATTALION
            </span>
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/server"
              className="text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent"
            >
              Server
            </Link>
            <Link
              href="/login"
              className="glow-button relative rounded-sm border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-semibold tracking-wide text-accent transition-all hover:bg-accent/20 hover:border-accent/60"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="noise-overlay relative flex min-h-screen flex-col items-center justify-center px-6 pt-18">
        {/* Background geometric grid */}
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

        {/* Golden radiance behind logo */}
        <div
          className="animate-pulse-glow pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] rounded-full sm:h-[600px] sm:w-[600px]"
          style={{
            background:
              "radial-gradient(circle, rgba(200,168,78,0.15) 0%, rgba(200,168,78,0.05) 40%, transparent 70%)",
          }}
        />

        {/* Diagonal accent lines */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -left-20 top-1/4 h-px w-60 opacity-20"
            style={{
              background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
              transform: "rotate(-30deg)",
            }}
          />
          <div
            className="absolute -right-20 top-1/3 h-px w-60 opacity-20"
            style={{
              background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
              transform: "rotate(30deg)",
            }}
          />
          <div
            className="absolute -left-10 bottom-1/3 h-px w-40 opacity-10"
            style={{
              background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
              transform: "rotate(-20deg)",
            }}
          />
          <div
            className="absolute -right-10 bottom-1/4 h-px w-40 opacity-10"
            style={{
              background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)",
              transform: "rotate(20deg)",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl text-center">
          {/* Logo */}
          <div className="animate-fade-in-up mb-8 flex justify-center">
            <div className="relative">
              <Image
                src="/img/rb_newlion2024_4_RS.png"
                alt="Royal Battalion"
                width={200}
                height={200}
                className="animate-float relative z-10 drop-shadow-[0_0_40px_rgba(200,168,78,0.3)]"
                priority
              />
              {/* Geometric frame around logo */}
              <div className="absolute inset-[-20px] border border-accent/10 rotate-45 rounded-sm" />
              <div className="absolute inset-[-35px] border border-accent/5 rotate-45 rounded-sm" />
            </div>
          </div>

          {/* Badge */}
          <div className="animate-fade-in-up delay-200 mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-5 py-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-xs font-medium tracking-[0.2em] text-accent/80 uppercase">
              Squad Gaming Community
            </span>
          </div>

          {/* Title */}
          <h1 className="animate-fade-in-up delay-300 mb-6">
            <span className="font-display block text-5xl font-bold tracking-[0.08em] text-text-primary sm:text-7xl lg:text-8xl">
              ROYAL
            </span>
            <span className="font-display block text-5xl font-bold tracking-[0.08em] sm:text-7xl lg:text-8xl animate-shimmer">
              BATTALION
            </span>
          </h1>

          {/* Decorative line */}
          <div className="animate-fade-in-up delay-400 mx-auto mb-8 w-48">
            <div className="geo-line" />
            <div className="mx-auto mt-2 flex items-center justify-center gap-1">
              <div className="h-1 w-1 rotate-45 bg-accent/40" />
              <div className="h-1.5 w-1.5 rotate-45 bg-accent/60" />
              <div className="h-1 w-1 rotate-45 bg-accent/40" />
            </div>
          </div>

          <p className="animate-fade-in-up delay-500 mx-auto mb-10 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
            A tactical gaming community built around Squad. Dedicated servers,
            active admins, organized events, and priority whitelist for members.
          </p>

          {/* CTA Buttons */}
          <div className="animate-fade-in-up delay-600 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href="https://discord.gg/royalbattalion"
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-2.5 rounded-sm bg-[#5865F2] px-8 py-3.5 text-sm font-semibold tracking-wide text-white transition-all hover:bg-[#4752C4] hover:shadow-[0_0_30px_rgba(88,101,242,0.3)]"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
              </svg>
              Join Discord
            </a>
            <a
              href="steam://connect/37.153.157.204:27050"
              className="glow-button group relative inline-flex items-center gap-2.5 rounded-sm border border-accent bg-accent px-8 py-3.5 text-sm font-semibold tracking-wide text-bg-primary transition-all hover:bg-accent-bright hover:shadow-[0_0_30px_rgba(200,168,78,0.3)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
              </svg>
              Connect to Server
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fade-in delay-800">
          <div className="flex flex-col items-center gap-2">
            <span className="text-[10px] font-medium tracking-[0.3em] text-text-muted uppercase">Scroll</span>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-accent/50 animate-scroll-hint">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      </section>

      {/* Server Connect Section */}
      <section className="relative border-y border-border bg-bg-secondary py-20">
        {/* Subtle texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage:
              "linear-gradient(135deg, rgba(200,168,78,0.5) 1px, transparent 1px), linear-gradient(225deg, rgba(200,168,78,0.5) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-6">
          <div className="mb-10 text-center">
            <h2 className="font-display mb-3 text-3xl font-bold tracking-wide sm:text-4xl">
              Join the Fight
            </h2>
            <p className="text-text-secondary">
              Connect directly through Steam or search &quot;Royal Battalion&quot; in the server browser.
            </p>
          </div>

          <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
            {/* Main Server Button */}
            <a
              href="steam://connect/37.153.157.204:27050"
              className="facet-border group relative flex w-full max-w-xs flex-col items-center gap-3 rounded-sm bg-bg-card px-8 py-7 transition-all hover:bg-bg-card-hover hover:shadow-[0_0_40px_rgba(200,168,78,0.08)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/20 bg-accent/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-accent">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium tracking-[0.2em] text-text-muted uppercase mb-1">Main Server</div>
                <div className="font-display text-lg font-semibold text-text-primary tracking-wide">Royal Battalion</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-accent/30 bg-accent/10 px-5 py-2 text-sm font-semibold tracking-wide text-accent transition-colors group-hover:bg-accent/20 group-hover:border-accent/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                </svg>
                Connect via Steam
              </div>
            </a>

            {/* Battle Server Button */}
            <a
              href="steam://connect/37.153.157.204:27060"
              className="facet-border group relative flex w-full max-w-xs flex-col items-center gap-3 rounded-sm bg-bg-card px-8 py-7 transition-all hover:bg-bg-card-hover hover:shadow-[0_0_40px_rgba(200,168,78,0.08)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full border border-accent/20 bg-accent/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 text-accent">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium tracking-[0.2em] text-text-muted uppercase mb-1">Battle Server</div>
                <div className="font-display text-lg font-semibold text-text-primary tracking-wide">RB Battle</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-accent/30 bg-accent/10 px-5 py-2 text-sm font-semibold tracking-wide text-accent transition-colors group-hover:bg-accent/20 group-hover:border-accent/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                </svg>
                Connect via Steam
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative py-28">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 text-center">
            <div className="mb-4 flex items-center justify-center gap-3">
              <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/40" />
              <div className="h-1.5 w-1.5 rotate-45 bg-accent/50" />
              <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/40" />
            </div>
            <h2 className="font-display mb-4 text-3xl font-bold tracking-wide sm:text-4xl">
              Why Royal Battalion
            </h2>
            <p className="mx-auto max-w-xl text-text-secondary">
              More than just a server -- a community of tactical players
              who value coordination, communication, and fair play.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature, i) => (
              <div
                key={feature.title}
                className="facet-border group rounded-sm bg-bg-card p-7 transition-all hover:bg-bg-card-hover hover:shadow-[0_0_40px_rgba(200,168,78,0.05)]"
              >
                <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-sm border border-accent/15 bg-accent/8 text-accent transition-colors group-hover:bg-accent/15">
                  {feature.icon}
                </div>
                <h3 className="font-display mb-2 text-base font-semibold tracking-wide text-text-primary">
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
      <section className="relative border-t border-border bg-bg-secondary py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(200,168,78,0.5) 1px, transparent 0)",
            backgroundSize: "30px 30px",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <div className="mb-6 flex justify-center">
            <Image
              src="/img/rb_newlion2024_4_RS.png"
              alt=""
              width={60}
              height={60}
              className="opacity-60"
            />
          </div>
          <h2 className="font-display mb-4 text-3xl font-bold tracking-wide sm:text-4xl">
            Ready to Join?
          </h2>
          <p className="mb-10 text-text-secondary text-lg">
            Hop on our Discord, link your Steam account, and get whitelisted to
            join the fight.
          </p>
          <a
            href="https://discord.gg/royalbattalion"
            target="_blank"
            rel="noopener noreferrer"
            className="glow-button inline-flex items-center gap-2.5 rounded-sm bg-accent px-10 py-4 text-sm font-semibold tracking-wide text-bg-primary transition-all hover:bg-accent-bright hover:shadow-[0_0_40px_rgba(200,168,78,0.25)]"
          >
            Get Started
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center gap-5">
            <Image
              src="/img/rb_newlion2024_4_RS.png"
              alt="Royal Battalion"
              width={28}
              height={28}
              className="opacity-40"
            />
            <p className="text-sm text-text-muted">
              Royal Battalion. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-text-muted">
              <span>Built with</span>
              {["Next.js", "Tailwind CSS", "Hono", "Prisma", "MariaDB", "Bun"].map(
                (tech) => (
                  <span
                    key={tech}
                    className="rounded-sm border border-border bg-bg-tertiary px-2 py-0.5"
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
