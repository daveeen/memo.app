import { useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import { supabase } from "~/lib/supabase";
import { RecordPanel } from "~/components/RecordPanel";
import { BankList } from "~/components/BankList";
import { VibeBriefPanel } from "~/components/VibeBriefPanel";
import { SongBuilderPanel } from "~/components/SongBuilderPanel";
import { ProducePanel } from "~/components/ProducePanel";
import { Visualizer } from "~/components/Visualizer";
import { Timer } from "~/components/Timer";
import { listBriefs } from "~/lib/api/bank";

export default function Dashboard() {
  const [analyser, setAnalyser] = useState<AnalyserNode>();
  const analyserRef = useRef<AnalyserNode>(undefined);
  const [k, setK] = useState(0);
  const [idea, setIdea] = useState<any>();
  const [brief, setBrief] = useState<any>();
  const [midiPath, setMidiPath] = useState<string>();
  const [briefs, setBriefs] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);

  // Shared analyser, created lazily on the first user gesture. It MUST be sourced
  // from Tone's AudioContext (not `new AudioContext()`): playSong connects a Tone
  // synth to this node and Web Audio forbids cross-context connections, so a fresh
  // context would make playback throw. Tone stays on a DummyContext until the
  // first getContext(), so deferring to a gesture also sidesteps the browser
  // autoplay-policy warning of constructing a context before any interaction.
  function ensureAudio() {
    Tone.start();
    if (analyserRef.current) return;
    const a = Tone.getContext().createAnalyser();
    a.fftSize = 1024;
    analyserRef.current = a;
    setAnalyser(a);
  }

  // Client-side auth guard: ssr:false means there's no loader to redirect from,
  // so gate rendering on the session check — returning null until it resolves so
  // the dashboard never flashes before an unauthenticated visitor hits /login.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { location.href = "/login"; return; }
      setReady(true);
    });
  }, []);
  useEffect(() => { listBriefs().then(setBriefs); }, [k]);

  if (!ready) return null;

  return (
    <main onPointerDownCapture={ensureAudio}>
      <Timer running={running} />
      <Visualizer analyser={analyser} />
      <RecordPanel analyser={analyser} onSaved={() => setK(k => k + 1)} />
      <BankList refreshKey={k} onPick={i => { setIdea(i); setRunning(true); }} />
      <VibeBriefPanel onSaved={() => setK(k => k + 1)} />
      <select value={brief?.id ?? ""} onChange={e => setBrief(briefs.find(b => b.id === e.target.value))}>
        <option value="">pick brief</option>
        {briefs.map(b => <option key={b.id} value={b.id}>{b.source_track_name}</option>)}
      </select>
      <SongBuilderPanel idea={idea} brief={brief} analyser={analyser} onBuilt={setMidiPath} />
      <ProducePanel midiPath={midiPath} />
    </main>
  );
}
