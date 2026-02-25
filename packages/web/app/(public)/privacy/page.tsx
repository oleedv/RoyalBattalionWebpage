import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { NavAuthButton } from "@/components/nav-auth-button";

export const metadata: Metadata = {
  title: "Privacy Policy - Royal Battalion",
  description: "Privacy Policy for the Royal Battalion website and services.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen">
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

      <main className="mx-auto max-w-3xl px-6 pt-28 pb-16">
        <h1 className="font-display mb-8 text-3xl font-bold tracking-wide">
          Privacy Policy
        </h1>
        <p className="mb-10 text-sm text-text-muted">
          Last updated: February 25, 2026
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              1. Information We Collect
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                When you use the Royal Battalion website and services, we may
                collect the following information:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-text-primary">Discord Account Data</strong>{" "}
                  &mdash; When you sign in via Discord OAuth, we receive your
                  Discord username, avatar, and Discord user ID. We do not
                  receive your Discord password.
                </li>
                <li>
                  <strong className="text-text-primary">Steam ID</strong>{" "}
                  &mdash; Your Steam ID is collected through our SquadJS game
                  server integration for player identification and whitelist
                  management.
                </li>
                <li>
                  <strong className="text-text-primary">EOS ID</strong>{" "}
                  &mdash; Your Epic Online Services ID may be collected through
                  game server connections.
                </li>
                <li>
                  <strong className="text-text-primary">Match Statistics</strong>{" "}
                  &mdash; Gameplay data including kills, deaths, revives,
                  teamkills, roles, and squads is recorded automatically during
                  matches on our servers.
                </li>
                <li>
                  <strong className="text-text-primary">IP Addresses</strong>{" "}
                  &mdash; Collected through standard web server logs and game
                  server connections.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              2. How We Use Your Information
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>We use the information we collect to:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Authenticate your access to the management dashboard</li>
                <li>
                  Manage server whitelist and priority queue access
                </li>
                <li>Track and display match statistics</li>
                <li>
                  Administer the community, including audit logs of
                  administrative actions
                </li>
                <li>Improve the server and community experience</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              3. Cookies and Local Storage
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>We use the following cookies and local storage items:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-text-primary">Session Cookie</strong>{" "}
                  &mdash; A session cookie set by NextAuth is required for
                  authentication. This is an essential cookie and cannot be
                  disabled.
                </li>
                <li>
                  <strong className="text-text-primary">Theme Preference</strong>{" "}
                  &mdash; Your selected theme (dark/light) is stored in your
                  browser&apos;s local storage. This data is not transmitted to our
                  servers.
                </li>
                <li>
                  <strong className="text-text-primary">Cookie Consent</strong>{" "}
                  &mdash; Your cookie consent status is stored in local storage.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              4. Third-Party Services
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>We integrate with the following third-party services:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-text-primary">Discord</strong>{" "}
                  &mdash; Used as our authentication provider. When you sign in,
                  data is shared with Discord in accordance with their privacy
                  policy.
                </li>
                <li>
                  <strong className="text-text-primary">SquadJS</strong>{" "}
                  &mdash; Our game server integration collects Steam IDs and
                  match data from the Squad game server. This is not the Steam
                  Web API.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              5. Data Retention
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Account data is retained while your Discord account is linked
                  and you are a member of the community.
                </li>
                <li>
                  Match statistics are retained indefinitely for historical
                  record purposes.
                </li>
                <li>
                  Session cookies expire according to their configured lifetime.
                </li>
                <li>
                  You may request deletion of your personal data at any time by
                  contacting us via Discord.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              6. Your Rights
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>You have the right to:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Request access to your personal data</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your personal data</li>
                <li>Withdraw consent for non-essential data processing</li>
              </ul>
              <p>
                To exercise any of these rights, please contact us through the
                Royal Battalion Discord server.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              7. Data Security
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                We take reasonable measures to protect your personal data from
                unauthorized access, alteration, disclosure, or destruction.
                However, no method of electronic storage or transmission over
                the internet is 100% secure.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              8. Changes to This Policy
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                We may update this privacy policy from time to time. Changes
                will be posted on this page with an updated revision date. Your
                continued use of the website after any changes constitutes
                acceptance of the updated policy.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              9. Contact
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                If you have questions about this privacy policy or your personal
                data, please reach out to us via the{" "}
                <a
                  href="https://discord.gg/royalbattalion"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Royal Battalion Discord server
                </a>
                .
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
