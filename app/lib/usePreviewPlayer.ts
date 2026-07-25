// app/lib/usePreviewPlayer.ts
import { useEffect, useRef, useState } from "react";

// One shared <audio> element per hook instance, reused across every preview
// url it's given — not a fresh Audio object per click (same "reuse one
// element" principle as ideas.$id.tsx's idea-audio playback fix). Tapping a
// different url mid-playback switches .src; tapping the SAME url again
// toggles pause/resume instead of restarting from 0.
//
// This app's COEP require-corp header blocks a plain cross-origin <audio src>
// load unless the response carries Cross-Origin-Resource-Policy — Apple's CDN
// doesn't set one, so playback (unlike track-search's `fetchPreviewBlob`,
// which already goes through the proxy for its own reasons) needs routing
// through track-search's `?preview=` proxy too, which now sets that header.
//
// Only iTunes/mzstatic urls actually need this — track-search's proxy is
// SSRF-allowlisted to those two host suffixes and 400s on anything else.
// This hook is also used to play an idea's own Supabase Storage signed URL
// (Chooser's idea-preview button) — that must pass through unproxied, same
// as ideas.$id.tsx's own direct-Audio playback of the same kind of URL.
const PREVIEW_PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-search`;
const PROXIED_HOST_SUFFIXES = [".itunes.apple.com", ".mzstatic.com"];
function proxiedPreviewUrl(url: string): string {
  try {
    const needsProxy = PROXIED_HOST_SUFFIXES.some((suffix) => new URL(url).hostname.endsWith(suffix));
    if (!needsProxy) return url;
  } catch {
    return url;
  }
  return `${PREVIEW_PROXY_BASE}?preview=${encodeURIComponent(url)}`;
}

export function usePreviewPlayer() {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  // Set from toggle() to play()-resolved/rejected or the "error" event —
  // the window between tap and audible sound where a button should show a
  // loading/error state instead of looking dead (same gap as playback.ts's
  // Tone.loaded()/AudioContext resume race, just for plain <audio>).
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [errorUrl, setErrorUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(undefined);
  // The "error"/"ended" listeners are attached once, to the one shared <audio>
  // element — they read this ref (not a closed-over `url` param) so they
  // always report the url that's actually pending, not whichever url was
  // playing when the listener was first attached.
  const pendingUrlRef = useRef<string | null>(null);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  function toggle(url: string) {
    console.log("[preview] toggle", url);
    if (!audioRef.current) {
      const el = new Audio();
      el.addEventListener("ended", () => setPlayingUrl(null));
      el.addEventListener("error", () => {
        console.error("[preview] <audio> error", el.error, pendingUrlRef.current);
        setLoadingUrl(null);
        setPlayingUrl(null);
        setErrorUrl(pendingUrlRef.current);
      });
      audioRef.current = el;
    }
    const el = audioRef.current;
    if (playingUrl === url) {
      console.log("[preview] pause", url);
      el.pause();
      setPlayingUrl(null);
      return;
    }
    pendingUrlRef.current = url;
    setErrorUrl(null);
    const proxied = proxiedPreviewUrl(url);
    console.log("[preview] loading", { url, proxied });
    if (el.src !== proxied) {
      el.src = proxied;
      el.currentTime = 0;
    }
    setLoadingUrl(url);
    setPlayingUrl(url);
    el.play()
      .then(() => console.log("[preview] play() resolved", url))
      .catch((err) => {
        console.error("[preview] play() rejected", err, url);
        setLoadingUrl(null);
        setPlayingUrl(null);
        setErrorUrl(url);
      });
  }

  // Exposed so a page can stop preview playback when it starts a DIFFERENT
  // audio source of its own (e.g. Idea Detail's raw "Play take" element) —
  // otherwise the two overlap, since they're independent <audio> elements.
  function stop() {
    audioRef.current?.pause();
    setPlayingUrl(null);
    setLoadingUrl(null);
  }

  return { playingUrl, loadingUrl, errorUrl, toggle, stop };
}
