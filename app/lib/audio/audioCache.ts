import { ideaAudioUrl } from "~/lib/api/bank";

// Session-lived cache of an idea's raw recording, keyed by its STABLE
// raw_path — not the signed URL ideaAudioUrl() returns, which carries a
// rotating token and would never repeat-hit if used as the key. Once
// fetched, the bytes never change (raw_path is immutable after upload), so
// unlike useCachedFetch.ts there's no staleness to manage — cache forever
// for the tab's lifetime.
// ponytail: no eviction/LRU — recordings are small and this is a short tab
// session; add an LRU cap if someone records hundreds of ideas in one
// sitting and memory becomes a real concern.
const cache = new Map<string, Promise<string>>();

async function fetchBlobUrl(raw_path: string): Promise<string> {
  const signedUrl = await ideaAudioUrl(raw_path);
  if (!signedUrl) throw new Error("couldn't sign audio url");
  const r = await fetch(signedUrl);
  if (!r.ok) throw new Error(`audio fetch failed: ${r.status}`);
  const blob = await r.blob();
  return URL.createObjectURL(blob);
}

// Cache hit resolves with no network at all (the returned blob: url plays
// with zero fetch, sidestepping any Android-PWA network flakiness on
// replay). Cache miss signs + downloads once; concurrent calls for the same
// raw_path share the one in-flight request instead of double-fetching.
export function getIdeaAudioBlobUrl(raw_path: string): Promise<string> {
  const cached = cache.get(raw_path);
  if (cached) {
    console.log("[audioCache] cache hit", raw_path);
    return cached;
  }
  console.log("[audioCache] cache miss — fetching", raw_path);
  const promise = fetchBlobUrl(raw_path);
  cache.set(raw_path, promise);
  // Don't cache a failed fetch — a network blip shouldn't permanently
  // poison this idea for the rest of the session.
  promise.catch(() => cache.delete(raw_path));
  return promise;
}

// Fire-and-forget warm-up: populates the cache ahead of a tap. Failures are
// only logged, never surfaced — a background prefetch failing must stay
// invisible until the user's own togglePlay() actually tries and fails.
export function prefetchIdeaAudio(raw_path: string): void {
  getIdeaAudioBlobUrl(raw_path).catch((err) => console.warn("[audioCache] prefetch failed", raw_path, err));
}
