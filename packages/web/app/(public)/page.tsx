import Link from "next/link";
import Image from "next/image";
import { NavAuthButton } from "@/components/nav-auth-button";
import { LiveSnapshot } from "@/components/live-snapshot";

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/50 bg-bg-primary/60 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:h-18 sm:px-6">
          <Link href="/" className="flex items-center gap-2 sm:gap-3">
            <Image
              src="/img/rb_newlion2024_4_RS.png"
              alt="Royal Battalion"
              width={32}
              height={32}
              className="rounded-sm sm:h-9 sm:w-9"
            />
            <span className="font-display text-sm font-semibold tracking-[0.15em] text-accent sm:text-lg">
              ROYAL BATTALION
            </span>
          </Link>
          <div className="flex items-center gap-3 sm:gap-6">
            <Link
              href="/server"
              className="hidden text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent sm:block"
            >
              Server
            </Link>
            <Link
              href="/matches"
              className="hidden text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent sm:block"
            >
              Matches
            </Link>
            <NavAuthButton className="glow-button relative rounded-sm border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-accent transition-all hover:bg-accent/20 hover:border-accent/60 sm:px-5 sm:py-2 sm:text-sm" />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="noise-overlay relative flex min-h-screen flex-col items-center justify-center px-4 pt-14 sm:px-6 sm:pt-18">
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
          <div className="animate-fade-in-up delay-200 mb-6 inline-flex items-center gap-3 rounded-full border border-accent/20 bg-accent/5 px-5 py-1.5">
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
            Tactical Squad across two community servers. Active admins,
            organized rounds and priority whitelist earned by helping keep the
            lights on.
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
            <Link
              href="/server"
              className="glow-button group relative inline-flex items-center gap-2.5 rounded-sm border border-accent bg-accent px-8 py-3.5 text-sm font-semibold tracking-wide text-bg-primary transition-all hover:bg-accent-bright hover:shadow-[0_0_30px_rgba(200,168,78,0.3)]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
              </svg>
              Connect to Server
            </Link>
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
            <Link
              href="/server"
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
            </Link>

            {/* Battle Server Button */}
            <Link
              href="/server"
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
            </Link>
          </div>
        </div>
      </section>

      {/* Live Snapshot */}
      <section className="relative border-t border-border bg-bg-secondary py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(200,168,78,0.5) 1px, transparent 0)",
            backgroundSize: "30px 30px",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-6">
          <div className="mb-12 flex flex-col items-center gap-3 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/5 px-4 py-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
              </span>
              <span className="text-[10px] font-medium tracking-[0.25em] text-accent/80 uppercase">
                Live
              </span>
            </div>
            <h2 className="font-display text-3xl font-bold tracking-wide sm:text-4xl">
              Right Now on the Field
            </h2>
            <p className="max-w-md text-sm text-text-secondary">
              The state of Royal Battalion at this exact moment.
            </p>
          </div>
          <LiveSnapshot />
        </div>
      </section>
    </div>
  );
}
