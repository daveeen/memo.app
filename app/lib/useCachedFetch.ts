import { useEffect, useState } from "react";

// Module-level — survives client-side navigation within the SPA session,
// cleared on a full page reload. Not meant to outlive the tab.
const cache = new Map<string, unknown>();

// Stale-while-revalidate: a cache hit renders instantly (loading=false, no
// spinner) while silently refetching in the background and correcting
// data/cache when the fresh result lands. A cache miss (true first visit
// this session) sets loading=true until the first fetch resolves.
export function useCachedFetch<T>(key: string, fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>(() => cache.get(key) as T | undefined);
  const [loading, setLoading] = useState(!cache.has(key));
  useEffect(() => {
    let cancelled = false;
    fetcher().then((fresh) => {
      if (cancelled) return;
      cache.set(key, fresh);
      setData(fresh);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading };
}
