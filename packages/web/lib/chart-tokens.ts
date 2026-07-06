"use client";

import { useEffect, useState } from "react";

/**
 * Chart-token bridge.
 *
 * recharts and the Sparkline composite take colors as JS props, so they
 * cannot consume the CSS custom properties directly. This module resolves
 * the semantic theme tokens at runtime (getComputedStyle over the :root /
 * html.light custom properties) into a JS shape charts can consume, so
 * chart colors follow theme switches instead of hard-coding hex values.
 */

type VarName =
  | "--color-accent"
  | "--color-accent-bright"
  | "--color-accent-dim"
  | "--color-text-secondary"
  | "--color-text-muted"
  | "--color-text-primary"
  | "--color-border"
  | "--color-bg-card"
  | "--color-danger"
  | "--color-warning"
  | "--color-success";

/** Dark-theme values, used during SSR and as per-property fallbacks. */
const DARK: Record<VarName, string> = {
  "--color-accent": "#c8a84e",
  "--color-accent-bright": "#e0c060",
  "--color-accent-dim": "#7a6a2e",
  "--color-text-secondary": "#9a9a98",
  "--color-text-muted": "#555558",
  "--color-text-primary": "#eeeee8",
  "--color-border": "#222228",
  "--color-bg-card": "#16161b",
  "--color-danger": "#dc2626",
  "--color-warning": "#f59e0b",
  "--color-success": "#22c55e",
};

export type ChartTokens = {
  /** Ordered multi-series palette; series[0] is the gold primary voice. */
  series: [string, string, string, string];
  accent: string;
  danger: string;
  warning: string;
  success: string;
  /** Grid/rule lines. */
  grid: string;
  /** Axis tick + label text. */
  axis: string;
  tooltip: { bg: string; border: string; text: string };
};

function read(style: CSSStyleDeclaration | null, name: VarName): string {
  const value = style?.getPropertyValue(name).trim();
  return value || DARK[name];
}

/** Resolve the current chart tokens from the document root (SSR-safe). */
export function getChartTokens(): ChartTokens {
  const style =
    typeof window === "undefined"
      ? null
      : getComputedStyle(document.documentElement);
  return {
    series: [
      read(style, "--color-accent"),
      read(style, "--color-accent-bright"),
      read(style, "--color-text-secondary"),
      read(style, "--color-accent-dim"),
    ],
    accent: read(style, "--color-accent"),
    danger: read(style, "--color-danger"),
    warning: read(style, "--color-warning"),
    success: read(style, "--color-success"),
    grid: read(style, "--color-border"),
    axis: read(style, "--color-text-muted"),
    tooltip: {
      bg: read(style, "--color-bg-card"),
      border: read(style, "--color-border"),
      text: read(style, "--color-text-primary"),
    },
  };
}

/**
 * Theme-reactive chart tokens. Observes the html class attribute (the theme
 * switch mechanism) rather than useTheme state, so a toggle from any
 * useTheme instance triggers a re-read.
 */
export function useChartTokens(): ChartTokens {
  const [tokens, setTokens] = useState(getChartTokens);

  useEffect(() => {
    setTokens(getChartTokens());
    const observer = new MutationObserver(() => setTokens(getChartTokens()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);

  return tokens;
}
