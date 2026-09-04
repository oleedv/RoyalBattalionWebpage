/** Elapsed match seconds from a start ISO timestamp, else the snapshot fallback. */
export function matchElapsedSeconds(
  startedAt: string | null | undefined,
  nowMs: number,
  fallbackSeconds?: number | null
): number | null {
  if (startedAt) {
    const then = Date.parse(startedAt);
    if (!Number.isNaN(then)) return Math.max(0, Math.floor((nowMs - then) / 1000));
  }
  if (fallbackSeconds == null || !Number.isFinite(fallbackSeconds)) return null;
  return Math.max(0, Math.floor(fallbackSeconds));
}

/** Clock label for a running match. Pure so tests can pin exact strings. */
export function formatMatchDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "unknown";
  const s = Math.floor(seconds);
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
  return `${secs}s`;
}
