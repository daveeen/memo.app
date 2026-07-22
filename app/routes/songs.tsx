import { useNavigate } from "react-router";
import { listSongs } from "~/lib/api/bank";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function Songs() {
  const nav = useNavigate();
  const { data: songs = [], loading } = useCachedFetch("songs", listSongs);
  const view = songs.map((s) => ({
    id: s.id,
    idea: s.ideas?.title ?? "Idea",
    brief: s.vibe_briefs?.source_track_name ?? null,
    title: s.vibe_briefs?.source_track_name
      ? `${s.ideas?.title ?? "Idea"} × ${s.vibe_briefs.source_track_name}`
      : (s.ideas?.title ?? "Idea"),
  }));

  if (loading) return <Spinner />;

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;animation:mUp .3s ease both;")}>
      <div style={cssText("font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#57565E;")}>Songs</div>
      <h1 style={cssText("margin:5px 0 4px;font-size:32px;font-weight:800;letter-spacing:-.035em;color:#17161B;")}>What you've built.</h1>
      <p style={cssText("font-size:14px;color:#57565E;margin:0 0 18px;")}>Built from an idea, with an optional reference.</p>
      <button onClick={() => nav("/songs/new")} style={cssText("width:100%;padding:15px;border-radius:16px;border:none;background:#17161B;color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 10px 24px rgba(20,15,40,.2);")}>+ New song</button>
      <div style={cssText("margin-top:20px;display:flex;flex-direction:column;gap:12px;")}>
        {view.map((s) => (
          <button key={s.id} onClick={() => nav(`/songs/${s.id}`)} style={cssText("display:block;width:100%;text-align:left;padding:15px;border-radius:16px;border:1px solid rgba(0,0,0,.07);background:#fff;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.04);")}>
            <div style={cssText("font-size:16px;font-weight:800;color:#17161B;letter-spacing:-.02em;")}>{s.title}</div>
            <div style={cssText("display:flex;gap:8px;margin-top:10px;")}>
              <span style={cssText("font-size:11px;font-weight:700;color:#B5503C;background:rgba(181,80,60,.14);border-radius:8px;padding:4px 9px;")}>A · {s.idea}</span>
              {s.brief && (
                <span style={cssText("font-size:11px;font-weight:700;color:#7C7A3A;background:rgba(124,122,58,.16);border-radius:8px;padding:4px 9px;")}>B · {s.brief}</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
