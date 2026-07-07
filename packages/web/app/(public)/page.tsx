import Link from "next/link";
import { EmberHero } from "@/components/public/ember-hero";
import { HeroTelemetry } from "@/components/public/hero-telemetry";
import { Reveal } from "@/components/public/reveal";
import { DiscordIcon } from "@/components/public/discord-icon";
import {
  ServersSection,
  RecentMatchesSection,
  WhitelistSection,
  DiscordCtaSection,
} from "./landing-sections";

/** Set to an in-game screenshot path (e.g. "/img/hero/main.jpg") when RB
 * supplies one; null keeps the abstract gradient fallback. */
const HERO_IMAGE: string | null = null;

export default function HomePage() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="noise-overlay relative flex min-h-screen flex-col justify-end overflow-hidden">
        {/* Backdrop: graded screenshot, or abstract fallback */}
        {HERO_IMAGE ? (
          <div className="graded-media absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HERO_IMAGE}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(color-mix(in srgb, var(--color-accent) 50%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-accent) 50%, transparent) 1px, transparent 1px)",
                backgroundSize: "80px 80px",
              }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,var(--color-bg-primary)_70%)]" />
          </div>
        )}

        {/* Ember lion, center-right (desktop only) */}
        <div className="pointer-events-none absolute right-[6%] top-1/2 hidden -translate-y-[60%] lg:block">
          <EmberHero size={380} />
        </div>

        {/* Copy, bottom-left */}
        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-28 pt-32 sm:pb-32">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.3em] text-accent/80">
            Squad Gaming Community
          </p>
          <h1 className="font-display mb-6 text-5xl font-black leading-[0.95] tracking-[0.06em] text-text-primary sm:text-7xl lg:text-8xl">
            ROYAL
            <br />
            <span className="text-accent">BATTALION</span>
          </h1>
          <div
            className="mb-6 h-px w-48 bg-gradient-to-r from-accent/60 to-transparent"
            aria-hidden="true"
          />
          <p className="mb-10 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
            Tactical Squad across two community servers. Active admins,
            organized rounds and priority whitelist earned by helping keep the
            lights on.
          </p>
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/server"
              className="inline-flex items-center justify-center gap-2.5 rounded-sm border border-accent bg-accent px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.1em] text-bg-primary transition-colors hover:bg-accent-bright focus-visible:outline-2 focus-visible:outline-accent"
            >
              Connect to Server
            </Link>
            <a
              href="https://discord.gg/royalbattalion"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 rounded-sm bg-(--color-discord) px-8 py-3.5 text-sm font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:opacity-90"
            >
              <DiscordIcon className="h-5 w-5" />
              Join Discord
            </a>
          </div>
        </div>

        {/* Telemetry strip pinned to the hero base */}
        <div className="relative z-10">
          <HeroTelemetry />
        </div>
      </section>

      {/* Scroll-revealed sections */}
      <Reveal>
        <ServersSection />
      </Reveal>
      <Reveal delay={80}>
        <RecentMatchesSection />
      </Reveal>
      <Reveal delay={80}>
        <WhitelistSection />
      </Reveal>
      <Reveal delay={80}>
        <DiscordCtaSection />
      </Reveal>
    </div>
  );
}
