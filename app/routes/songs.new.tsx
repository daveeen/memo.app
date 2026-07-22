import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { listIdeas, listBriefs, saveSong } from "~/lib/api/bank";
import { buildSong } from "~/lib/api/arrange";
import { buildMidi } from "~/lib/audio/midi";
import { decoIdea, PAL } from "~/lib/memoVisuals";
import { Cassette } from "~/components/memo/Cassette";
import { cssText } from "~/lib/cssText";

export default function Chooser() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [ideaId, setIdeaId] = useState<string | null>(sp.get("idea"));
  const [briefId, setBriefId] = useState<string | null>(sp.get("brief"));
  const [busy, setBusy] = useState(false);
  useEffect(() => { listIdeas().then(setIdeas); listBriefs().then(setBriefs); }, []);
  const ready = !!ideaId && !!briefId && !busy;

  async function build() {
    const idea = ideas.find((i) => i.id === ideaId);
    const brief = briefs.find((b) => b.id === briefId);
    if (!idea || !brief) return;
    setBusy(true);
    try {
      const s = await buildSong(idea, brief);
      const midi = buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm);
      const { song } = await saveSong(s, midi);
      nav(`/songs/${song.id}`);
    } catch (e) { console.error("[chooser] build failed:", e); setBusy(false); }
  }

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      <button onClick={() => nav("/songs")} style={cssText("display:flex;align-items:center;gap:7px;border:none;background:none;cursor:pointer;color:#57565E;font-size:14px;font-weight:600;padding:0;")}>← Songs</button>
      <h2 style={cssText("margin:14px 0 4px;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#17161B;")}>Pick an idea and a brief.</h2>
      <p style={cssText("font-size:13.5px;color:#57565E;margin:0 0 18px;")}>The builder needs one of each.</p>

      <div style={cssText("font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#B5503C;")}>Side A · your idea</div>
      {/* padding:7px on all sides gives the selected outline (3px solid +
          2px offset = 5px halo beyond each card's own box) room to render
          fully instead of getting clipped at the scroll container's own
          edge — most visible on the first/last card, where there's no
          neighboring card's gap to absorb it. -webkit-overflow-scrolling
          gives iOS proper momentum instead of stiff step-scrolling. */}
      <div style={cssText("display:flex;gap:10px;overflow-x:auto;margin-top:10px;padding:7px;-webkit-overflow-scrolling:touch;")}>
        {ideas.map((i) => {
          const d = decoIdea(i);
          return (
            <button
              key={i.id}
              onClick={() => setIdeaId(i.id)}
              style={cssText(`border:none;background:none;padding:0;cursor:pointer;border-radius:16px;flex:none;outline:${ideaId === i.id ? "3px solid #B5503C" : "3px solid transparent"};outline-offset:2px;`)}
            >
              <div style={cssText("width:110px;")}><Cassette idea={d} /></div>
            </button>
          );
        })}
      </div>

      <div style={cssText("margin-top:22px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C7A3A;")}>
        Side B · reference brief <span style={cssText("color:#8a8791;font-weight:600;text-transform:none;letter-spacing:0;")}>· recents first</span>
      </div>
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

      <button
        onClick={build}
        disabled={!ready}
        style={cssText(`margin-top:24px;width:100%;padding:16px;border-radius:16px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#17161B;color:#fff;opacity:${ready ? 1 : .4};pointer-events:${ready ? "auto" : "none"};box-shadow:0 10px 24px rgba(20,15,40,.2);`)}
      >
        {ready ? "Build song →" : "Pick one of each to build"}
      </button>
    </div>
  );
}
