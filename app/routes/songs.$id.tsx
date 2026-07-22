import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getSong, updateSongNote, updateSongLyrics } from "~/lib/api/bank";
import { playSong, type SongPlayback } from "~/lib/audio/playback";
import { supabase } from "~/lib/supabase";
import { SEC_COLORS, chordIndexToRow } from "~/lib/memoVisuals";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function Builder() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: song, loading } = useCachedFetch(`song:${id}`, () => getSong(id!));
  const [playing, setPlaying] = useState(false);
  const [exported, setExported] = useState(false);
  const [position, setPosition] = useState(0);
  const controllerRef = useRef<SongPlayback | null>(null);
  const rafRef = useRef<number>(0);
  // Guards against a rapid double-click on the play button starting a second
  // playSong() call before the first one's await (Tone.start()/Tone.loaded(),
  // which can take a moment on first use) has resolved — without this, both
  // clicks would see playing===false and each start their own playback.
  const startingRef = useRef(false);

  // Force-stop on unmount/navigation — the actual fix for "keeps playing
  // after leaving the page."
  useEffect(() => () => {
    controllerRef.current?.stop();
    cancelAnimationFrame(rafRef.current);
  }, []);

  if (loading) return <Spinner />;
  if (!song || !id) return null;

  const idea = song.ideas, brief = song.vibe_briefs;
  const chart: any[] = song.chordchart_json ?? [];
  const structure = (song.structure_json ?? []).map((s: any, i: number) => ({
    label: s.label, order: s.order, color: SEC_COLORS[i % SEC_COLORS.length],
    chords: chart.filter((c) => c.section === s.label).map((c) => c.chord),
  }));
  const instrumentation: string[] = song.instrumentation_json ?? [];
  async function exportMidi() {
    if (!song.midi_path) return;
    const { data } = await supabase.storage.from("midi").createSignedUrl(song.midi_path, 3600);
    if (data) { window.open(data.signedUrl); setExported(true); }
  }

  const beat = (60 / idea.bpm) * 2;
  const duration = chart.length * beat;
  const chordCountsByRow = structure.map((s: any) => s.chords.length);

  function trackPosition() {
    const controller = controllerRef.current;
    if (!controller) return;
    setPosition(controller.getPosition());
    rafRef.current = requestAnimationFrame(trackPosition);
  }

  async function togglePlay() {
    if (playing) {
      controllerRef.current?.stop();
      controllerRef.current = null;
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    try {
      controllerRef.current = await playSong(chart, idea.bpm);
      setPlaying(true);
      rafRef.current = requestAnimationFrame(trackPosition);
    } finally {
      startingRef.current = false;
    }
  }

  function seek(fraction: number) {
    if (!controllerRef.current || !duration) return;
    const sec = Math.max(0, Math.min(1, fraction)) * duration;
    controllerRef.current.seek(sec);
    setPosition(sec);
  }

  const currentChordIndex = Math.min(chart.length - 1, Math.floor(position / beat));
  const playRow = chart.length > 0 ? chordIndexToRow(chordCountsByRow, currentChordIndex) : 0;
  const transportSec = (playing ? structure[playRow] : structure[0]) ?? structure[0];
  const progressPct = duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
  const positionLabel = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 190px;animation:mUp .3s ease both;")}>
      {/* bottom padding clears the fixed transport bar (~74px) stacked above the
          fixed tab bar (80px) below it — 120px used to let the last card hide behind them. */}
      {/* Transcribed from .memo-design/screen-07-builder.html's builderComplete branch
          (builderBuilding branch skipped — this route always loads an already-built song). */}
      <div style={cssText("font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#57565E;")}>Song</div>
      <h2 style={cssText("margin:5px 0 10px;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#2E2418;")}>{idea.title} × {brief?.source_track_name}</h2>
      <div style={cssText("display:flex;align-items:center;gap:8px;flex-wrap:wrap;")}>
        <span style={cssText("font-size:11px;font-weight:800;letter-spacing:.02em;color:#2E2418;background:#F4EDDB;border:1px solid rgba(46,36,24,.14);border-radius:8px;padding:5px 10px;font-family:'Space Mono',monospace;white-space:nowrap;")}>{idea.key}</span>
        <span style={cssText("font-size:11px;font-weight:800;letter-spacing:.02em;color:#2E2418;background:#F4EDDB;border:1px solid rgba(46,36,24,.14);border-radius:8px;padding:5px 10px;font-family:'Space Mono',monospace;white-space:nowrap;")}>{Math.round(idea.bpm)} BPM</span>
        <span style={cssText("width:1px;height:16px;background:rgba(46,36,24,.14);")}></span>
        <span style={cssText("font-size:11px;font-weight:700;color:#B5503C;background:rgba(181,80,60,.14);border-radius:8px;padding:5px 10px;")}>A · {idea.title}</span>
        <span style={cssText("font-size:11px;font-weight:700;color:#7C7A3A;background:rgba(124,122,58,.16);border-radius:8px;padding:5px 10px;")}>B · {brief?.source_track_name}</span>
      </div>

      <div style={cssText("margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a7d68;")}>Structure</div>
      <div style={cssText("margin-top:12px;background:#F7F1E3;border:1px solid rgba(46,36,24,.12);border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(60,44,32,.07);")}>
        {structure.map((sec: any, i: number) => (
          <div
            key={i}
            style={cssText(`display:flex;align-items:center;gap:10px;padding:12px 14px;${i < structure.length - 1 ? "border-bottom:1px solid rgba(46,36,24,.08);" : ""}${playing && i === playRow ? "background:rgba(181,80,60,.08);" : ""}`)}
          >
            <div style={cssText(`width:9px;height:9px;border-radius:3px;background:${sec.color};flex:none;`)}></div>
            <div style={cssText("width:74px;flex:none;font-size:13px;font-weight:800;color:#2E2418;text-transform:capitalize;")}>{sec.label}</div>
            <div style={cssText("flex:1;display:flex;flex-wrap:wrap;gap:5px;")}>
              {sec.chords.map((ch: string, j: number) => (
                <span key={j} style={cssText("font-size:12px;font-weight:700;color:#2E2418;background:rgba(46,36,24,.07);border-radius:6px;padding:3px 8px;font-family:'Space Mono',monospace;")}>{ch}</span>
              ))}
            </div>
            {playing && i === playRow && (
              <span style={cssText("font-size:10px;font-weight:700;color:#B5503C;flex:none;")}>▶</span>
            )}
          </div>
        ))}
      </div>

      <div style={cssText("margin-top:20px;display:flex;align-items:center;gap:8px;")}>
        <span style={cssText("font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Instrumentation</span>
        <span style={cssText("font-size:9.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a8791;")}>inferred</span>
      </div>
      <div style={cssText("display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;")}>
        {instrumentation.map((name, i) => (
          <span key={i} style={cssText("font-size:12.5px;font-weight:600;font-style:italic;color:#9A5A3C;background:#F1E7D3;border:1px dashed rgba(154,90,60,.4);border-radius:20px;padding:6px 12px;")}>~ {name}</span>
        ))}
      </div>

      <div style={cssText("margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Lyrics</div>
      <textarea defaultValue={song.lyrics ?? ''} onBlur={e => updateSongLyrics(id, e.target.value)} placeholder="write the words to sing over this..." style={cssText("margin-top:8px;width:100%;height:88px;border:1px solid rgba(0,0,0,.08);border-radius:13px;padding:11px 13px;font-size:14px;line-height:1.5;color:#17161B;background:#fff;outline:none;")}></textarea>
      <div style={cssText("margin-top:14px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Notes</div>
      <textarea defaultValue={song.note ?? ''} onBlur={e => updateSongNote(id, e.target.value)} placeholder="production ideas, arrangement reminders..." style={cssText("margin-top:8px;width:100%;height:64px;border:1px solid rgba(0,0,0,.08);border-radius:13px;padding:11px 13px;font-size:14px;color:#17161B;background:#fff;outline:none;")}></textarea>
      <div style={cssText("font-size:11px;color:#8a8791;margin-top:6px;")}>Saved automatically.</div>

      <div style={cssText("margin-top:20px;display:flex;flex-direction:column;gap:10px;")}>
        <button onClick={exportMidi} style={cssText("width:100%;padding:15px;border-radius:15px;border:none;background:linear-gradient(135deg,#C97B3C,#A8432F);color:#fff;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 10px 24px rgba(160,86,58,.35);")}>Export .mid</button>
        <button onClick={() => nav(`/produce/${id}`)} style={cssText("width:100%;padding:15px;border-radius:15px;border:1px solid rgba(0,0,0,.1);background:#fff;color:#17161B;font-size:14px;font-weight:700;cursor:pointer;")}>Open in openDAW</button>
        {exported && (
          <div style={cssText("text-align:center;font-size:13px;font-weight:600;color:#0b8a3d;")}>✓ song.mid saved to Downloads — ready to open anywhere.</div>
        )}
      </div>

      <div style={cssText("position:fixed;bottom:80px;left:0;right:0;z-index:40;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.07);padding:14px 20px;display:flex;align-items:center;gap:14px;")}>
        <button onClick={togglePlay} style={cssText("width:46px;height:46px;border-radius:50%;border:none;background:#17161B;color:#fff;cursor:pointer;font-size:16px;flex:none;")}>{playing ? "❚❚" : "▶"}</button>
        <div style={cssText("flex:1;")}>
          <div style={cssText("font-size:12px;font-weight:700;color:#17161B;text-transform:capitalize;")}>{transportSec?.label ?? ""}</div>
          <div
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}
            style={cssText("height:5px;border-radius:3px;background:rgba(0,0,0,.08);margin-top:6px;overflow:hidden;cursor:pointer;")}
          >
            <div style={cssText(`height:100%;width:${progressPct}%;background:#B5503C;`)}></div>
          </div>
        </div>
        <span style={cssText("font-family:'Space Mono',monospace;font-size:12px;color:#8a8791;")}>{positionLabel(position)} / {positionLabel(duration)}</span>
      </div>
    </div>
  );
}
