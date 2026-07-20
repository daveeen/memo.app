import { useState } from "react";
import { searchTracks, fetchPreviewBlob } from "~/lib/api/tracks";
import { analyzeReference } from "~/lib/audio/analyze";
import { saveBrief } from "~/lib/api/bank";

// `searchTracks` itself is untyped (`return r.json()` in app/lib/api/tracks.ts),
// but the track-search edge function (supabase/functions/track-search/index.ts)
// maps the iTunes response to exactly this shape before returning it, so it's
// declared locally to match what the endpoint actually sends.
type Track = { trackName: string; artist: string; artworkUrl: string; previewUrl: string };

export function VibeBriefPanel({ onSaved }: { onSaved: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Track[]>([]);
  const [busy, setBusy] = useState(false);

  async function pick(t: Track) {
    setBusy(true);
    try {
      const blob = await fetchPreviewBlob(t.previewUrl);
      const a = await analyzeReference(blob, t.trackName, "itunes");
      await saveBrief({ ...a, previewUrl: t.previewUrl });
    } catch {
      setBusy(false);
      return;
    }
    setBusy(false);
    onSaved();
  }

  async function upload(f: File) {
    setBusy(true);
    try {
      const a = await analyzeReference(f, f.name, "upload");
      await saveBrief(a);
    } catch {
      setBusy(false);
      return;
    }
    setBusy(false);
    onSaved();
  }

  return <div>
    <input value={q} onChange={e => setQ(e.target.value)} placeholder="search a song" />
    <button onClick={async () => setRes(await searchTracks(q))}>Search</button>
    <input type="file" accept="audio/*" onChange={e => e.target.files && upload(e.target.files[0])} />
    {busy && <span>Analyzing…</span>}
    <ul>{res.map((t, i) => <li key={i}><img src={t.artworkUrl} width={32} /> {t.trackName} — {t.artist}
      <button onClick={() => pick(t)}>Use</button></li>)}</ul>
  </div>;
}
