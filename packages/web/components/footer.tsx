import Link from "next/link";
import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-border bg-bg-primary">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Image
                src="/img/rb_newlion2024_4_RS.png"
                alt="Royal Battalion"
                width={32}
                height={32}
                className="rounded-sm"
              />
              <span className="font-display text-sm font-semibold tracking-[0.15em] text-accent">
                ROYAL BATTALION
              </span>
            </div>
            <p className="text-sm leading-relaxed text-text-secondary">
              A tactical gaming community built around Squad.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:items-end">
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">
              Legal
            </h3>
            <nav className="flex flex-col gap-2 sm:items-end">
              <Link
                href="/privacy"
                className="text-sm text-text-secondary transition-colors hover:text-accent"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms"
                className="text-sm text-text-secondary transition-colors hover:text-accent"
              >
                Terms of Service
              </Link>
              <a
                href="https://discord.gg/royalbattalion"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-text-secondary transition-colors hover:text-accent"
              >
                Contact (Discord)
              </a>
            </nav>
          </div>
        </div>

        <div className="my-8 h-px bg-gradient-to-r from-transparent via-accent/30 to-transparent" />

        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-xs text-text-muted">
            Made by <span className="font-semibold text-accent">RB | Ole</span>
          </p>
          <p className="text-xs text-text-muted">
            &copy; 2024 &ndash; 2026 Royal Battalion. All rights reserved.
          </p>
          <p className="max-w-2xl text-[10px] leading-relaxed text-text-muted/60">
            Squad is a trademark of Offworld Industries. Steam is a trademark of
            Valve Corporation. All other trademarks are property of their
            respective owners.
          </p>
          <p className="text-[10px] text-text-muted/50">
            Not affiliated with Valve Corporation or Offworld Industries
          </p>
        </div>
      </div>
    </footer>
  );
}
