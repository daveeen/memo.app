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
import type { Track } from "@tonejs/midi";
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

// Major or minor triad rooted around MIDI 48-67 (octave 3-ish) — clear of the
// melody track's typical vocal range and well inside the valid 0-127 range.
// Mirrors chords.ts's triad(root, minor): [0, minor ? 3 : 4, 7].
function triadNotes(root: string, isMinor: boolean): number[] {
  const base = NOTE_TO_SEMITONE[root] ?? 0;
  const third = isMinor ? 3 : 4;
  return [0, third, 7].map((interval) => 48 + base + interval);
}

// Raw-MIDI-pitch note shape (as opposed to buildMidi's `notes` param, which
// uses scientific-pitch-notation strings like "C4"). Exported so
// app/lib/opendaw/exportMidi.ts (Task 5, the inverse of importMidi.ts/Task 4)
// can write openDAW project note events straight to a MIDI track: those
// events already carry an int MIDI pitch (NoteEventBox.pitch), so routing
// them through nameToMidi(midiToName(x)) would be a pointless round trip —
// this is the one piece of buildMidi's per-note track-writing loop that's
// shape-identical either way, so it's extracted rather than duplicated.
export type PlayableNote = { pitch: number; startSec: number; durSec: number };

export function addNotesToTrack(track: Track, notes: PlayableNote[]): void {
  for (const n of notes) {
    track.addNote({ midi: n.pitch, time: n.startSec, duration: Math.max(0.1, n.durSec) });
  }
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
  addNotesToTrack(
    melody,
    notes.map((n) => ({ pitch: nameToMidi(n.pitch), startSec: n.startSec, durSec: n.durSec })),
  );

  const chords = midi.addTrack();
  chords.name = "chords";
  let t = 0;
  const beatSec = (60 / bpm) * 2;
  for (const c of chordChart) {
    // chords.ts's nearestChord only ever emits a bare pitch class ("C") or
    // pitch class + "m" ("C#m") — never "maj"/"dim"/"7" — so a trailing "m"
    // unambiguously means minor (no pitch-class letter ends in "m").
    // Read the quality BEFORE stripping, then strip to isolate the root
    // (stripping leaves the root untouched, e.g. "C#m" -> "C#").
    const isMinor = c.chord.endsWith("m");
    const root = c.chord.replace(/m|maj|dim|7/g, "");
    for (const noteMidi of triadNotes(root, isMinor)) {
      chords.addNote({ midi: noteMidi, time: t, duration: beatSec });
    }
    t += beatSec;
  }

  return midi.toArray();
}
