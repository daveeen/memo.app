import { useState } from "react";
import { buildSong } from "~/lib/api/arrange";
import { buildMidi } from "~/lib/audio/midi";
import { playSong } from "~/lib/audio/playback";
import { saveSong } from "~/lib/api/bank";

export function SongBuilderPanel({ idea, brief, analyser, onBuilt }: { idea: any; brief: any; analyser?: AnalyserNode; onBuilt?: (midiPath: string) => void }) {
  const [song, setSong] = useState<any>();
  const [busy, setBusy] = useState(false);

  async function build() {
    setBusy(true);
    try {
      const s = await buildSong(idea, brief);
      const midi = buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm);
      const { midiPath } = await saveSong(s, midi);
      setSong({ ...s, midiPath });
      onBuilt?.(midiPath);
    } catch {
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return <div>
    <button disabled={!idea || !brief || busy} onClick={build}>{busy ? "Building…" : "Build"}</button>
    {song && <>
      <ol>{song.structure.map((x: any) => <li key={x.order}>{x.label}</li>)}</ol>
      <div>{song.chordChart.map((c: any, i: number) => <span key={i}>{c.chord} </span>)}</div>
      <div>Layers: {song.instrumentation.join(", ")}</div>
      <button onClick={() => playSong(song.chordChart, idea.bpm, analyser)}>▶ Play</button>
    </>}
  </div>;
}
