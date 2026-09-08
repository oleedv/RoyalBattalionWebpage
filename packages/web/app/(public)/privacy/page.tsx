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
        <p className="mb-6 text-sm text-text-muted">
          Last updated: 6 September 2026
        </p>
        <p className="mb-10 text-sm leading-relaxed text-text-secondary">
          Royal Battalion is the data controller for personal data described in
          this policy. We are a volunteer-run Squad gaming community based in
          the United Kingdom. We process personal data under the UK Data
          Protection Act 2018 and UK GDPR. This policy covers the website at
          royalbattalion.xyz, the Royal Secretary Discord bot, and our Squad
          game servers.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              1. Information We Collect
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>Depending on how you use the community, we may collect:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-text-primary">Discord account data</strong>{" "}
                  &mdash; user ID, username, display name, avatar, and roles.
                  When you sign in via Discord we receive the same identifiers.
                  We never receive your Discord password.
                </li>
                <li>
                  <strong className="text-text-primary">Steam and EOS IDs</strong>{" "}
                  &mdash; collected when you link Steam, apply to join, play on
                  our servers, or enter a giveaway.
                </li>
                <li>
                  <strong className="text-text-primary">Membership profile</strong>{" "}
                  &mdash; country, membership date, and preferences you set on
                  the dashboard.
                </li>
                <li>
                  <strong className="text-text-primary">Applications</strong>{" "}
                  &mdash; the answers you submit when you apply, plus later
                  staff notes, votes, and transcripts of that process.
                </li>
                <li>
                  <strong className="text-text-primary">Tickets and DMs to the bot</strong>{" "}
                  &mdash; the conversation (including attachments) and staff
                  actions on that ticket. Direct messages you send to Royal
                  Secretary are treated as staff records.
                </li>
                <li>
                  <strong className="text-text-primary">Discord messages</strong>{" "}
                  &mdash; a copy of human messages in guild channels the bot
                  can see, used for moderation.
                </li>
                <li>
                  <strong className="text-text-primary">Voice activity</strong>{" "}
                  &mdash; when you join or leave a voice channel. We do not
                  record voice audio.
                </li>
                <li>
                  <strong className="text-text-primary">Game-server data</strong>{" "}
                  &mdash; playtime, combat stats, in-game chat, player names,
                  Steam ID, and EOS ID from our Squad servers.
                </li>
                <li>
                  <strong className="text-text-primary">Whitelist, giveaways, and seeding</strong>{" "}
                  &mdash; entries and related grant records.
                </li>
                <li>
                  <strong className="text-text-primary">IP addresses</strong>{" "}
                  &mdash; from website logs and game-server connections.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              2. How We Use Your Information
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>We use this information to:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Run the Discord, website, and Squad servers</li>
                <li>Handle support tickets and recruitment applications</li>
                <li>Moderate Discord and in-game chat</li>
                <li>Manage whitelist, seeding rewards, and giveaways</li>
                <li>Show match statistics and member profiles to authorised staff</li>
                <li>
                  Ask Anthropic&apos;s Claude API to draft staff suggestions on
                  tickets, applications, and in-game chat (see section 5)
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              3. Legal Basis
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-text-primary">Legitimate interests</strong>{" "}
                  &mdash; running a gaming community, including moderation,
                  whitelist management, match tracking, and safety.
                </li>
                <li>
                  <strong className="text-text-primary">Contract</strong>{" "}
                  &mdash; providing membership, whitelist, and dashboard
                  features after you apply or sign in.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              4. Cookies
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                We only use cookies and local storage that are needed to run
                the site. We do not use tracking, analytics, or advertising
                cookies.
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-text-primary">Session cookie</strong>{" "}
                  &mdash; required to keep you signed in. This is an essential
                  cookie.
                </li>
                <li>
                  <strong className="text-text-primary">Preferences</strong>{" "}
                  &mdash; theme and similar settings stay in your browser.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              5. Anthropic (Claude)
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                We use the Anthropic API (Claude) as a processor to help staff
                review tickets, membership applications, and in-game chat.
                Royal Battalion remains the controller.
              </p>
              <p>When staff use these tools, Anthropic may receive:</p>
              <ul className="list-disc space-y-2 pl-6">
                <li>Ticket conversation text and attached images</li>
                <li>Application answers (alias, country, Steam ID, free text)</li>
                <li>In-game chat lines with player name, Steam ID, and EOS ID</li>
                <li>
                  Related lookups we already hold (Steam profile, BattleMetrics,
                  Community Ban List, playtime)
                </li>
              </ul>
              <p>
                We use Anthropic under its Commercial Terms, which include a
                Data Processing Addendum. Anthropic does not use API inputs or
                outputs to train its models unless we explicitly submit
                feedback, which we do not.
              </p>
              <p>
                Anthropic is based in the United States. Transfers from the UK
                are made under Anthropic&apos;s DPA, including the EU Standard
                Contractual Clauses and the UK International Data Transfer
                Addendum.
              </p>
              <p>
                Anthropic&apos;s own notices:{" "}
                <a
                  href="https://www.anthropic.com/legal/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Privacy Policy
                </a>
                {" "}and{" "}
                <a
                  href="https://www.anthropic.com/legal/commercial-terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Commercial Terms
                </a>
                .
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              6. Other Third Parties
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong className="text-text-primary">Discord</strong>{" "}
                  &mdash; the platform for the community and for website
                  sign-in. Discord is a separate controller for data on its
                  service.
                </li>
                <li>
                  <strong className="text-text-primary">Steam</strong>{" "}
                  &mdash; we look up public profile and ban information using
                  your Steam ID.
                </li>
                <li>
                  <strong className="text-text-primary">BattleMetrics</strong>{" "}
                  &mdash; we look up bans and flags associated with a Steam ID
                  when reviewing tickets or applications.
                </li>
                <li>
                  <strong className="text-text-primary">Community Ban List</strong>{" "}
                  &mdash; we query communitybanlist.com with a Steam ID for
                  risk rating and ban history.
                </li>
                <li>
                  <strong className="text-text-primary">Hosting</strong>{" "}
                  &mdash; the website and database are hosted by our
                  infrastructure provider.
                </li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              7. Age Requirement
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                We refuse anyone under the age of 18. These services are not
                for under-18s.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              8. Security
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                Staff access is limited to people with the relevant Discord or
                website roles. We take reasonable measures to protect personal
                data. No method of storage or transmission is perfectly secure.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              9. International Transfers
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                Some of the services above are in the United States or other
                countries outside the UK, including Anthropic, Discord, and
                Steam. For Anthropic we use the contractual clauses described
                in section 5. For the others, the transfer is whatever is
                required to use that service.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              10. Changes
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                We may update this page from time to time. The date at the top
                shows when it last changed.
              </p>
            </div>
          </section>

          <section>
            <h2 className="font-display mb-4 text-xl font-semibold tracking-wide text-text-primary">
              11. Contact
            </h2>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                Questions: the{" "}
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
