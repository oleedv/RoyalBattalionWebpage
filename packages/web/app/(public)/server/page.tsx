import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Server Status - Royal Battalion",
  description: "Royal Battalion Squad server status and connection information.",
};

export default function ServerPage() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="border-b border-border bg-bg-primary/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="text-xl font-bold tracking-wide text-accent"
          >
            ROYAL BATTALION
          </Link>
          <div className="flex items-center gap-6">
            <Link
              href="/"
              className="text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              Home
            </Link>
            <Link
              href="/login"
              className="rounded border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20"
            >
              Login
            </Link>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-16">
        {/* Server IP */}
        <section className="mb-16 text-center">
          <h1 className="mb-4 text-4xl font-bold">Server Status</h1>
          <p className="mb-8 text-text-secondary">
            Live information for the Royal Battalion Squad server.
          </p>
          <div className="mx-auto flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
            <div className="rounded border border-border bg-bg-secondary px-10 py-6 text-center">
              <div className="mb-2 text-xs font-medium tracking-widest text-text-muted uppercase">
                Main Server
              </div>
              <code className="text-2xl font-bold tracking-wide text-accent">
                37.153.157.204:27050
              </code>
              <a
                href="steam://connect/37.153.157.204:27050"
                className="mt-4 inline-flex items-center gap-2 rounded border border-accent bg-accent/10 px-6 py-2.5 text-sm font-semibold tracking-wide text-accent transition-colors hover:bg-accent/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                </svg>
                Connect
              </a>
            </div>
            <div className="rounded border border-border bg-bg-secondary px-10 py-6 text-center">
              <div className="mb-2 text-xs font-medium tracking-widest text-text-muted uppercase">
                Battle Server
              </div>
              <code className="text-2xl font-bold tracking-wide text-accent">
                37.153.157.204:27060
              </code>
              <a
                href="steam://connect/37.153.157.204:27060"
                className="mt-4 inline-flex items-center gap-2 rounded border border-accent bg-accent/10 px-6 py-2.5 text-sm font-semibold tracking-wide text-accent transition-colors hover:bg-accent/20"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                </svg>
                Connect
              </a>
            </div>
          </div>
          <div className="mt-4 text-sm text-text-secondary">
            Search for &quot;Royal Battalion&quot; in the Squad server browser
          </div>
        </section>

        {/* Battlemetrics Widget */}
        <section className="mb-16">
          <h2 className="mb-6 text-2xl font-bold">Live Server Widget</h2>
          <iframe
            src="https://cdn.battlemetrics.com/b/standardVertical/27560507.html?foreground=%23EEEEEE&linkColor=%231185ec&lines=%23333333&background=%23222222&chart=players%3A24H&chartColor=%23FF0700&maxPlayersHeight=300"
            className="w-full rounded border border-border"
            style={{ height: 600 }}
            frameBorder="0"
          />
        </section>

        {/* Server Details */}
        <section>
          <h2 className="mb-6 text-2xl font-bold">Server Details</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { label: "Game", value: "Squad" },
              { label: "IP Address", value: "37.153.157.204" },
              { label: "Max Players", value: "100" },
              { label: "Region", value: "Europe" },
              { label: "Tickrate", value: "Standard" },
              { label: "Administration", value: "Active" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded border border-border bg-bg-secondary p-4"
              >
                <div className="mb-1 text-xs font-medium tracking-widest text-text-muted uppercase">
                  {item.label}
                </div>
                <div className="text-lg font-semibold text-text-primary">
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
