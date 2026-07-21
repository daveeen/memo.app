import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { listIdeas } from "~/lib/api/bank";
import { decoIdea } from "~/lib/memoVisuals";
import { cssText } from "~/lib/cssText";

export default function Ideas() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [pullingId, setPullingId] = useState<string | null>(null);
  useEffect(() => { listIdeas().then(setRows); }, []);

  const ideas = rows.map((r, i) => decoIdea(r, i));
  const q = query.trim().toLowerCase();
  const match = (d: any) =>
    (!q || [d.name, d.key, d.bpm, d.type, d.mood].join(" ").toLowerCase().includes(q)) &&
    (filter === "All" || d.type === filter.toLowerCase() || d.mood === filter.toLowerCase());
  const shown = ideas.filter(match);

  const pull = (id: string) => { setPullingId(id); setTimeout(() => nav(`/ideas/${id}`), 440); };
  const spineStyle = (d: any) => cssText(
    `position:relative;display:flex;align-items:center;width:100%;height:38px;border:none;padding:0;cursor:pointer;text-align:left;border-radius:3px;background:${d.shell};box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -2px 4px rgba(0,0,0,.25),0 2px 5px rgba(0,0,0,.35);` +
    (pullingId === d.id ? "transform:translateX(54px) scale(1.04);box-shadow:-16px 14px 32px rgba(0,0,0,.5);z-index:9;filter:brightness(1.07);" : "transform:translateX(0);")
  );
  const filters = ["All", "Vocal", "Guitar", "Bright", "Warm"];
  const chip = (label: string) => { const active = filter === label; return cssText(`flex:none;padding:9px 15px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid ${active ? "transparent" : "rgba(0,0,0,.1)"};background:${active ? "#17161B" : "#fff"};color:${active ? "#fff" : "#57565E"};`); };
  const clearFilters = () => { setQuery(""); setFilter("All"); };

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      <div style={cssText("display:flex;align-items:center;justify-content:space-between;")}>
        <div style={cssText("display:flex;align-items:center;gap:9px;")}>
          <div style={cssText("width:32px;height:32px;border-radius:10px;background:linear-gradient(135deg,#17161B,#39373f);display:flex;align-items:center;justify-content:center;")}>
            <svg width="19" height="13" viewBox="0 0 40 28" fill="none"><path d="M2 20 L8 8 L14 20 L20 4 L26 20 L32 8 L38 20" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          </div>
          <span style={cssText("font-size:19px;font-weight:800;letter-spacing:-.03em;color:#17161B;")}>Memo</span>
        </div>
        <button onClick={() => nav("/auth")} style={cssText("width:38px;height:38px;border-radius:50%;border:1px solid rgba(0,0,0,.08);background:#fff;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.06);display:flex;align-items:center;justify-content:center;")}>
          <div style={cssText("width:20px;height:20px;border-radius:50%;background:linear-gradient(135deg,#C97B3C,#A8432F);")}></div>
        </button>
      </div>

      <div style={cssText("margin-top:24px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#57565E;")}>Ideas</div>
      <h1 style={cssText("margin:5px 0 0;font-size:32px;font-weight:800;letter-spacing:-.035em;color:#17161B;line-height:1.05;")}>Your ideas,<br />on tape.</h1>
      <p style={cssText("margin:9px 0 0;font-size:14px;line-height:1.5;color:#57565E;max-width:300px;")}>{ideas.length} rescued sketches. Tap a tape to open it, drag one into a crate to keep the good ones together.</p>

      <div style={cssText("margin-top:20px;display:flex;align-items:center;gap:10px;padding:0 15px;height:50px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:15px;box-shadow:0 4px 14px rgba(0,0,0,.04);")}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9a99a3" strokeWidth="2"></circle><path d="M20 20l-3.5-3.5" stroke="#9a99a3" strokeWidth="2" strokeLinecap="round"></path></svg>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by mood, key, BPM…" style={cssText("flex:1;border:none;background:none;outline:none;font-size:15px;color:#17161B;font-weight:500;")} />
      </div>
      <div style={cssText("display:flex;gap:8px;margin-top:11px;overflow-x:auto;")}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={chip(f)}>{f}</button>
        ))}
      </div>

      <div style={cssText("margin-top:24px;display:flex;align-items:baseline;justify-content:space-between;")}>
        <div style={cssText("font-size:16px;font-weight:700;letter-spacing:-.02em;color:#2E2418;")}>All ideas</div>
        <div style={cssText("font-size:11.5px;font-weight:600;color:#8a7d68;")}>Tap a tape to pull it out</div>
      </div>
      <div style={cssText("margin-top:12px;background:linear-gradient(180deg,#2E2318,#1B140D);border-radius:12px;padding:10px 9px;box-shadow:inset 0 2px 12px rgba(0,0,0,.55),0 8px 18px rgba(60,44,32,.16);display:flex;flex-direction:column;gap:5px;overflow:visible;")}>
        {shown.map(d => (
          <button key={d.id} className="m-spine" onClick={() => pull(d.id)} style={spineStyle(d)}>
            <div style={cssText(`width:7px;align-self:stretch;background:${d.stripe};border-radius:3px 0 0 3px;flex:none;`)}></div>
            <div style={cssText("position:absolute;top:0;left:7px;right:0;height:46%;background:linear-gradient(180deg,rgba(255,255,255,.26),transparent);pointer-events:none;border-radius:0 3px 0 0;")}></div>
            <div style={cssText("flex:1;min-width:0;margin:0 9px;padding:3px 10px;background:linear-gradient(180deg,#F4EDDB,#E6D8BC);border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.55);display:flex;align-items:center;")}>
              <span style={cssText("font-family:'Caveat',cursive;font-size:19px;font-weight:700;line-height:1;color:#2E2418;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{d.name}</span>
            </div>
            <div style={cssText(`flex:none;display:flex;align-items:center;gap:9px;padding-right:12px;color:${d.ink};`)}>
              <span style={cssText("font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.8;white-space:nowrap;")}>{d.type}</span>
              <span style={cssText("font-family:'Space Mono',monospace;font-size:9px;opacity:.82;white-space:nowrap;")}>{d.spineMeta}</span>
              <div style={cssText("display:flex;gap:2px;opacity:.5;")}><div style={cssText("width:2px;height:12px;background:currentColor;border-radius:1px;")}></div><div style={cssText("width:2px;height:12px;background:currentColor;border-radius:1px;")}></div></div>
            </div>
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <div style={cssText("text-align:center;padding:36px 14px;")}>
          <div style={cssText("font-size:14px;font-weight:600;color:#57565E;")}>No ideas match “{query}”.</div>
          <button onClick={clearFilters} style={cssText("margin-top:12px;padding:9px 18px;border-radius:20px;border:none;background:#2E2418;color:#fff;font-weight:600;font-size:13px;cursor:pointer;")}>Clear filters</button>
        </div>
      )}
    </div>
  );
}
