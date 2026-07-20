import { useRef, useState } from "react";
import { analyzeCapture } from "~/lib/audio/analyze";
import { saveIdea } from "~/lib/api/bank";

export function RecordPanel({ onSaved, analyser }: { onSaved: () => void; analyser?: AnalyserNode }) {
  const rec = useRef<MediaRecorder>(undefined);
  const stream = useRef<MediaStream>(undefined);
  const src = useRef<MediaStreamAudioSourceNode>(undefined);
  const chunks = useRef<Blob[]>([]);
  const [status, setStatus] = useState<"idle" | "rec" | "analyzing">("idle");

  async function start() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("idle");
      return;
    }
    // Tap the mic into the shared analyser so the Visualizer reacts while
    // recording. The source is created from `analyser.context` — the same
    // AudioContext the analyser lives in — so the connection is intra-context;
    // it is NOT routed to destination, so there's no mic monitoring/feedback.
    if (analyser) {
      try {
        const ctx = analyser.context as AudioContext;
        await ctx.resume();
        src.current = ctx.createMediaStreamSource(stream.current);
        src.current.connect(analyser);
      } catch { /* visualization is best-effort; recording still proceeds */ }
    }
    rec.current = new MediaRecorder(stream.current);
    chunks.current = [];
    rec.current.ondataavailable = e => chunks.current.push(e.data);
    rec.current.onstop = async () => {
      stream.current?.getTracks().forEach(t => t.stop());
      src.current?.disconnect();
      src.current = undefined;
      setStatus("analyzing");
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      const a = await analyzeCapture(blob);
      await saveIdea(blob, a, "Untitled");
      setStatus("idle");
      onSaved();
    };
    rec.current.start();
    setStatus("rec");
  }
  const stop = () => rec.current?.stop();
  return <div>
    {status !== "rec" ? <button disabled={status === "analyzing"} onClick={start}>{status === "analyzing" ? "Analyzing…" : "Record"}</button>
      : <button onClick={stop}>Stop</button>}
  </div>;
}
