"use client";

import { useState, useEffect, useCallback } from "react";

interface UseAsyncDataOptions<T> {
  fetcher: () => Promise<{ success: boolean; data?: T; error?: string }>;
  enabled?: boolean;
}

export function useAsyncData<T>({
  fetcher,
  enabled = true,
}: UseAsyncDataOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetcher();
      if (res.success && res.data !== undefined) {
        setData(res.data);
      } else {
        setError(res.error || "Failed to load data");
      }
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [fetcher]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  // True only until the first fetch resolves; stays false for background
  // refreshes so skeletons show once and never re-flash on auto-refresh.
  const initialLoading = loading && !hasLoaded;

  return { data, setData, loading, initialLoading, error, refresh };
}
