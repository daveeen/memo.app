import { useEffect, useRef, useState, Fragment } from "react";
import { useNavigate, useParams } from "react-router";
import { getIdea, ideaAudioUrl, renameIdea, updateIdeaNote, updateIdeaLyrics, listSongsForIdea, deleteIdea } from "~/lib/api/bank";
import { decoIdea } from "~/lib/memoVisuals";
import { Cassette } from "~/components/memo/Cassette";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function IdeaDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: row, loading } = useCachedFetch(`idea:${id}`, () => getIdea(id!));
  const [songs, setSongs] = useState<any[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(undefined);
  useEffect(() => {
    if (!id) return;
    listSongsForIdea(id).then(setSongs);
  }, [id]);
  // Force-stop on unmount/navigation — this, plus reusing one <audio>
  // element below instead of a fresh one per click, is the actual fix for
  // "keeps playing after leaving the page."
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  if (loading) return <Spinner />;
  if (!row || !id) return null;
  const d = decoIdea(row);
  async function togglePlay() {
    if (!audioRef.current) {
      const u = await ideaAudioUrl(row.raw_path);
      if (!u) return;
      const el = new Audio(u);
      el.addEventListener("loadedmetadata", () => setDuration(el.duration));
      el.addEventListener("timeupdate", () => setCurrentTime(el.currentTime));
      el.addEventListener("ended", () => setPlaying(false));
      audioRef.current = el;
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }
  function seek(fraction: number) {
    if (!audioRef.current || !duration) return;
    audioRef.current.currentTime = Math.max(0, Math.min(1, fraction)) * duration;
  }
  async function handleDelete() {
    if (!id) return;
    if (!window.confirm(`Delete “${d.name}”? This can't be undone.`)) return;
    await deleteIdea(id, row.raw_path);
    nav("/ideas");
  }
  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;animation:mUp .3s ease both;")}>
      <div style={cssText("display:flex;gap:16px;align-items:flex-start;")}>
        <div style={cssText("width:150px;flex:none;")}><Cassette idea={d} showMeta={false} /></div>
        <div style={cssText("flex:1;padding-top:4px;")}>
          <input key={id} defaultValue={d.name} onBlur={e => renameIdea(id, e.target.value)} style={cssText("width:100%;border:none;background:none;outline:none;font-size:22px;font-weight:800;letter-spacing:-.03em;color:#17161B;padding:0;")} />
          <button onClick={togglePlay} style={cssText("margin-top:12px;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:22px;border:none;background:#17161B;color:#fff;font-weight:600;font-size:13px;cursor:pointer;")}>{playing ? '❚❚' : '▶'} {playing ? 'Playing' : 'Play take'}</button>
        </div>
      </div>

      {/* full angular waveform — real decoded peaks when available (from
          decoIdea's realWavePoints), falls back to the synthetic per-id
          fingerprint for ideas recorded before waveform_json existed */}
      <div
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - rect.left) / rect.width);
        }}
        style={cssText("position:relative;margin-top:20px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:16px;padding:16px;box-shadow:0 4px 14px rgba(0,0,0,.04);cursor:pointer;")}
      >
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={cssText("width:100%;height:70px;display:block;")}><path d={d.realWavePoints ?? d.wavePoints} fill={d.stripe}></path></svg>
        {duration > 0 && (
          <div style={cssText(`position:absolute;top:16px;bottom:16px;left:calc(16px + ${(currentTime / duration).toFixed(4)} * (100% - 32px));width:2px;background:#17161B;box-shadow:0 0 4px rgba(0,0,0,.4);pointer-events:none;`)}></div>
        )}
      </div>

      <div style={cssText("margin-top:18px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Detected · measured</div>
      <div style={cssText("display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:10px;")}>
        <div style={cssText("background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:13px;padding:12px;")}>
          <div style={cssText("font-size:10.5px;color:#8a8791;font-weight:600;")}>Key</div>
          <div style={cssText("font-size:15px;font-weight:800;color:#17161B;margin-top:3px;")}>{d.key}</div>
          {d.keyLow && (
            <div style={cssText("font-size:9px;font-weight:700;color:#B45309;margin-top:2px;")}>low confidence</div>
          )}
        </div>
        <div style={cssText("background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:13px;padding:12px;")}>
          <div style={cssText("font-size:10.5px;color:#8a8791;font-weight:600;")}>Tempo</div>
          <div style={cssText("font-size:15px;font-weight:800;color:#17161B;margin-top:3px;")}>{d.bpm}</div>
        </div>
        <div style={cssText("background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:13px;padding:12px;")}>
          <div style={cssText("font-size:10.5px;color:#8a8791;font-weight:600;")}>Input</div>
          <div style={cssText("font-size:15px;font-weight:800;color:#17161B;margin-top:3px;text-transform:capitalize;")}>{d.type}</div>
        </div>
      </div>
      <div style={cssText("margin-top:10px;display:flex;align-items:center;gap:8px;background:#F1E7D3;border:1px dashed rgba(154,90,60,.4);border-radius:13px;padding:11px 13px;")}>
        <span style={cssText("font-size:10.5px;color:#8a8791;font-weight:600;")}>Mood</span>
        <span style={cssText("font-size:14px;font-weight:700;font-style:italic;color:#9A5A3C;text-transform:capitalize;")}>~ {d.mood}</span>
        <span style={cssText("margin-left:auto;font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a8791;")}>inferred</span>
      </div>

      <div style={cssText("margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Notes</div>
      <textarea defaultValue={row.note ?? ''} onBlur={e => updateIdeaNote(id, e.target.value)} placeholder="try this in 6/8…" style={cssText("margin-top:8px;width:100%;height:64px;border:1px solid rgba(0,0,0,.08);border-radius:13px;padding:11px 13px;font-size:14px;color:#17161B;background:#fff;outline:none;")}></textarea>
      <div style={cssText("margin-top:14px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Lyrics</div>
      <textarea defaultValue={row.lyrics ?? ''} onBlur={e => updateIdeaLyrics(id, e.target.value)} placeholder="words for the melody…" style={cssText("margin-top:8px;width:100%;height:88px;border:1px solid rgba(0,0,0,.08);border-radius:13px;padding:11px 13px;font-size:14px;line-height:1.5;color:#17161B;background:#fff;outline:none;")}></textarea>
      <div style={cssText("font-size:11px;color:#8a8791;margin-top:6px;")}>Saved automatically.</div>

      {songs.length > 0 && (
        <>
          <div style={cssText("margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Songs from this idea</div>
          <div style={cssText("display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;")}>
            {songs.map((s, i) => (
              <Fragment key={i}>
                <span style={cssText("font-size:12.5px;font-weight:600;color:#17161B;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:20px;padding:7px 13px;")}>♪ {s.vibe_briefs?.source_track_name}</span>
              </Fragment>
            ))}
          </div>
        </>
      )}

      <button onClick={() => nav(`/songs/new?idea=${id}`)} style={cssText("margin-top:24px;width:100%;padding:16px;border-radius:16px;border:none;background:#17161B;color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 10px 24px rgba(20,15,40,.2);")}>Build a song with this idea →</button>
      <button onClick={handleDelete} style={cssText("margin-top:12px;width:100%;padding:13px;border-radius:16px;border:1px solid rgba(181,80,60,.25);background:none;color:#B5503C;font-size:13.5px;font-weight:600;cursor:pointer;")}>Delete idea</button>
    </div>
  );
}
