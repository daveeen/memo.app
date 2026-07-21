import { useState } from "react";
import { useNavigate } from "react-router";
import { searchTracks, fetchPreviewBlob } from "~/lib/api/tracks";
import { analyzeReference } from "~/lib/audio/analyze";
import { saveBrief } from "~/lib/api/bank";
import { SEC_COLORS } from "~/lib/memoVisuals";
import { cssText } from "~/lib/cssText";

type Track = { trackName: string; artist: string; artworkUrl: string; previewUrl: string };

export default function Brief() {
  const nav = useNavigate();
  const [phase, setPhase] = useState<"search" | "analysing" | "recipe">("search");
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [picked, setPicked] = useState<Track>();
  const [recipe, setRecipe] = useState<any>();
  const [briefId, setBriefId] = useState<string>();

  async function search() { setTracks(await searchTracks(q)); }
  async function pick(t: Track) {
    setPicked(t); setPhase("analysing");
    const blob = await fetchPreviewBlob(t.previewUrl);
    const a = await analyzeReference(blob, t.trackName, "itunes");
    const saved = await saveBrief({ ...a, previewUrl: t.previewUrl });
    setRecipe(a); setBriefId(saved.id); setPhase("recipe");
  }
  async function upload(f: File) {
    setPhase("analysing");
    const a = await analyzeReference(f, f.name, "upload");
    const saved = await saveBrief(a);
    setPicked({ trackName: f.name, artist: "uploaded", artworkUrl: "", previewUrl: "" });
    setRecipe(a); setBriefId(saved.id); setPhase("recipe");
  }
  const chords = recipe ? recipe.chordProgression.map((c: any) => c.chord) : [];
  const sections = recipe ? recipe.sections.map((s: any, i: number) => ({ label: s.label, color: SEC_COLORS[i % SEC_COLORS.length] })) : [];

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      <button onClick={() => nav("/songs")} style={cssText("display:flex;align-items:center;gap:7px;border:none;background:none;cursor:pointer;color:#57565E;font-size:14px;font-weight:600;padding:0;")}>← Back</button>
      <div style={cssText("margin-top:14px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#57565E;")}>Brief</div>
      <h2 style={cssText("margin:5px 0 14px;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#17161B;")}>Reverse-engineer a song you love.</h2>

      {phase === "search" && (
        <>
          <div style={cssText("display:flex;align-items:center;gap:10px;padding:0 15px;height:50px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:15px;box-shadow:0 4px 14px rgba(0,0,0,.04);")}>
            <button onClick={search} aria-label="Search" style={cssText("display:flex;align-items:center;border:none;background:none;padding:0;cursor:pointer;")}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9a99a3" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="#9a99a3" strokeWidth="2" strokeLinecap="round" /></svg>
            </button>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a track…" style={cssText("flex:1;border:none;background:none;outline:none;font-size:15px;color:#17161B;font-weight:500;")} />
          </div>

          {tracks.length > 0 && (
            <div style={cssText("margin-top:16px;display:flex;flex-direction:column;gap:10px;")}>
              {tracks.map((t, i) => (
                <button key={i} onClick={() => pick(t)} style={cssText("display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;border:1px solid rgba(0,0,0,.07);background:#fff;cursor:pointer;text-align:left;box-shadow:0 2px 8px rgba(0,0,0,.03);")}>
                  <div style={cssText(`width:52px;height:52px;border-radius:10px;flex:none;background-color:#e8e6ea;background-image:url(${t.artworkUrl});background-size:cover;background-position:center;box-shadow:0 3px 8px rgba(0,0,0,.14);`)}></div>
                  <div style={cssText("flex:1;")}>
                    <div style={cssText("font-size:15px;font-weight:700;color:#17161B;")}>{t.trackName}</div>
                    <div style={cssText("font-size:12.5px;color:#8a8791;")}>{t.artist}</div>
                  </div>
                  <span style={cssText("font-size:11px;font-weight:600;color:#8a8791;")}>›</span>
                </button>
              ))}
              <div style={cssText("margin-top:6px;text-align:center;font-size:12.5px;color:#8a8791;")}>
                Not here?{" "}
                <label style={cssText("color:#B5503C;cursor:pointer;")}>
                  Upload the track
                  <input type="file" accept="audio/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
                </label>{" "}
                for a stronger brief.
              </div>
            </div>
          )}
        </>
      )}

      {phase === "analysing" && (
        <>
          {picked && (
            <div style={cssText("margin-top:18px;display:flex;align-items:center;gap:13px;")}>
              <div style={cssText(`width:66px;height:66px;border-radius:13px;flex:none;background-color:#e8e6ea;background-image:url(${picked.artworkUrl});background-size:cover;background-position:center;box-shadow:0 6px 16px rgba(0,0,0,.18);`)}></div>
              <div>
                <div style={cssText("font-size:18px;font-weight:800;color:#17161B;letter-spacing:-.02em;")}>{picked.trackName}</div>
                <div style={cssText("font-size:13px;color:#8a8791;")}>{picked.artist}</div>
                <div style={cssText("font-size:11px;color:#8a8791;margin-top:3px;")}>from a 30-second preview</div>
              </div>
            </div>
          )}
          <div style={cssText("margin-top:40px;text-align:center;")}>
            <div style={cssText("width:64px;height:64px;margin:0 auto;border-radius:50%;border:4px solid rgba(0,0,0,.08);border-top-color:#B5503C;animation:mSpin 1s linear infinite;")}></div>
            <div style={cssText("margin-top:18px;font-size:15px;font-weight:700;color:#17161B;")}>Working out the recipe…</div>
            <div style={cssText("margin-top:4px;font-size:13px;color:#8a8791;")}>Finding the beat…</div>
          </div>
        </>
      )}

      {phase === "recipe" && picked && recipe && (
        <>
          <div style={cssText("margin-top:18px;display:flex;align-items:center;gap:13px;")}>
            <div style={cssText(`width:66px;height:66px;border-radius:13px;flex:none;background-color:#e8e6ea;background-image:url(${picked.artworkUrl});background-size:cover;background-position:center;box-shadow:0 6px 16px rgba(0,0,0,.18);`)}></div>
            <div>
              <div style={cssText("font-size:18px;font-weight:800;color:#17161B;letter-spacing:-.02em;")}>{picked.trackName}</div>
              <div style={cssText("font-size:13px;color:#8a8791;")}>{picked.artist}</div>
              <div style={cssText("font-size:11px;color:#8a8791;margin-top:3px;")}>from a 30-second preview</div>
            </div>
          </div>
          <div style={cssText("margin-top:18px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Ingredients</div>
          <div style={cssText("display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;")}>
            <div style={cssText("background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:13px;padding:12px;")}>
              <div style={cssText("font-size:10.5px;color:#8a8791;font-weight:600;")}>Key</div>
              <div style={cssText("font-size:15px;font-weight:800;color:#17161B;margin-top:3px;")}>{recipe.key}</div>
            </div>
            <div style={cssText("background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:13px;padding:12px;")}>
              <div style={cssText("font-size:10.5px;color:#8a8791;font-weight:600;")}>Tempo</div>
              <div style={cssText("font-size:15px;font-weight:800;color:#17161B;margin-top:3px;")}>{Math.round(recipe.bpm)} BPM</div>
            </div>
          </div>
          <div style={cssText("margin-top:10px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:13px;padding:12px;")}>
            <div style={cssText("font-size:10.5px;color:#8a8791;font-weight:600;margin-bottom:8px;")}>Chord progression</div>
            <div style={cssText("display:flex;flex-wrap:wrap;gap:7px;")}>
              {chords.map((c: any, i: number) => (
                <span key={i} style={cssText("font-size:13px;font-weight:700;color:#17161B;background:rgba(0,0,0,.05);border-radius:8px;padding:6px 11px;")}>{c}</span>
              ))}
            </div>
          </div>

          <div style={cssText("margin-top:18px;display:flex;align-items:center;gap:8px;")}>
            <span style={cssText("font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Method · sections</span>
            <span style={cssText("font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#B45309;background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.35);border-radius:7px;padding:2px 7px;")}>estimated</span>
          </div>
          <div style={cssText("display:flex;gap:6px;margin-top:10px;")}>
            {sections.map((s: { label: string; color: string }, i: number) => {
              const raw = recipe.sections[i];
              const dur = raw ? Math.max(raw.endSec - raw.startSec, 0.01) : 1;
              return (
                <div key={i} style={cssText(`flex:${dur};`)}>
                  <div style={cssText(`height:8px;border-radius:4px;background:${s.color};`)}></div>
                  <div style={cssText("font-size:10px;font-weight:600;color:#57565E;margin-top:5px;text-align:center;text-transform:capitalize;")}>{s.label}</div>
                </div>
              );
            })}
          </div>
          <button onClick={() => nav(`/songs/new?brief=${briefId}`)} style={cssText("margin-top:26px;width:100%;padding:16px;border-radius:16px;border:none;background:#17161B;color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 10px 24px rgba(20,15,40,.2);")}>Build a song with this brief →</button>
        </>
      )}
    </div>
  );
}
