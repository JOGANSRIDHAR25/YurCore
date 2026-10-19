"use client";

/**
 * Generic React hook factory for data fetching.
 *
 * Provides a standardized { data, loading, error, refetch } pattern
 * used by all feature-specific hooks.
 */

import { useCallback, useEffect, useState } from "react";

export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Memoized on the caller's deps so a stable `refetch` reference can be
  // used inside a consumer's own useEffect deps array without triggering an
  // infinite re-run loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetch = useCallback(() => {
    setLoading(true);
    fetcher()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => {
        setError(err?.message ?? "Unknown error");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(fetch, [fetch]);

  return { data, loading, error, refetch: fetch };
}
