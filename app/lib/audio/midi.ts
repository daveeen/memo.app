// Note: default-import + destructure (not `import { Midi } from "@tonejs/midi"`)
// so this module loads identically under Vite's bundler AND under a bare
// `node --experimental-strip-types` run (see scripts/check-midi.mjs, which
// imports buildMidi from this file directly to test the real code path).
// @tonejs/midi ships no "exports" map and its "main" build is a CJS/UMD
// bundle with no statically-analyzable named exports, so a native ESM
// `import { Midi }` throws `SyntaxError: Named export 'Midi' not found`
// under plain Node (verified) even though Vite's esbuild bundling papers
// over it for the browser build.
import pkg from "@tonejs/midi";
const { Midi } = pkg;

// Semitone offset from C for each pitch class. Sharps only (never flats) to
// match analyze.ts's midiToName, which always emits e.g. "C#4", never "Db4".
const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

// Inverse of analyze.ts's midiToName:
//   NOTE_NAMES[m % 12] + (Math.floor(m / 12) - 1)
// e.g. midi 60 -> "C4", so "C4" -> 60 here. Falls back to middle C (60) for
// anything that doesn't parse as scientific pitch notation.
function nameToMidi(name: string): number {
  const match = name.match(/^([A-G]#?)(-?\d)$/);
  if (!match) return 60;
  const [, pitchClass, octave] = match;
  return NOTE_TO_SEMITONE[pitchClass] + (parseInt(octave, 10) + 1) * 12;
}

// Plain major triad rooted around MIDI 48-66 (octave 3-ish) — clear of the
// melody track's typical vocal range and well inside the valid 0-127 range.
function triadNotes(root: string): number[] {
  const base = NOTE_TO_SEMITONE[root] ?? 0;
  return [0, 4, 7].map((interval) => 48 + base + interval);
}

export function buildMidi(
  notes: { pitch: string; startSec: number; durSec: number }[],
  chordChart: { chord: string }[],
  bpm: number,
): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);

  const melody = midi.addTrack();
  melody.name = "melody";
  for (const n of notes) {
    melody.addNote({
      midi: nameToMidi(n.pitch),
      time: n.startSec,
      duration: Math.max(0.1, n.durSec),
    });
  }

  const chords = midi.addTrack();
  chords.name = "chords";
  let t = 0;
  const beatSec = (60 / bpm) * 2;
  for (const c of chordChart) {
    // chords.ts's nearestChord only ever emits a bare pitch class ("C") or
    // pitch class + "m" ("C#m") — never "maj"/"dim"/"7" — so only the "m"
    // alternative ever actually fires here. Stripping it leaves the root
    // untouched (no note letter contains "m"), e.g. "C#m" -> "C#".
    const root = c.chord.replace(/m|maj|dim|7/g, "");
    for (const noteMidi of triadNotes(root)) {
      chords.addNote({ midi: noteMidi, time: t, duration: beatSec });
    }
    t += beatSec;
  }

  return midi.toArray();
}
