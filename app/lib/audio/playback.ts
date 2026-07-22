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

export interface SongPlayback {
  stop(): void;
  seek(sec: number): void;
  getPosition(): number;
  getDuration(): number;
}

// Tone.Transport is a global singleton — only one playSong() can genuinely be
// "active" at a time. If a new playSong() call arrives while a previous one
// is still playing (e.g. a caller forgot to call stop() first, or a rapid
// double-click race started a second call before the first finished
// awaiting Tone.start()/Tone.loaded()), stopping/disposing the old one here
// makes this module self-protecting regardless of caller discipline —
// otherwise both the old and new Tone.Part would end up scheduled on the
// same Transport simultaneously (overlapping audio + a leaked Part/Sampler).
let activeStop: (() => void) | null = null;

// ponytail: Salamander piano samples over the network = "sampled instruments"
// with zero asset work; swap to bundled soundfont if offline demo needed.
//
// Schedules chords onto Tone.Transport via a Tone.Part instead of raw
// Tone.now()-offset one-shots — the previous version returned nothing to
// control, so there was no way to stop, seek, or query position at all.
// Transport natively tracks position and supports start/stop/seek, which is
// what makes a real progress bar and scrubbing possible.
// Only one song plays at a time (Tone.Transport is a global singleton) — see
// `activeStop` above for how a new call safely displaces a still-active one.
export async function playSong(
  chordChart: { chord: string }[],
  bpm: number,
  analyser?: AnalyserNode,
): Promise<SongPlayback> {
  activeStop?.();
  await Tone.start();
  // Tone.start() calls context.resume() and waits, but some mobile browsers
  // (notably iOS Safari) have been seen leaving the raw AudioContext in
  // "suspended" even after that promise resolves, especially the first time
  // in a session — the Transport still schedules/advances normally (it's
  // just JS timing), which is exactly the "runs but silent" symptom. Belt
  // and suspenders: force it and note if it's still stuck, since a silently
  // suspended context is otherwise very hard to tell apart from "no audio
  // graph issue at all" from a bug report alone.
  const rawContext = Tone.getContext().rawContext as AudioContext;
  if (rawContext.state !== "running") {
    await rawContext.resume().catch(() => {});
    const stateAfter = rawContext.state as string;
    if (stateAfter !== "running") {
      console.warn("[playback] AudioContext still", stateAfter, "after resume — audio will likely be silent");
    }
  }
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
  const duration = chordChart.length * beat;

  const events: [number, { chord: string }][] = chordChart.map((c, i) => [i * beat, c]);
  const part = new Tone.Part((time, value) => {
    // chords.ts's nearestChord only ever emits a bare pitch class ("C") or
    // pitch class + "m" ("C#m") — never "maj"/"dim"/"7" — so a trailing "m"
    // unambiguously means minor (no pitch-class letter ends in "m").
    // Read the quality BEFORE stripping, then strip to isolate the root
    // (stripping leaves the root untouched, e.g. "C#m" -> "C#"). Mirrors
    // chords.ts's triad(root, minor): [0, minor ? 3 : 4, 7] and the same
    // fix applied in midi.ts's triadNotes().
    const isMinor = value.chord.endsWith("m");
    const root = value.chord.replace(/m|maj|dim|7/g, "");
    const third = isMinor ? 3 : 4;
    // Real triad (root + third + fifth) instead of a root-only octave
    // unison, kept within the existing octave 3-4 register. `time` is the
    // Part callback's own scheduled time, not Tone.now() — required for
    // sample-accurate playback under Transport.
    synth.triggerAttackRelease(
      [`${root}3`, transposeNote(root, 3, third), transposeNote(root, 3, 7), `${root}4`],
      beat,
      time,
    );
  }, events);
  part.start(0);

  Tone.Transport.stop();
  Tone.Transport.seconds = 0;
  Tone.Transport.start();

  let disposed = false;
  const controller: SongPlayback = {
    stop() {
      if (disposed) return;
      disposed = true;
      if (activeStop === controller.stop) activeStop = null;
      Tone.Transport.stop();
      part.dispose();
      synth.dispose();
    },
    seek(sec: number) {
      if (disposed) return;
      Tone.Transport.seconds = Math.max(0, Math.min(sec, duration));
    },
    getPosition() {
      if (disposed) return 0;
      return Tone.Transport.seconds;
    },
    getDuration() {
      return duration;
    },
  };
  activeStop = controller.stop;
  return controller;
}
