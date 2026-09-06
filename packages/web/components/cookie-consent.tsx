"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const NOTICE_KEY = "rb-cookie-notice";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(NOTICE_KEY)) {
      setVisible(true);
    }
  }, []);

  function handleDismiss() {
    localStorage.setItem(NOTICE_KEY, "dismissed");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg-secondary/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-4 sm:flex-row sm:justify-between">
        <p className="text-sm text-text-secondary">
          We only use cookies that are needed to run this site: signing in and
          remembering your preferences. No tracking or advertising cookies.{" "}
          <Link
            href="/privacy"
            className="text-accent underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 cursor-pointer rounded-sm border border-accent/40 bg-accent/10 px-6 py-2 text-sm font-semibold tracking-wide text-accent transition-colors hover:border-accent/60 hover:bg-accent/20"
        >
          OK
        </button>
      </div>
    </div>
  );
}
