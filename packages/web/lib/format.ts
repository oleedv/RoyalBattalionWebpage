/** Site-wide locale: Monday-first week, DD MMM YYYY, 24-hour clock. */
export const APP_LOCALE = "en-GB";

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

const TIME_OPTS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

const TIME_WITH_SECONDS_OPTS: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

export function formatDate(date: string | Date | number): string {
  return new Date(date).toLocaleDateString(APP_LOCALE, DATE_OPTS);
}

export function formatDateCompact(date: string | Date | number): string {
  return new Date(date).toLocaleDateString(APP_LOCALE, {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

export function formatDateTime(date: string | Date | number): string {
  return new Date(date).toLocaleString(APP_LOCALE, {
    ...DATE_OPTS,
    ...TIME_OPTS,
  });
}

export function formatTime(date: string | Date | number, opts?: { seconds?: boolean }): string {
  return new Date(date).toLocaleTimeString(
    APP_LOCALE,
    opts?.seconds ? TIME_WITH_SECONDS_OPTS : TIME_OPTS,
  );
}

export function formatNumber(n: number): string {
  return n.toLocaleString(APP_LOCALE);
}

export function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return formatDate(date);
}
