import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { listIdeas, listBriefs, saveBrief, saveSong, ideaAudioUrl } from "~/lib/api/bank";
import { buildSong } from "~/lib/api/arrange";
import { buildMidi } from "~/lib/audio/midi";
import { analyzeReference } from "~/lib/audio/analyze";
import { searchTracks, fetchPreviewBlob } from "~/lib/api/tracks";
import { decoIdea, PAL } from "~/lib/memoVisuals";
import { Cassette } from "~/components/memo/Cassette";
import { usePreviewPlayer } from "~/lib/usePreviewPlayer";
import { cssText } from "~/lib/cssText";

type SearchTrack = { trackName: string; artist: string; artworkUrl: string; previewUrl: string };
const SEARCH_DEBOUNCE_MS = 350;

export default function Chooser() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [ideaId, setIdeaId] = useState<string | null>(sp.get("idea"));
  const [briefId, setBriefId] = useState<string | null>(sp.get("brief"));
  const [busy, setBusy] = useState(false);
  const [briefQuery, setBriefQuery] = useState("");
  const [briefResults, setBriefResults] = useState<SearchTrack[]>([]);
  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null);
  const { playingUrl, toggle: togglePreview } = usePreviewPlayer();
  const [ideaAudioUrls, setIdeaAudioUrls] = useState<Record<string, string>>({});
  useEffect(() => { listIdeas().then(setIdeas); listBriefs().then(setBriefs); }, []);
  const ready = !!ideaId && !busy;

  // Idea audio is a private storage object, not a plain public URL like an
  // iTunes preview — resolve to a signed URL once per idea and cache it, so
  // a second tap toggles pause/resume against the SAME url (a fresh signed
  // URL every tap would have a different token each time, breaking
  // usePreviewPlayer's url-equality-based toggle).
  async function toggleIdeaPreview(i: any) {
    let url = ideaAudioUrls[i.id];
    if (!url) {
      const resolved = await ideaAudioUrl(i.raw_path);
      if (!resolved) return;
      url = resolved;
      setIdeaAudioUrls((prev) => ({ ...prev, [i.id]: url }));
    }
    togglePreview(url);
  }

  function runSearch(q: string) {
    if (!q) { setBriefResults([]); return; }
    searchTracks(q).then(setBriefResults).catch(() => setBriefResults([]));
  }
  // Mobile has no keyboard "Enter" affordance most users reach for — search
  // fires as-you-type instead, debounced so every keystroke doesn't fire a
  // request. The search icon still runs immediately, bypassing the wait.
  useEffect(() => {
    const q = briefQuery.trim();
    const t = setTimeout(() => runSearch(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [briefQuery]);

  // Picking a search result runs it through the same analyze -> saveBrief
  // pipeline brief.tsx's pick() already uses (saveBrief already dedupes by
  // track+source, from an earlier fix) — then selects the resulting brief.
  async function pickSearchResult(t: SearchTrack) {
    setAnalyzingUrl(t.previewUrl);
    try {
      const blob = await fetchPreviewBlob(t.previewUrl);
      const a = await analyzeReference(blob, t.trackName, "itunes");
      const saved = await saveBrief({ ...a, previewUrl: t.previewUrl });
      setBriefs((prev) => [saved, ...prev.filter((b) => b.id !== saved.id)]);
      setBriefId(saved.id);
      setBriefQuery("");
      setBriefResults([]);
    } finally {
      setAnalyzingUrl(null);
    }
  }

  async function build() {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;
    const brief = briefId ? briefs.find((b) => b.id === briefId) ?? null : null;
    setBusy(true);
    try {
      const s = await buildSong(idea, brief);
      const midi = buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm, idea.key);
      const { song } = await saveSong(s, midi);
      nav(`/songs/${song.id}`);
    } catch (e) { console.error("[chooser] build failed:", e); setBusy(false); }
  }

  return (
    // position:fixed;inset:0 is always exactly viewport-sized regardless of
    // any ancestor's height (same trick record.tsx's reveal sheet uses) —
    // sidesteps needing the shell itself to have a definite height. Side A
    // + the search bar stay pinned; only the results/recents list below
    // scrolls, in its own flex:1 region.
    <div style={cssText("position:fixed;inset:0;z-index:10;background:#EFE6D4;display:flex;flex-direction:column;overflow:hidden;padding:24px 22px 88px;")}>
      <h2 style={cssText("flex:none;margin:0 0 4px;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#17161B;")}>Pick an idea and a brief.</h2>
      <p style={cssText("flex:none;font-size:13.5px;color:#57565E;margin:0 0 18px;")}>The builder needs one of each.</p>

      <div style={cssText("flex:none;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#B5503C;")}>Side A · your idea</div>
      {/* padding:7px on all sides gives the selected outline (3px solid +
          2px offset = 5px halo beyond each card's own box) room to render
          fully instead of getting clipped at the scroll container's own
          edge — most visible on the first/last card, where there's no
          neighboring card's gap to absorb it. -webkit-overflow-scrolling
          gives iOS proper momentum instead of stiff step-scrolling. */}
      <div style={cssText("flex:none;display:flex;gap:10px;overflow-x:auto;margin-top:10px;padding:7px;-webkit-overflow-scrolling:touch;")}>
        {ideas.map((i) => {
          const d = decoIdea(i);
          return (
            <div
              key={i.id}
              onClick={() => setIdeaId(i.id)}
              role="button"
              tabIndex={0}
              style={cssText(`position:relative;padding:5px;cursor:pointer;border-radius:16px;flex:none;outline:${ideaId === i.id ? "3px solid #B5503C" : "3px solid transparent"};outline-offset:2px;`)}
            >
              <div style={cssText("width:110px;")}><Cassette idea={d} /></div>
              <button
                onClick={(e) => { e.stopPropagation(); toggleIdeaPreview(i); }}
                aria-label="Preview idea"
                style={cssText("position:absolute;bottom:9px;right:9px;width:30px;height:30px;border-radius:50%;border:none;background:#fff;color:#B5503C;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 8px rgba(0,0,0,.22);")}
              >
                {playingUrl != null && playingUrl === ideaAudioUrls[i.id] ? "❚❚" : "▶"}
              </button>
            </div>
          );
        })}
      </div>

      <div style={cssText("flex:none;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C7A3A;")}>
        Side B · reference brief <span style={cssText("color:#a8a68a;font-weight:600;text-transform:none;letter-spacing:0;")}>· optional</span>
      </div>
      <div style={cssText("flex:none;margin-top:10px;display:flex;align-items:center;gap:10px;padding:0 15px;height:48px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.04);")}>
        <button onClick={() => runSearch(briefQuery.trim())} aria-label="Search" style={cssText("display:flex;align-items:center;border:none;background:none;padding:0;cursor:pointer;")}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9a99a3" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="#9a99a3" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <input
          value={briefQuery}
          onChange={(e) => setBriefQuery(e.target.value)}
          placeholder="Search a track..."
          style={cssText("flex:1;border:none;background:none;outline:none;font-size:14.5px;color:#17161B;font-weight:500;")}
        />
      </div>

      <div className="m-scroll" style={cssText("flex:1;min-height:0;padding-bottom:16px;")}>
        {briefQuery ? (
          <div style={cssText("display:flex;flex-direction:column;gap:9px;margin-top:10px;")}>
            {briefResults.map((t, i) => (
              <div
                key={i}
                style={cssText(`display:flex;align-items:center;gap:12px;padding:10px 18px 10px 10px;border-radius:14px;background:#fff;border:1px solid rgba(0,0,0,.07);`)}
              >
                <div style={cssText(`width:44px;height:44px;border-radius:10px;flex:none;background-color:#e8e6ea;background-image:url(${t.artworkUrl});background-size:cover;background-position:center;`)}></div>
                <div style={cssText("flex:1;text-align:left;min-width:0;")}>
                  <div style={cssText("font-size:14px;font-weight:700;color:#17161B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.trackName}</div>
                  <div style={cssText("font-size:12px;color:#8a8791;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.artist}</div>
                </div>
                <button onClick={() => togglePreview(t.previewUrl)} style={cssText("flex:none;width:36px;height:36px;border-radius:50%;border:none;background:#F7F1E3;color:#7C7A3A;cursor:pointer;font-size:13px;box-shadow:0 3px 8px rgba(124,122,58,.22),inset 0 1px 1px rgba(255,255,255,.6);")}>
                  {playingUrl === t.previewUrl ? "❚❚" : "▶"}
                </button>
                <button
                  onClick={() => pickSearchResult(t)}
                  disabled={analyzingUrl === t.previewUrl}
                  style={cssText(`flex:none;padding:8px 14px;border-radius:20px;border:none;background:#17161B;color:#fff;font-size:12px;font-weight:700;cursor:pointer;opacity:${analyzingUrl === t.previewUrl ? .5 : 1};`)}
                >
                  {analyzingUrl === t.previewUrl ? "Analyzing..." : "Select"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={cssText("display:flex;flex-direction:column;gap:9px;margin-top:10px;")}>
            {briefs.map((b, idx) => {
            const art = PAL[idx % PAL.length].shell;
            return (
              <button
                key={b.id}
                onClick={() => setBriefId(b.id)}
                style={cssText(`display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;background:#fff;cursor:pointer;border:1px solid ${briefId === b.id ? "#7C7A3A" : "rgba(0,0,0,.07)"};`)}
              >
                <div style={cssText(`width:44px;height:44px;border-radius:10px;flex:none;background:${art};`)}></div>
                <div style={cssText("flex:1;text-align:left;")}>
                  <div style={cssText("font-size:14px;font-weight:700;color:#17161B;")}>{b.source_track_name}</div>
                  <div style={cssText("font-size:12px;color:#8a8791;")}>{b.shared_key || "—"} · {b.shared_bpm != null ? `${Math.round(b.shared_bpm)} BPM` : "—"}</div>
                </div>
                <span style={cssText("font-size:11px;color:#c9c8cf;")}>›</span>
              </button>
            );
          })}
          </div>
        )}
      </div>

      <button
        onClick={build}
        disabled={!ready}
        style={cssText(`flex:none;margin:12px 0 20px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;border-radius:16px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#17161B;color:#fff;opacity:${!ideaId ? .4 : 1};pointer-events:${ready ? "auto" : "none"};box-shadow:0 10px 24px rgba(20,15,40,.2);`)}
      >
        {busy && (
          <span style={cssText("width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:mSpin .8s linear infinite;display:inline-block;")}></span>
        )}
        {busy ? "Building..." : !ideaId ? "Pick an idea to build" : "Build song →"}
      </button>
    </div>
  );
}
