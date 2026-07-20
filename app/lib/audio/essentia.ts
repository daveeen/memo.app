// essentia.js 0.1.3 ships no "types" field and no .d.ts beside its deep ES-module
// paths, so these imports are untyped (TS7016 suppressed below); the real shape is
// re-imposed via EssentiaInstance + the cast in getEssentia(). We import the browser
// ES builds directly. The WASM build (essentia-wasm.es.js) embeds the binary and
// instantiates synchronously via `new WebAssembly.Instance`, so EssentiaWASM is a
// ready module object and getEssentia() is sync — NOT an async factory / .ready promise.
// @ts-expect-error - untyped ES module (no bundled declarations)
import Essentia from "essentia.js/dist/essentia.js-core.es.js";
// @ts-expect-error - untyped ES module (no bundled declarations)
import { EssentiaWASM } from "essentia.js/dist/essentia-wasm.es.js";

/** A WASM std::vector<float> handle (from arrayToVector / algorithm outputs). */
export interface EssentiaVector {
  size(): number;
  get(index: number): number;
}

/** The subset of the Essentia core API this app uses. */
export interface EssentiaInstance {
  version: string;
  arrayToVector(input: Float32Array | number[]): EssentiaVector;
  vectorToArray(input: EssentiaVector): Float32Array;
  KeyExtractor(audio: EssentiaVector): { key: string; scale: string; strength: number };
  PercivalBpmEstimator(signal: EssentiaVector): { bpm: number };
  OnsetRate(signal: EssentiaVector): { onsets: EssentiaVector; onsetRate: number };
  Spectrum(frame: EssentiaVector, size?: number): { spectrum: EssentiaVector };
  Flatness(array: EssentiaVector): { flatness: number };
  PitchYinProbabilistic(
    signal: EssentiaVector,
    frameSize?: number,
    hopSize?: number,
    lowRMSThreshold?: number,
    outputUnvoiced?: string,
    preciseTime?: boolean,
    sampleRate?: number,
  ): { pitch: EssentiaVector; voicedProbabilities: EssentiaVector };
}

let _e: EssentiaInstance | null = null;

export function getEssentia(): EssentiaInstance {
  if (!_e) _e = new Essentia(EssentiaWASM) as EssentiaInstance;
  return _e;
}
