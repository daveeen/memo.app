import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { analyzeCapture } from "~/lib/audio/analyze";
import { saveIdea } from "~/lib/api/bank";
import { searchTracks } from "~/lib/api/tracks";
import { suggestSimilar } from "~/lib/api/suggestSimilar";
import { usePreviewPlayer } from "~/lib/usePreviewPlayer";
import { cssText } from "~/lib/cssText";
import type { CaptureAnalysis, SoundsLikeEntry } from "~/lib/types";

// Real-time waveform driven by the mic's own AnalyserNode (see startLiveWave) —
// no decorative CSS pulse. Colour keeps the mockup's per-index hue sweep.
const BAR_COUNT = 46;
const barColor = (i: number) => `hsl(${16 + i * 2.2},72%,58%)`;
const REST_BARS = Array.from({ length: BAR_COUNT }, () => 0.12);

export default function Record() {
  const nav = useNavigate();
  const [soundsLike, setSoundsLike] = useState<SoundsLikeEntry[]>([]);
  const { playingUrl: previewPlayingUrl, toggle: togglePreview } = usePreviewPlayer();
  const rec = useRef<MediaRecorder>(undefined);
  const stream = useRef<MediaStream>(undefined);
  const chunks = useRef<Blob[]>([]);
  const blobRef = useRef<Blob>(undefined);
  const timer = useRef<number>(0);
  const [phase, setPhase] = useState<"idle" | "recording" | "analysing" | "reveal">("idle");
  const [recTime, setRecTime] = useState("00:00.0");
  const [analysis, setAnalysis] = useState<Omit<CaptureAnalysis, "id" | "cleanedAudioPath">>();
  const [pendingTitle, setPendingTitle] = useState("Untitled idea");

  // Live waveform: an AnalyserNode tapped off the recording MediaStream, sampled
  // every animation frame. Never connected to ctx.destination, so the mic never
  // plays back through the speakers (no feedback loop) — it's read-only.
  const audioCtxRef = useRef<AudioContext>(undefined);
  const rafRef = useRef<number>(0);
  const [liveBars, setLiveBars] = useState<number[]>(REST_BARS);

  function startLiveWave(mediaStream: MediaStream) {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(mediaStream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    audioCtxRef.current = ctx;
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      setLiveBars(Array.from({ length: BAR_COUNT }, (_, i) => {
        const v = buf[Math.floor((i / BAR_COUNT) * buf.length)];
        return Math.abs(v - 128) / 128; // 0 = silence, 1 = full-scale
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }
  function stopLiveWave(resetVisual = true) {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    audioCtxRef.current?.close();
    audioCtxRef.current = undefined;
    if (resetVisual) setLiveBars(REST_BARS);
  }
  useEffect(() => () => stopLiveWave(false), []);

  async function finishAnalysis(blob: Blob) {
    blobRef.current = blob;
    const a = await analyzeCapture(blob);
    setAnalysis(a);
    setPendingTitle(a.moodTag ? `${a.moodTag} idea` : "Untitled idea");
    setPhase("reveal");
  }

  async function start() {
    try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return; }
    chunks.current = [];
    rec.current = new MediaRecorder(stream.current);
    rec.current.ondataavailable = (e) => chunks.current.push(e.data);
    rec.current.onstop = async () => {
      stopLiveWave();
      stream.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      setPhase("analysing");
      await finishAnalysis(new Blob(chunks.current, { type: "audio/webm" }));
    };
    rec.current.start();
    setPhase("recording");
    startLiveWave(stream.current);
    let ms = 0;
    timer.current = window.setInterval(() => {
      ms += 100; const s = Math.floor(ms / 1000), t = Math.floor((ms % 1000) / 100);
      setRecTime(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${t}`);
    }, 100);
  }
  const stop = () => rec.current?.stop();
  const discard = () => {
    // Cancel can fire mid-recording. Detach onstop first so the real analysis
    // pipeline doesn't run, then release the mic + timer ourselves — routing
    // through rec.current.stop() with onstop still attached would otherwise
    // send the user into "analysing" instead of back to idle.
    if (rec.current && rec.current.state !== "inactive") {
      rec.current.onstop = null;
      rec.current.stop();
    }
    stopLiveWave();
    stream.current?.getTracks().forEach((t) => t.stop());
    clearInterval(timer.current);
    blobRef.current = undefined;
    setPhase("idle");
    setRecTime("00:00.0");
  };
  async function save() {
    if (!blobRef.current || !analysis) return;
    await saveIdea(blobRef.current, analysis, pendingTitle, soundsLike);
    nav("/ideas");
  }
  async function uploadFile(f: File) {
    setPhase("analysing");
    await finishAnalysis(f);
  }

  // Real "sounds like": Gemini suggests actual song/artist names for this
  // capture's key/bpm/mood/type, each gets resolved to a real iTunes hit
  // (artwork + playable preview) via the existing searchTracks() client —
  // any suggestion iTunes can't find is silently dropped rather than shown
  // as a broken/unplayable row. Replaces the old vibe_briefs-cache matching
  // and mood-word iTunes text search, both removed.
  useEffect(() => {
    if (!analysis) return;
    let cancelled = false;
    setSoundsLike([]);
    suggestSimilar({
      key: analysis.detectedKey, bpm: analysis.bpm,
      mood: analysis.moodTag, inputType: analysis.inputType,
    })
      .then(async (suggestions) => {
        const resolved = await Promise.all(suggestions.map(async (s) => {
          const hits = await searchTracks(`${s.title} ${s.artist}`).catch(() => []);
          const hit = hits[0];
          return hit ? { title: hit.trackName, artist: hit.artist, artworkUrl: hit.artworkUrl, previewUrl: hit.previewUrl } : null;
        }));
        if (!cancelled) setSoundsLike(resolved.filter((r): r is SoundsLikeEntry => r !== null));
      })
      .catch(() => { if (!cancelled) setSoundsLike([]); });
    return () => { cancelled = true; };
  }, [analysis]);

  const revealStats = analysis ? [
    { label: "Input", value: analysis.inputType, inf: false },
    { label: "Tempo", value: `${Math.round(analysis.bpm)} BPM`, inf: false },
    { label: "Key", value: analysis.detectedKey, inf: false },
    { label: "Mood", value: analysis.moodTag, inf: true },
  ] : [];

  // Play-take toggle for the reveal sheet — wired to a real <audio> over the
  // captured blob (mockup's `togglePending`/`pendingPlaying` were fake since
  // the mockup has no real audio; here blobRef.current is real).
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(undefined);
  const audioBlobRef = useRef<Blob>(undefined);
  function togglePlay() {
    if (!blobRef.current) return;
    if (!audioRef.current || audioBlobRef.current !== blobRef.current) {
      audioRef.current = new Audio(URL.createObjectURL(blobRef.current));
      audioRef.current.onended = () => setPlaying(false);
      audioBlobRef.current = blobRef.current;
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }

  const spinning = phase === "recording" || phase === "analysing";
  const recStatus = phase === "analysing" ? "Analysing" : "Recording";
  const recSub = phase === "analysing" ? "Finding the beat…" : "Listening for a key & tempo…";
  const recSub2 = phase === "analysing" ? "analysing…" : "new idea";
  const reelAnim = spinning ? "animation:mReel 2.4s linear infinite;" : "";
  const reelAnimB = spinning ? "animation:mReel 3.6s linear infinite;" : "";
  const saveBtnStyle = `flex:1;padding:15px;border-radius:15px;border:none;background:#17161B;color:#fff;font-weight:700;font-size:14px;cursor:pointer;`;

  return (
    <div style={cssText(`flex:1;min-height:100vh;display:flex;flex-direction:column;` + (phase === "recording" || phase === "analysing" ? "background:radial-gradient(120% 80% at 20% 0%,#3a2416 0,transparent 55%),radial-gradient(120% 80% at 85% 8%,#2c2013 0,transparent 52%),radial-gradient(130% 90% at 50% 110%,#3a1e12 0,transparent 55%),#161009;" : "background:#EFE6D4;"))}>
      <div style={cssText("flex:1;position:relative;display:flex;flex-direction:column;align-items:center;overflow:hidden;")}>
        {/* idle */}
        {phase === "idle" && (
          <button onClick={() => nav("/ideas")} style={cssText("position:absolute;top:22px;left:22px;z-index:5;display:flex;align-items:center;gap:7px;border:none;background:none;cursor:pointer;color:#57565E;font-size:14px;font-weight:600;padding:0;")}>← Ideas</button>
        )}
        {phase === "idle" && (
          <div style={cssText("margin-top:96px;text-align:center;padding:0 34px;")}>
            <div style={cssText("font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#57565E;")}>Record</div>
            <h2 style={cssText("margin:10px 0 0;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#17161B;")}>Catch it before<br />it’s gone.</h2>
            <p style={cssText("margin:10px 0 0;font-size:13.5px;line-height:1.5;color:#57565E;")}>Memo needs your mic to hear the melody. Recording starts the instant you press — no countdown.</p>
          </div>
        )}

        {/* recording / analysing status */}
        {spinning && (
          <>
            <div style={cssText("margin-top:74px;display:flex;align-items:center;gap:8px;color:#f0e2c8;font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;z-index:5;")}>
              <span style={cssText("width:9px;height:9px;border-radius:50%;background:#ff9a6a;box-shadow:0 0 14px #ff9a6a;animation:mGlow 1.4s ease-in-out infinite;")}></span>
              {recStatus}
            </div>
            <div style={cssText("margin-top:22px;font-size:54px;font-weight:800;letter-spacing:-.02em;color:#fbf4e6;font-variant-numeric:tabular-nums;z-index:5;")}>{recTime}</div>
            <div style={cssText("margin-top:2px;font-size:13px;font-weight:500;color:#c3b193;z-index:5;")}>{recSub}</div>
            <div style={cssText("margin-top:40px;display:flex;align-items:center;justify-content:center;gap:2px;height:140px;width:320px;z-index:5;")}>
              {liveBars.map((v, i) => (
                <div key={i} style={cssText(`width:3px;height:126px;background:${barColor(i)};border-radius:2px;transform:scaleY(${((18 + 108 * Math.max(0.06, v)) / 126).toFixed(3)});transition:transform 60ms linear;`)}></div>
              ))}
            </div>
          </>
        )}

        {/* recording cassette (reels spin while recording/analysing) */}
        {spinning && (
          <div style={cssText("position:absolute;bottom:-84px;left:50%;transform:translateX(-50%);width:436px;height:290px;z-index:1;filter:drop-shadow(0 -16px 54px rgba(210,130,70,.34));")}>
            <div style={cssText("position:absolute;inset:0;border-radius:24px 24px 0 0;background:linear-gradient(160deg,#CD8140,#8E3F27);box-shadow:inset 0 2px 4px rgba(255,255,255,.3),inset 0 -12px 26px rgba(0,0,0,.32);overflow:hidden;")}>
              <div style={cssText("position:absolute;top:0;left:14%;width:16%;height:100%;background:rgba(255,255,255,.14);transform:skewX(-12deg);")}></div>
              <div style={cssText("position:absolute;top:26px;left:38px;right:38px;height:96px;border-radius:9px;background:linear-gradient(180deg,#F4EDDB,#E6D8BC);box-shadow:0 2px 7px rgba(0,0,0,.28);overflow:hidden;display:flex;flex-direction:column;justify-content:center;padding:0 22px;")}>
                <div style={cssText("position:absolute;top:0;left:0;right:0;height:6px;background:#B34A34;")}></div>
                <span style={cssText("font-size:30px;font-weight:700;line-height:1;color:#2E2418;")}>{recSub2}</span>
                <span style={cssText("font-size:11px;font-weight:700;letter-spacing:.08em;color:#8a7250;margin-top:6px;")}>MEMO · SIDE A · NORMAL BIAS</span>
              </div>
              <div style={cssText("position:absolute;top:140px;left:74px;right:74px;height:104px;border-radius:14px;background:radial-gradient(circle at 50% 38%,#2a2118,#0c0906);box-shadow:inset 0 3px 9px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:space-between;padding:0 42px;")}>
                <div style={cssText(`width:78px;height:78px;border-radius:50%;background:conic-gradient(from 0deg,#e8dcc4 0 30deg,#c4b291 30deg 60deg,#e8dcc4 60deg 90deg,#c4b291 90deg 120deg,#e8dcc4 120deg 150deg,#c4b291 150deg 180deg,#e8dcc4 180deg 210deg,#c4b291 210deg 240deg,#e8dcc4 240deg 270deg,#c4b291 270deg 300deg,#e8dcc4 300deg 330deg,#c4b291 330deg 360deg);display:flex;align-items:center;justify-content:center;${reelAnim}`)}><div style={cssText("width:28px;height:28px;border-radius:50%;background:#0c0906;")}></div></div>
                <div style={cssText(`width:78px;height:78px;border-radius:50%;background:conic-gradient(from 0deg,#e8dcc4 0 30deg,#c4b291 30deg 60deg,#e8dcc4 60deg 90deg,#c4b291 90deg 120deg,#e8dcc4 120deg 150deg,#c4b291 150deg 180deg,#e8dcc4 180deg 210deg,#c4b291 210deg 240deg,#e8dcc4 240deg 270deg,#c4b291 270deg 300deg,#e8dcc4 300deg 330deg,#c4b291 330deg 360deg);display:flex;align-items:center;justify-content:center;${reelAnimB}`)}><div style={cssText("width:50px;height:50px;border-radius:50%;background:#0c0906;")}></div></div>
              </div>
            </div>
          </div>
        )}

        {/* idle record button (cassette) */}
        {phase === "idle" && (
          <>
            <button onClick={start} style={cssText("position:absolute;bottom:150px;left:50%;transform:translateX(-50%);z-index:5;width:152px;height:98px;border:none;border-radius:15px;background:linear-gradient(160deg,#CD8140,#8E3F27);cursor:pointer;box-shadow:0 16px 40px rgba(160,86,58,.5),inset 0 2px 3px rgba(255,255,255,.32),inset 0 -8px 18px rgba(0,0,0,.28);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:0;")}>
              <div style={cssText("display:flex;align-items:center;gap:7px;background:#F4EDDB;border-radius:5px;padding:3px 11px;box-shadow:0 1px 2px rgba(0,0,0,.25);")}><span style={cssText("width:8px;height:8px;border-radius:50%;background:#C4241A;box-shadow:0 0 8px #C4241A;animation:mGlow 1.4s ease-in-out infinite;")}></span><span style={cssText("font-size:10px;font-weight:800;letter-spacing:.12em;color:#2E2418;")}>REC</span></div>
              <div style={cssText("display:flex;gap:28px;")}>
                <div style={cssText("width:26px;height:26px;border-radius:50%;background:#F4EDDB;box-shadow:inset 0 1px 2px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;")}><div style={cssText("width:8px;height:8px;border-radius:50%;background:#2E2418;")}></div></div>
                <div style={cssText("width:26px;height:26px;border-radius:50%;background:#F4EDDB;box-shadow:inset 0 1px 2px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;")}><div style={cssText("width:8px;height:8px;border-radius:50%;background:#2E2418;")}></div></div>
              </div>
            </button>
            <div style={cssText("position:absolute;bottom:118px;left:50%;transform:translateX(-50%);z-index:5;font-size:12px;font-weight:600;color:#57565E;")}>Tap to record</div>
            <div style={cssText("position:absolute;bottom:70px;left:50%;transform:translateX(-50%);z-index:5;font-size:12px;color:#8a8791;")}>
              Mic blocked?{" "}
              <label style={cssText("color:#B5503C;cursor:pointer;")}>
                Upload a file
                <input type="file" accept="audio/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
              </label>
            </div>
          </>
        )}
        {/* recording controls */}
        {phase === "recording" && (
          <div style={cssText("position:absolute;bottom:236px;left:0;right:0;z-index:6;padding:0 32px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;")}>
            <button onClick={discard} style={cssText("justify-self:end;padding:10px 18px;border-radius:20px;background:rgba(255,255,255,.08);color:#efe4cf;font-size:14px;font-weight:600;border:none;cursor:pointer;")}>Cancel</button>
            <button onClick={stop} style={cssText("width:80px;height:80px;border-radius:50%;background:linear-gradient(145deg,#C97B3C,#A8432F);border:5px solid rgba(255,255,255,.16);cursor:pointer;box-shadow:0 14px 34px rgba(160,86,58,.5);display:flex;align-items:center;justify-content:center;")}><div style={cssText("width:26px;height:26px;border-radius:6px;background:#fff;")}></div></button>
            <button onClick={stop} style={cssText("justify-self:start;padding:10px 18px;border-radius:20px;background:rgba(255,255,255,.08);color:#efe4cf;font-size:14px;font-weight:600;border:none;cursor:pointer;")}>Save</button>
          </div>
        )}
      </div>

      {/* reveal / complete sheet */}
      {phase === "reveal" && (
        <div className="m-scroll" style={cssText("position:fixed;inset:0;z-index:20;background:#EFE6D4;display:flex;flex-direction:column;padding:60px 24px 28px;-webkit-overflow-scrolling:touch;")}>
          <div style={cssText("font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8a7d68;")}>Analysis · pulled from the shell</div>
          <input value={pendingTitle} onChange={(e) => setPendingTitle(e.target.value)} style={cssText("margin-top:6px;border:none;background:none;outline:none;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#2E2418;padding:0;")} />
          <div style={cssText("font-size:12.5px;color:#8a7d68;margin-top:2px;")}>Edit the title, or keep the suggestion.</div>

          {/* play row */}
          <div style={cssText("margin-top:16px;display:flex;gap:10px;")}>
            <button onClick={togglePlay} style={cssText("width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:13px;border-radius:13px;border:none;background:#2E2418;color:#F4EDDB;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 6px 16px rgba(46,36,24,.24);")}>{playing ? "❚❚" : "▶"} {playing ? "Playing" : "Play take"}</button>
          </div>

          {/* compact stat grid, no tags */}
          <div style={cssText("margin-top:16px;display:grid;grid-template-columns:1fr 1fr;background:#F7F1E3;border:1px solid rgba(46,36,24,.12);border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(60,44,32,.07);")}>
            {revealStats.map((s, i) => {
              // Staggered entrance via a self-completing CSS animation (fill-mode both),
              // not a setTimeout chain — a JS timer chain stalls if the tab gets
              // backgrounded mid-analysis (browsers throttle background-tab timers),
              // which could leave this row stuck invisible. This always finishes.
              const cell = `padding:13px 15px;border-right:1px solid rgba(46,36,24,.1);border-bottom:1px solid rgba(46,36,24,.1);animation:mUp .35s ease ${(i * 0.12).toFixed(2)}s both;`;
              const valStyle = s.inf
                ? "font-size:17px;font-weight:800;font-style:italic;color:#9A5A3C;margin-top:3px;text-transform:capitalize;"
                : "font-size:17px;font-weight:800;color:#2E2418;margin-top:3px;";
              return (
                <div key={s.label} style={cssText(cell)}>
                  <div style={cssText("font-size:10px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#8a7d68;")}>{s.label}</div>
                  <div style={cssText(valStyle)}>{s.value}</div>
                </div>
              );
            })}
          </div>

          {/* sounds like — Gemini-suggested, iTunes-resolved, playable */}
          {soundsLike.length > 0 && (
            <>
              <div style={cssText("margin-top:22px;display:flex;align-items:baseline;justify-content:space-between;")}>
                <div style={cssText("font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a7d68;")}>Sounds like</div>
                <div style={cssText("font-size:11.5px;font-weight:600;color:#a89a82;")}>tap to preview</div>
              </div>
              <div style={cssText("margin-top:12px;display:flex;flex-direction:column;gap:9px;")}>
                {soundsLike.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => togglePreview(t.previewUrl)}
                    style={cssText("display:flex;align-items:center;gap:12px;padding:8px;border-radius:12px;background:#F7F1E3;border:1px solid rgba(46,36,24,.1);cursor:pointer;text-align:left;width:100%;")}
                  >
                    <div style={cssText(`width:44px;height:44px;border-radius:9px;flex:none;background-color:#e3d8c4;background-image:url(${t.artworkUrl});background-size:cover;background-position:center;box-shadow:0 3px 7px rgba(46,36,24,.18);`)}></div>
                    <div style={cssText("flex:1;min-width:0;")}>
                      <div style={cssText("font-size:14px;font-weight:700;color:#2E2418;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.title}</div>
                      <div style={cssText("font-size:11.5px;color:#8a7d68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.artist}</div>
                    </div>
                    <span style={cssText("font-size:16px;color:#B5503C;flex:none;")}>{previewPlayingUrl === t.previewUrl ? "❚❚" : "▶"}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={cssText("margin-top:auto;display:flex;gap:10px;padding-top:22px;")}>
            <button onClick={discard} style={cssText("flex:none;padding:15px 18px;border-radius:15px;border:1px solid rgba(46,36,24,.14);background:#F7F1E3;color:#8a7d68;font-weight:600;font-size:14px;cursor:pointer;")}>Discard</button>
            <button onClick={start} style={cssText("flex:none;padding:15px 18px;border-radius:15px;border:1px solid rgba(46,36,24,.14);background:#F7F1E3;color:#8a7d68;font-weight:600;font-size:14px;cursor:pointer;")}>Retry</button>
            <button onClick={save} style={cssText(saveBtnStyle)}>Save idea</button>
          </div>
        </div>
      )}
    </div>
  );
}
