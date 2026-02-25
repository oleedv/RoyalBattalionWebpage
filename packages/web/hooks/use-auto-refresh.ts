import { useEffect, useRef, useCallback } from "react";

export function useAutoRefresh(
  fetchFn: () => Promise<void>,
  interval: number = 20_000,
  enabled: boolean = true
) {
  const fetchRef = useRef(fetchFn);
  fetchRef.current = fetchFn;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!document.hidden) {
        fetchRef.current();
      }
    }, interval);
  }, [interval]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return;
    }

    start();

    function onVisibilityChange() {
      if (!document.hidden) {
        fetchRef.current();
        start();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, start, stop]);
}
