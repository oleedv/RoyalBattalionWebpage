export const HIDE_PRESENCE_KEY = "rb-hide-presence";
export const HIDE_PRESENCE_EVENT = "rb-hide-presence-change";

export function getHidePresence(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(HIDE_PRESENCE_KEY) === "1";
}

export function setHidePresence(hidden: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(HIDE_PRESENCE_KEY, hidden ? "1" : "0");
  window.dispatchEvent(new CustomEvent(HIDE_PRESENCE_EVENT, { detail: hidden }));
}
