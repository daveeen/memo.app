// app/lib/usePreviewPlayer.ts
import { useEffect, useRef, useState } from "react";

// One shared <audio> element per hook instance, reused across every preview
// url it's given — not a fresh Audio object per click (same "reuse one
// element" principle as ideas.$id.tsx's idea-audio playback fix). Tapping a
// different url mid-playback switches .src; tapping the SAME url again
// toggles pause/resume instead of restarting from 0.
//
// iTunes preview urls (audio-ssl.itunes.apple.com) play directly via a plain
// <audio> element cross-origin — CORS only blocks reading/decoding audio
// DATA (fetch + decodeAudioData), not playback, so no proxy is needed here
// (unlike track-search's ?preview= route, which exists for the analysis
// path in brief.tsx, a different use case).
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
    if (el.src !== url) {
      el.src = url;
      el.currentTime = 0;
    }
    el.play();
    setPlayingUrl(url);
  }

  return { playingUrl, toggle };
}
