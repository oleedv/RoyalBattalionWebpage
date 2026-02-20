import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Server Status - Royal Battalion",
  description: "Royal Battalion Squad server status and connection information.",
};

export default function ServerPage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="border-b border-border/50 bg-bg-primary/60 backdrop-blur-xl">
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
              href="/"
              className="text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent"
            >
              Home
            </Link>
            <Link
              href="/matches"
              className="text-sm font-medium text-text-secondary tracking-wide transition-colors hover:text-accent"
            >
              Matches
            </Link>
            <Link
              href="/login"
              className="glow-button rounded-sm border border-accent/40 bg-accent/10 px-5 py-2 text-sm font-semibold tracking-wide text-accent transition-all hover:bg-accent/20 hover:border-accent/60"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* Header */}
        <section className="mb-14 text-center">
          <div className="mb-4 flex items-center justify-center gap-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/40" />
            <div className="h-1.5 w-1.5 rotate-45 bg-accent/50" />
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/40" />
          </div>
          <h1 className="font-display mb-4 text-4xl font-bold tracking-wide sm:text-5xl">
            Server Status
          </h1>
          <p className="text-text-secondary text-lg">
            Live information for the Royal Battalion Squad servers.
          </p>
        </section>

        {/* Connect Cards */}
        <section className="mb-16">
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
            {/* Main Server */}
            <a
              href="steam://connect/37.153.157.204:27050"
              className="facet-border group relative flex w-full max-w-sm flex-col items-center gap-4 rounded-sm bg-bg-card px-10 py-8 transition-all hover:bg-bg-card-hover hover:shadow-[0_0_40px_rgba(200,168,78,0.08)]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-accent">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium tracking-[0.2em] text-text-muted uppercase mb-1">Main Server</div>
                <div className="font-display text-xl font-semibold text-text-primary tracking-wide">Royal Battalion</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-accent/30 bg-accent/10 px-6 py-2.5 text-sm font-semibold tracking-wide text-accent transition-colors group-hover:bg-accent/20 group-hover:border-accent/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                </svg>
                Connect via Steam
              </div>
            </a>

            {/* Battle Server */}
            <a
              href="steam://connect/37.153.157.204:27060"
              className="facet-border group relative flex w-full max-w-sm flex-col items-center gap-4 rounded-sm bg-bg-card px-10 py-8 transition-all hover:bg-bg-card-hover hover:shadow-[0_0_40px_rgba(200,168,78,0.08)]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-accent/20 bg-accent/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-accent">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
                </svg>
              </div>
              <div className="text-center">
                <div className="text-xs font-medium tracking-[0.2em] text-text-muted uppercase mb-1">Battle Server</div>
                <div className="font-display text-xl font-semibold text-text-primary tracking-wide">RB Battle</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-sm border border-accent/30 bg-accent/10 px-6 py-2.5 text-sm font-semibold tracking-wide text-accent transition-colors group-hover:bg-accent/20 group-hover:border-accent/50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                </svg>
                Connect via Steam
              </div>
            </a>
          </div>
          <div className="mt-6 text-center text-sm text-text-muted">
            Or search for &quot;Royal Battalion&quot; in the Squad server browser
          </div>
        </section>

        {/* Battlemetrics Widget */}
        <section className="mb-16">
          <div className="mb-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-accent/20 to-transparent" />
            <h2 className="font-display text-xl font-semibold tracking-wide text-text-primary">
              Live Status
            </h2>
            <div className="h-px flex-1 bg-gradient-to-l from-accent/20 to-transparent" />
          </div>
          <div className="facet-border overflow-hidden rounded-sm">
            <iframe
              src="https://cdn.battlemetrics.com/b/standardVertical/27560507.html?foreground=%23EEEEEE&linkColor=%23c8a84e&lines=%23222228&background=%23111114&chart=players%3A24H&chartColor=%23c8a84e&maxPlayersHeight=300"
              className="w-full"
              style={{ height: 600 }}
              frameBorder="0"
            />
          </div>
        </section>

        {/* Server Details */}
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
              { label: "Administration", value: "Active" },
              { label: "Whitelist", value: "Discord Linked" },
            ].map((item) => (
              <div
                key={item.label}
                className="facet-border rounded-sm bg-bg-card p-5 transition-colors hover:bg-bg-card-hover"
              >
                <div className="mb-1 text-[10px] font-medium tracking-[0.2em] text-text-muted uppercase">
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
    </div>
  );
}
