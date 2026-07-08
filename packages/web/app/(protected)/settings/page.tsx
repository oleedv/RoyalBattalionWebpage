"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { ConfigCard } from "@/components/config-card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

// Maps the "" storage value for "auto" to a non-empty Select value so Base UI
// doesn't treat it as "no selection" (empty string trips hasSelectedValue=false).
const STORAGE_TO_SELECT = (s: string) => (s === "" ? "auto" : s);
const SELECT_TO_STORAGE = (v: string) => (v === "auto" ? "" : v);

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [defaultServer, setDefaultServer] = useState("");

  useEffect(() => {
    setTheme(getStoredTheme());
    setDefaultServer(getStoredDefaultServer());
  }, []);

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
    toast.success("Saved");
  }

  return (
    <div>
      <PageHeader title="Settings" description="Personalise your experience." />

      <div className="max-w-2xl space-y-6">
        {/* Theme */}
        <ConfigCard
          title="Theme"
          description="Choose how the interface looks."
        >
          <ToggleGroup
            value={[theme]}
            onValueChange={(next) => {
              const t = next[0] as Theme | undefined;
              // Guard: ignore empty deselect so a theme is always applied.
              if (t) handleThemeChange(t);
            }}
            aria-label="Theme"
            className="w-full gap-3"
          >
            <ToggleGroupItem
              value="dark"
              aria-label="Dark"
              className="flex-1 rounded-sm border border-border px-4 py-3 text-sm font-medium text-text-secondary hover:border-accent/40 hover:text-text-primary aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
                Dark
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="light"
              aria-label="Light"
              className="flex-1 rounded-sm border border-border px-4 py-3 text-sm font-medium text-text-secondary hover:border-accent/40 hover:text-text-primary aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Light
              </span>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="system"
              aria-label="System"
              className="flex-1 rounded-sm border border-border px-4 py-3 text-sm font-medium text-text-secondary hover:border-accent/40 hover:text-text-primary aria-pressed:border-accent aria-pressed:bg-accent/10 aria-pressed:text-accent"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                System
              </span>
            </ToggleGroupItem>
          </ToggleGroup>
        </ConfigCard>

        {/* Default Server */}
        <ConfigCard
          title="Default Server"
          description="Choose which server is selected by default on the Live Server and Whitelist pages."
        >
          <Select
            value={STORAGE_TO_SELECT(defaultServer)}
            onValueChange={(v) => { if (v != null) handleDefaultServerChange(SELECT_TO_STORAGE(v)); }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (first available)</SelectItem>
              <SelectItem value="main">Main Server</SelectItem>
              <SelectItem value="battle">Battle Server</SelectItem>
            </SelectContent>
          </Select>
        </ConfigCard>

        {/* About */}
        <ConfigCard title="About">
          <div className="space-y-2 text-sm text-text-secondary">
            <p>
              Created by <span className="font-medium text-accent">Ole</span>
            </p>
            <p className="text-text-muted">Royal Battalion Web Platform</p>
            <p className="text-text-muted">
              Version{" "}
              <span className="font-mono text-text-secondary">
                {process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}
              </span>
            </p>
          </div>
        </ConfigCard>

        {/* Credits */}
        <ConfigCard title="Credits" description="Testers">
          <ul className="space-y-1.5 text-sm">
            {["Wesley", "Spaghetti", "Quiz", "MadDawg", "Col. Sum"].map(
              (name) => (
                <li key={name} className="font-medium text-accent">
                  {name}
                </li>
              ),
            )}
          </ul>
        </ConfigCard>
      </div>
    </div>
  );
}
