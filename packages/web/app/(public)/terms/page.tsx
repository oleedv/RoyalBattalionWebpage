import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { NavAuthButton } from "@/components/nav-auth-button";

export const metadata: Metadata = {
  title: "Terms of Service - Royal Battalion",
  description: "Terms of Service for the Royal Battalion website and services.",
};

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="mb-10 text-sm text-text-muted">
          Last updated: February 25, 2026
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              1. Acceptance of Terms
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                By accessing or using the Royal Battalion website and services,
                you agree to be bound by these Terms of Service. If you do not
                agree to these terms, do not use our services.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              2. Description of Service
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                Royal Battalion operates a community management platform for our
                Squad gaming clan. Our services include server management,
                player whitelisting, match tracking, and community
                administration tools. These services are provided on a
                voluntary, best-effort basis.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              3. Account
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                Access to certain features requires authentication through
                Discord OAuth. You are responsible for maintaining the security
                of your Discord account. We are not responsible for any
                unauthorized access resulting from your failure to protect your
                account credentials.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              4. Acceptable Use
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>You agree not to:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  Use cheats, hacks, exploits, or any unauthorized third-party
                  software on our game servers
                </li>
                <li>
                  Harass, threaten, or abuse other community members
                </li>
                <li>
                  Engage in hate speech, discrimination, or any form of toxic
                  behavior
                </li>
                <li>
                  Exploit bugs or vulnerabilities in the website or game servers
                </li>
                <li>
                  Impersonate administrators or other community members
                </li>
                <li>
                  Attempt to gain unauthorized access to restricted areas of the
                  website or services
                </li>
                <li>
                  Use the services for any illegal or unauthorized purpose
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              5. Community Rules
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                All members are expected to follow the server rules posted in
                our Discord server and in-game. Administrative decisions
                regarding rule enforcement are final. Repeated or severe
                violations may result in permanent removal from the community.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              6. Whitelist Terms
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                Server whitelist access is a privilege granted at the discretion
                of Royal Battalion administrators. Whitelist access is linked to
                your Discord membership and Steam ID. We reserve the right to
                revoke whitelist access at any time and for any reason, including
                but not limited to rule violations or inactivity.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              7. Intellectual Property
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                The Royal Battalion name, logo, and branding are the property of
                Royal Battalion. Squad is a trademark of Offworld Industries.
                Steam is a trademark of Valve Corporation. All other trademarks
                are property of their respective owners. Royal Battalion is not
                affiliated with Valve Corporation or Offworld Industries.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              8. Disclaimer of Warranties
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                Our services are provided &ldquo;as is&rdquo; and &ldquo;as
                available&rdquo; without warranties of any kind, either express
                or implied. We do not guarantee that the services will be
                uninterrupted, error-free, or available at all times. This is a
                volunteer community project and service availability depends on
                the availability of our team.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              9. Limitation of Liability
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                Royal Battalion and its administrators shall not be liable for
                any direct, indirect, incidental, special, or consequential
                damages arising from your use of, or inability to use, our
                services. This includes but is not limited to loss of data, loss
                of game progress, or any other losses resulting from service
                interruptions.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              10. Modifications
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                We reserve the right to modify these terms at any time. Changes
                will be posted on this page with an updated revision date. Your
                continued use of the services after any modifications
                constitutes acceptance of the updated terms.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              11. Termination
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                We reserve the right to terminate or suspend your access to our
                services at any time, with or without notice, for conduct that
                we believe violates these terms or is harmful to the community,
                other users, or third parties.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              12. Contact
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                If you have questions about these terms, please reach out to us
                via the{" "}
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
