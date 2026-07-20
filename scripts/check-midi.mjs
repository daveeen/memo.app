// Real, runnable validity check for app/lib/audio/midi.ts — no test framework,
// just assert. @tonejs/midi has no WASM/browser-only dependency so this
// genuinely executes in plain Node.
//
// Run with:
//   node --experimental-strip-types scripts/check-midi.mjs
//
// The --experimental-strip-types flag is required (not optional) on this
// project's installed Node (v22.14.0) because the second block below imports
// buildMidi() straight from the real ../app/lib/audio/midi.ts source — Node's
// default loader throws ERR_UNKNOWN_FILE_EXTENSION on a bare ".ts" import
// without it (verified). Without the flag only the first block would run.
import assert from "node:assert";
import midiPkg from "@tonejs/midi";
import { buildMidi } from "../app/lib/audio/midi.ts";

const { Midi } = midiPkg;

// --- Block 1: bare @tonejs/midi API roundtrip -------------------------------
{
  const midi = new Midi();
  midi.header.setTempo(120);
  const t = midi.addTrack();
  t.addNote({ midi: 60, time: 0, duration: 0.5 });
  const bytes = midi.toArray();
  const parsed = new Midi(bytes);
  assert(parsed.tracks[0].notes.length === 1, "midi roundtrip failed");
  console.log("MIDI roundtrip OK");
}

// --- Block 2: buildMidi() with real upstream-shaped input -------------------
// notes shape matches analyze.ts's framesToNotes/midiToName output
// (CaptureAnalysis.notes); chordChart shape matches SongBuild.chordChart /
// chords.ts's nearestChord output ("C", "Am", ...).
{
  const notes = [
    { pitch: "C4", startSec: 0, durSec: 0.5 },
    { pitch: "E4", startSec: 0.5, durSec: 0.5 },
    { pitch: "G4", startSec: 1.0, durSec: 0.5 },
  ];
  const chordChart = [{ chord: "C" }, { chord: "Am" }, { chord: "F" }, { chord: "G" }];
  const bpm = 120;

  const bytes = buildMidi(notes, chordChart, bpm);
  assert(bytes instanceof Uint8Array, "buildMidi did not return a Uint8Array");

  const parsed = new Midi(bytes);
  assert(parsed.tracks.length === 2, `expected 2 tracks, got ${parsed.tracks.length}`);

  const melody = parsed.tracks.find((tr) => tr.name === "melody");
  const chords = parsed.tracks.find((tr) => tr.name === "chords");
  assert(melody, "melody track missing");
  assert(chords, "chords track missing");
  assert(
    melody.notes.length === notes.length,
    `expected ${notes.length} melody notes, got ${melody.notes.length}`,
  );
  assert(
    chords.notes.length === chordChart.length * 3,
    `expected ${chordChart.length * 3} chord notes, got ${chords.notes.length}`,
  );

  // Spot-check actual MIDI numbers, not just counts.
  assert(melody.notes[0].midi === 60, `expected C4 -> midi 60, got ${melody.notes[0].midi}`);
  assert(melody.notes[1].midi === 64, `expected E4 -> midi 64, got ${melody.notes[1].midi}`);
  assert(melody.notes[2].midi === 67, `expected G4 -> midi 67, got ${melody.notes[2].midi}`);
  for (const n of [...melody.notes, ...chords.notes]) {
    assert(n.midi >= 0 && n.midi <= 127, `midi value out of range: ${n.midi}`);
  }

  console.log(
    `buildMidi() roundtrip OK: ${melody.notes.length} melody notes, ${chords.notes.length} chord notes`,
  );
}
