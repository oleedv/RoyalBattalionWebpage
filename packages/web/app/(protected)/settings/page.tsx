"use client";

import { useState, useEffect } from "react";
import { usePermissions } from "@/lib/permission-context";
import { getHidePresence, setHidePresence as persistHidePresence } from "@/lib/hide-presence";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  createDeletionRequest,
  getMyDeletionRequest,
  notifyDataRequestsChanged,
} from "@/lib/api-client";
import type { DataDeletionRequest } from "shared";

type Theme = "dark" | "light" | "system";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  return (localStorage.getItem("rb-theme") as Theme) || "dark";
}

function getStoredDefaultServer(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("rb-default-server") || "";
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  if (theme === "light") {
    html.classList.replace("dark", "light");
  } else if (theme === "system") {
    const preferLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    if (preferLight) html.classList.replace("dark", "light");
    else html.classList.replace("light", "dark");
  } else {
    html.classList.replace("light", "dark");
  }
}

export default function SettingsPage() {
  const { permissions, apiToken } = usePermissions();
  const isDeveloper = permissions.includes("developer");
  const [theme, setTheme] = useState<Theme>("dark");
  const [defaultServer, setDefaultServer] = useState("");
  const [hideOnline, setHideOnline] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<DataDeletionRequest | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    setTheme(getStoredTheme());
    setDefaultServer(getStoredDefaultServer());
    setHideOnline(getHidePresence());
  }, []);

  useEffect(() => {
    if (!apiToken) return;
    getMyDeletionRequest(apiToken).then((res) => {
      if (res.success && res.data?.request) setPendingRequest(res.data.request);
    }).catch(() => {});
  }, [apiToken]);

  // Listen for OS theme changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  function handleThemeChange(t: Theme) {
    setTheme(t);
    localStorage.setItem("rb-theme", t);
    applyTheme(t);
  }

  function handleDefaultServerChange(s: string) {
    setDefaultServer(s);
    localStorage.setItem("rb-default-server", s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleHideOnlineChange(hidden: boolean) {
    if (!isDeveloper) return;
    setHideOnline(hidden);
    persistHidePresence(hidden);
  }

  async function handleRequestDeletion() {
    if (!apiToken) return;
    setSubmitting(true);
    setRequestError(null);
    try {
      const res = await createDeletionRequest(apiToken);
      if (res.success && res.data) {
        setPendingRequest(res.data);
        setConfirmOpen(false);
        notifyDataRequestsChanged();
      } else {
        setRequestError(res.error || "Could not send the request.");
      }
    } catch {
      setRequestError("Could not send the request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="font-display mb-8 text-3xl font-bold tracking-wide">
        Settings
      </h1>

      <div className="max-w-2xl space-y-6">
        {/* Theme */}
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-1 text-base font-semibold tracking-wide">
            Theme
          </h2>
          <p className="mb-4 text-sm text-text-secondary">
            Choose how the interface looks.
          </p>

          <div className="flex gap-3">
            {(["dark", "light", "system"] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                className={`flex-1 rounded-sm border px-4 py-3 text-sm font-medium capitalize transition-all ${
                  theme === t
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
                }`}
              >
                {t === "system" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    System
                  </span>
                ) : t === "dark" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                    Dark
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    Light
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Default Server */}
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-1 text-base font-semibold tracking-wide">
            Default Server
          </h2>
          <p className="mb-4 text-sm text-text-secondary">
            Choose which server is selected by default on the Live Server and Whitelist pages.
          </p>

          <div className="flex items-center gap-3">
            <select
              value={defaultServer}
              onChange={(e) => handleDefaultServerChange(e.target.value)}
              className="flex-1 rounded-sm border border-border bg-bg-tertiary px-4 py-2.5 text-sm text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">Auto (first available)</option>
              <option value="main">Main Server</option>
              <option value="battle">Battle Server</option>
            </select>
            {saved && (
              <span className="text-xs text-success">Saved</span>
            )}
          </div>
        </div>

        {isDeveloper && (
          <div className="facet-border rounded-sm bg-bg-card p-6">
            <h2 className="font-display mb-1 text-base font-semibold tracking-wide">
              Hide from online list
            </h2>
            <p className="mb-4 text-sm text-text-secondary">
              Stay connected but do not appear in the staff online roster.
            </p>
            <div className="flex gap-3">
              {([false, true] as const).map((hidden) => (
                <button
                  key={hidden ? "hidden" : "visible"}
                  type="button"
                  onClick={() => handleHideOnlineChange(hidden)}
                  className={`flex-1 rounded-sm border px-4 py-3 text-sm font-medium transition-all ${
                    hideOnline === hidden
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-text-secondary hover:border-accent/40 hover:text-text-primary"
                  }`}
                >
                  {hidden ? "Hidden" : "Visible"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-1 text-base font-semibold tracking-wide">
            Your data
          </h2>
          <p className="mb-4 text-sm text-text-secondary">
            Request deletion of your personal data. A developer will handle it
            by hand. Your account is not removed immediately.
          </p>
          {pendingRequest ? (
            <p className="text-sm text-text-primary">
              Request received. A developer will take care of it.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!apiToken}
              className="rounded-sm border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm font-medium text-danger transition-colors hover:border-danger/60 hover:bg-danger/15 disabled:opacity-50"
            >
              Request deletion
            </button>
          )}
          {requestError && (
            <p className="mt-3 text-sm text-danger">{requestError}</p>
          )}
        </div>

        {/* About */}
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-1 text-base font-semibold tracking-wide">
            About
          </h2>
          <div className="mt-3 space-y-2 text-sm text-text-secondary">
            <p>
              Created by <span className="font-medium text-accent">Ole</span>
            </p>
            <p className="text-text-muted">
              Royal Battalion Web Platform
            </p>
            <p className="text-text-muted">
              Version <span className="font-mono text-text-secondary">{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}</span>
            </p>
          </div>
        </div>

        {/* Credits */}
        <div className="facet-border rounded-sm bg-bg-card p-6">
          <h2 className="font-display mb-1 text-base font-semibold tracking-wide">
            Credits
          </h2>
          <p className="mb-4 text-sm text-text-secondary">Testers</p>
          <ul className="space-y-1.5 text-sm">
            {["Wesley", "Spaghetti", "Quiz", "MadDawg", "Col. Sum"].map(
              (name) => (
                <li key={name} className="font-medium text-accent">
                  {name}
                </li>
              )
            )}
          </ul>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleRequestDeletion}
        title="Request deletion"
        message="This sends a request to the site developers. Your account is not deleted immediately. They will handle it by hand."
        confirmLabel="Send request"
        loading={submitting}
      />
    </div>
  );
}
