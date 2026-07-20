import type { EssentiaInstance, EssentiaVector } from "./essentia";

const PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Essentia core methods used for per-frame chord estimation that EssentiaInstance
 * (the app's declared subset) does not expose. The runtime object from getEssentia()
 * has them; detectChords narrows to this shape with a cast (Spectrum/vectorToArray
 * are already on EssentiaInstance, so they stay off this interface).
 */
interface ChordEssentia {
  FrameGenerator(
    signal: Float32Array,
    frameSize?: number,
    hopSize?: number,
  ): { size(): number; get(index: number): EssentiaVector };
  Windowing(frame: EssentiaVector): { frame: EssentiaVector };
  SpectralPeaks(spectrum: EssentiaVector): {
    frequencies: EssentiaVector;
    magnitudes: EssentiaVector;
  };
  HPCP(frequencies: EssentiaVector, magnitudes: EssentiaVector): { hpcp: EssentiaVector };
}

export interface ChordSpan {
  chord: string;
  startSec: number;
  durSec: number;
}

/** Binary triad template (root + third + fifth) in C-based pitch-class space. */
function triad(root: number, minor: boolean): number[] {
  const t = new Array(12).fill(0);
  [0, minor ? 3 : 4, 7].forEach((iv) => (t[(root + iv) % 12] = 1));
  return t;
}

// Essentia's HPCP aligns output bin 0 to its reference pitch class A (pc 9), not C.
// Verified empirically against pure tones: pitch class pc lands in HPCP bin
// (pc + 3) % 12. Rotate back to a C-based chroma (index 0 = C) so the triad
// templates line up; without this the whole result is transposed (C reads as D#).
function toCChroma(hpcp: Float32Array): number[] {
  const c = new Array<number>(12);
  for (let pc = 0; pc < 12; pc++) c[pc] = hpcp[(pc + 3) % 12];
  return c;
}

/** Best-matching major/minor triad label for a C-based chroma via template dot-product. */
function nearestChord(chroma: number[]): string {
  let best = "C";
  let score = -1;
  for (let r = 0; r < 12; r++) {
    for (const minor of [false, true]) {
      const t = triad(r, minor);
      let dot = 0;
      for (let k = 0; k < 12; k++) dot += t[k] * chroma[k];
      if (dot > score) {
        score = dot;
        best = PC[r] + (minor ? "m" : "");
      }
    }
  }
  return best;
}

/**
 * Per-frame chord estimation: FrameGenerator -> Windowing -> Spectrum ->
 * SpectralPeaks -> HPCP -> triad-template match, merged into contiguous spans.
 * Sidesteps Essentia's ChordsDetection (finicky VectorVectorFloat marshalling).
 */
export function detectChords(e: EssentiaInstance, signal: Float32Array, sr = 44100): ChordSpan[] {
  const api = e as unknown as ChordEssentia;
  const frames = api.FrameGenerator(signal, 4096, 2048);
  const hop = 2048 / sr;
  const spans: ChordSpan[] = [];
  let prev = "";
  let start = 0;
  const n = frames.size();
  for (let i = 0; i < n; i++) {
    const win = api.Windowing(frames.get(i)).frame;
    const spec = e.Spectrum(win).spectrum;
    const pk = api.SpectralPeaks(spec);
    const chroma = toCChroma(e.vectorToArray(api.HPCP(pk.frequencies, pk.magnitudes).hpcp));
    const chord = nearestChord(chroma);
    if (chord !== prev) {
      if (prev) spans.push({ chord: prev, startSec: start, durSec: i * hop - start });
      prev = chord;
      start = i * hop;
    }
  }
  if (prev) spans.push({ chord: prev, startSec: start, durSec: n * hop - start });
  return spans;
}
