import * as Tone from "tone";

// Sharps-only pitch classes, matching chords.ts's chord-label alphabet (no
// flats ever appear in a chord string here). Used to transpose a triad's
// third/fifth off the root without relying on Tone's note-name parser
// supporting inline semitone offsets — it doesn't: Tone.Frequency's `note`
// expression regexp (node_modules/tone/build/esm/core/type/Frequency.js) is
// `^([a-g]{1}(?:b|#|##|x|bb|###|#x|x#|bbb)?)(-?[0-9]+)`, i.e. pitch letter +
// optional accidental + octave only, nothing after — a string like "C3+4"
// is not valid Tone note syntax.
const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Transpose a pitch class in a given octave up by `interval` semitones,
// returning a Tone-compatible note name (e.g. transposeNote("A", 3, 3) ->
// "C4"). Handles octave rollover for intervals that cross a C boundary.
function transposeNote(pitchClass: string, octave: number, interval: number): string {
  const index = Math.max(0, PITCH_CLASSES.indexOf(pitchClass));
  const total = index + interval;
  const newIndex = ((total % 12) + 12) % 12;
  const octaveShift = Math.floor(total / 12);
  return `${PITCH_CLASSES[newIndex]}${octave + octaveShift}`;
}

// ponytail: Salamander piano samples over the network = "sampled instruments"
// with zero asset work; swap to bundled soundfont if offline demo needed.
export async function playSong(
  chordChart: { chord: string }[],
  bpm: number,
  analyser?: AnalyserNode,
) {
  await Tone.start();
  // Tone.Sampler is used directly (not wrapped in Tone.PolySynth): v15's
  // `PolySynth<Voice extends Monophonic<any>>` constraint rejects Sampler
  // (it extends Instrument, not Monophonic — confirmed via tsc, see report).
  // Sampler is already polyphonic on its own — triggerAttackRelease accepts
  // an array of notes and manages concurrent voices internally.
  const synth = new Tone.Sampler({
    urls: { C4: "C4.mp3", A4: "A4.mp3" },
    baseUrl: "https://tonejs.github.io/audio/salamander/",
  }).toDestination();
  if (analyser) synth.connect(analyser);
  // Sampler loads its urls asynchronously; scheduling notes before the
  // buffers finish loading can silently drop early notes. Tone.loaded()
  // resolves once every scheduled buffer load (including this Sampler's)
  // has finished (confirmed via node_modules/tone/build/esm/index.d.ts).
  await Tone.loaded();
  const beat = (60 / bpm) * 2;
  let t = Tone.now();
  for (const c of chordChart) {
    // chords.ts's nearestChord only ever emits a bare pitch class ("C") or
    // pitch class + "m" ("C#m") — never "maj"/"dim"/"7" — so a trailing "m"
    // unambiguously means minor (no pitch-class letter ends in "m").
    // Read the quality BEFORE stripping, then strip to isolate the root
    // (stripping leaves the root untouched, e.g. "C#m" -> "C#"). Mirrors
    // chords.ts's triad(root, minor): [0, minor ? 3 : 4, 7] and the same
    // fix applied in midi.ts's triadNotes().
    const isMinor = c.chord.endsWith("m");
    const root = c.chord.replace(/m|maj|dim|7/g, "");
    const third = isMinor ? 3 : 4;
    // Real triad (root + third + fifth) instead of a root-only octave
    // unison, kept within the existing octave 3-4 register.
    synth.triggerAttackRelease(
      [
        `${root}3`,
        transposeNote(root, 3, third),
        transposeNote(root, 3, 7),
        `${root}4`,
      ],
      beat,
      t,
    );
    t += beat;
  }
}
