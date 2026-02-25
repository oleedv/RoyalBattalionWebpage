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
    }
  }, [fetcher]);

  useEffect(() => {
    if (enabled) refresh();
  }, [enabled, refresh]);

  return { data, setData, loading, error, refresh };
}
