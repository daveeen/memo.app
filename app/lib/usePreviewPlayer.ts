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
const PREVIEW_PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-search`;
const proxiedPreviewUrl = (url: string) => `${PREVIEW_PROXY_BASE}?preview=${encodeURIComponent(url)}`;

export function usePreviewPlayer() {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(undefined);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  function toggle(url: string) {
    if (!audioRef.current) {
      const el = new Audio();
      el.addEventListener("ended", () => setPlayingUrl(null));
      audioRef.current = el;
    }
    const el = audioRef.current;
    if (playingUrl === url) {
      el.pause();
      setPlayingUrl(null);
      return;
    }
    const proxied = proxiedPreviewUrl(url);
    if (el.src !== proxied) {
      el.src = proxied;
      el.currentTime = 0;
    }
    el.play();
    setPlayingUrl(url);
  }

  return { playingUrl, toggle };
}
