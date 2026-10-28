"use client";

/**
 * Generic React hook factory for data fetching.
 *
 * Provides a standardized { data, loading, error, refetch } pattern
 * used by all feature-specific hooks.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function useQuery<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): { data: T | null; loading: boolean; error: string | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Id of the latest request; responses from older requests (deps changed or
  // refetch called again before they finished) are ignored so a slow stale
  // response can't overwrite newer data.
  const requestId = useRef(0);

  // Memoized on the caller's deps so a stable `refetch` reference can be
  // used inside a consumer's own useEffect deps array without triggering an
  // infinite re-run loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetch = useCallback(() => {
    const id = ++requestId.current;
    const isLatest = () => id === requestId.current;
    setLoading(true);
    fetcher()
      .then((result) => {
        if (!isLatest()) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!isLatest()) return;
        setError(err?.message ?? "Unknown error");
      })
      .finally(() => {
        if (isLatest()) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
    // Invalidate in-flight requests on deps change / unmount.
    return () => {
      requestId.current++;
    };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}
