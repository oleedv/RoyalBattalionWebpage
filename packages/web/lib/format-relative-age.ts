// Human "time ago" label for a past ISO timestamp given the current epoch ms.
// Pure (nowMs injected) so it is unit-testable and deterministic.
export function formatRelativeAge(fromIso: string, nowMs: number): string {
  const then = Date.parse(fromIso);
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.floor((nowMs - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hrs}h ${remMins}m ago` : `${hrs}h ago`;
}
