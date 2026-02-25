"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const CONSENT_KEY = "rb-cookie-consent";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(CONSENT_KEY)) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg-secondary/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-4 sm:flex-row sm:justify-between">
        <p className="text-sm text-text-secondary">
          This site uses cookies for authentication and preferences.{" "}
          <Link
            href="/privacy"
            className="text-accent underline-offset-2 hover:underline"
          >
            Learn more
          </Link>
        </p>
        <button
          onClick={handleAccept}
          className="shrink-0 cursor-pointer rounded-sm border border-accent/40 bg-accent/10 px-6 py-2 text-sm font-semibold tracking-wide text-accent transition-colors hover:border-accent/60 hover:bg-accent/20"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
