import { useRef, useState } from "react";
import { analyzeCapture } from "~/lib/audio/analyze";
import { saveIdea } from "~/lib/api/bank";

export function RecordPanel({ onSaved }: { onSaved: () => void }) {
  const rec = useRef<MediaRecorder>(undefined);
  const stream = useRef<MediaStream>(undefined);
  const chunks = useRef<Blob[]>([]);
  const [status, setStatus] = useState<"idle" | "rec" | "analyzing">("idle");

  async function start() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus("idle");
      return;
    }
    rec.current = new MediaRecorder(stream.current);
    chunks.current = [];
    rec.current.ondataavailable = e => chunks.current.push(e.data);
    rec.current.onstop = async () => {
      stream.current?.getTracks().forEach(t => t.stop());
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
