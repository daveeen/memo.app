import * as Tone from "tone";

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
  const beat = (60 / bpm) * 2;
  let t = Tone.now();
  for (const c of chordChart) {
    // chords.ts's nearestChord only ever emits a bare pitch class ("C") or
    // pitch class + "m" ("C#m") — never "maj"/"dim"/"7" — so only the "m"
    // alternative ever actually fires here (see midi.ts for the confirmed
    // reasoning). Stripping it leaves the root untouched, e.g. "C#m" -> "C#".
    const root = c.chord.replace(/m|maj|dim|7/g, "");
    synth.triggerAttackRelease([`${root}3`, `${root}4`], beat, t);
    t += beat;
  }
}
