import { useState } from "react";
import { buildSong } from "~/lib/api/arrange";
import { buildMidi } from "~/lib/audio/midi";
import { playSong } from "~/lib/audio/playback";
import { saveSong } from "~/lib/api/bank";

export function SongBuilderPanel({ idea, brief, analyser, onBuilt }: { idea: any; brief: any; analyser?: AnalyserNode; onBuilt?: (songId: string, midiPath: string) => void }) {
  const [song, setSong] = useState<any>();
  const [busy, setBusy] = useState(false);

  async function build() {
    // TEMP diagnostic logging — remove once the "build not working" report is
    // root-caused. Real error was being swallowed silently before this.
    console.log("[SongBuilderPanel] build() called", { idea, brief });
    setBusy(true);
    try {
      const s = await buildSong(idea, brief);
      console.log("[SongBuilderPanel] buildSong ok", s);
      const midi = buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm);
      console.log("[SongBuilderPanel] buildMidi ok", { bytes: midi.length });
      const { song: savedSong, midiPath } = await saveSong(s, midi);
      console.log("[SongBuilderPanel] saveSong ok", savedSong.id, midiPath);
      setSong({ ...s, midiPath });
      onBuilt?.(savedSong.id, midiPath);
    } catch (err) {
      console.error("[SongBuilderPanel] build failed:", err);
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  return <div>
    <button disabled={!idea || !brief || busy} onClick={build}>{busy ? "Building…" : "Build"}</button>
    {(!idea || !brief) && !busy && (
      <p>
        {!idea && !brief ? "Pick an idea and a brief to build." : !idea ? "Pick an idea to build." : "Pick a brief to build."}
      </p>
    )}
    {song && <>
      <ol>{song.structure.map((x: any) => <li key={x.order}>{x.label}</li>)}</ol>
      <div>{song.chordChart.map((c: any, i: number) => <span key={i}>{c.chord} </span>)}</div>
      <div>Layers: {song.instrumentation.join(", ")}</div>
      <button onClick={() => playSong(song.chordChart, idea.bpm, analyser)}>▶ Play</button>
    </>}
  </div>;
}
