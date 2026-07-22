import { getEssentia } from "./essentia";
import { decodeAndClean } from "./decode";
import { detectChords } from "./chords";
import { segment } from "./segment";
import { bucketPeaks } from "~/lib/memoVisuals";
import type { CaptureAnalysis, VibeBrief } from "~/lib/types";

// PitchYinProbabilistic emits one pitch frame every HOP_SIZE samples.
const HOP_SIZE = 256;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const midiToName = (m: number) => {
  const r = Math.round(m);
  return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1);
};
const hzToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

export async function analyzeCapture(blob: Blob): Promise<Omit<CaptureAnalysis, "id" | "cleanedAudioPath">> {
  // TEMP diagnostic instrumentation — pinpointing a live-browser-only failure
  // (analyzeCapture/saveIdea throws a bare WASM pointer number, not an Error).
  // Remove once root cause is found and fixed.
  const e = getEssentia();
  console.log("[analyzeCapture] decoding blob", { size: blob.size, type: blob.type });
  const { pcm, sampleRate, durationSec } = await decodeAndClean(blob);
  console.log("[analyzeCapture] decoded", { pcmLength: pcm.length, sampleRate, durationSec });
  if (pcm.length === 0) console.warn("[analyzeCapture] pcm is EMPTY after silence-trim — likely cause");
  const vec = e.arrayToVector(pcm);

  let key: string, scale: string;
  try {
    ({ key, scale } = e.KeyExtractor(vec));
    console.log("[analyzeCapture] KeyExtractor ok", key, scale);
  } catch (err) { console.error("[analyzeCapture] KeyExtractor threw", err); throw err; }

  let bpm: number;
  try {
    bpm = e.PercivalBpmEstimator(vec).bpm;
    console.log("[analyzeCapture] PercivalBpmEstimator ok", bpm);
  } catch (err) { console.error("[analyzeCapture] PercivalBpmEstimator threw", err); throw err; }

  let py: any;
  try {
    py = e.PitchYinProbabilistic(vec, 4096, HOP_SIZE, 0.1, "zero", false, sampleRate);
    console.log("[analyzeCapture] PitchYinProbabilistic ok");
  } catch (err) { console.error("[analyzeCapture] PitchYinProbabilistic threw", err); throw err; }
  const pitches = e.vectorToArray(py.pitch);
  const voiced = e.vectorToArray(py.voicedProbabilities);
  console.log("[analyzeCapture] pitch frames", pitches.length);
  // Each frame spans exactly HOP_SIZE/sampleRate seconds. Do NOT derive hop from
  // durationSec/pitches.length: the frame grid covers fewer samples than the
  // (silence-trimmed) signal, so that back-derivation over-stretches note times.
  const hop = HOP_SIZE / sampleRate;
  const notes = framesToNotes(pitches, voiced, hop);

  const moodTag = moodFrom(scale, bpm);
  const waveformPeaks = bucketPeaks(pcm);
  return { durationSec, detectedKey: `${key} ${scale}`, bpm, moodTag, notes, waveformPeaks };
}

// Reference tracks (iTunes previews / uploads) are polyphonic songs, unlike a
// hummed capture, so this skips analyzeCapture's monophonic pitch-tracking/notes
// path entirely and uses harmony-aware chord detection + segmentation instead.
export async function analyzeReference(
  blob: Blob,
  name: string,
  source: "itunes" | "upload",
): Promise<Omit<VibeBrief, "id">> {
  const e = getEssentia();
  const { pcm } = await decodeAndClean(blob);
  const vec = e.arrayToVector(pcm);

  const { key, scale } = e.KeyExtractor(vec);
  const bpm = e.PercivalBpmEstimator(vec).bpm;
  const chordProgression = detectChords(e, pcm);
  const sections = segment(e, vec, pcm.length);

  return { sourceTrackName: name, source, key: `${key} ${scale}`, bpm, chordProgression, sections };
}

function moodFrom(scale: string, bpm: number): string {
  const fast = bpm >= 120;
  const minor = scale === "minor";
  if (minor && !fast) return "moody";
  if (minor && fast) return "intense";
  if (!minor && fast) return "upbeat";
  return "warm";
}

function framesToNotes(pitches: Float32Array, voiced: Float32Array, hop: number) {
  const out: { pitch: string; startSec: number; durSec: number }[] = [];
  let cur: { midi: number; start: number } | null = null;
  const close = (end: number) => {
    if (cur) out.push({ pitch: midiToName(cur.midi), startSec: cur.start, durSec: end - cur.start });
  };
  for (let i = 0; i < pitches.length; i++) {
    const on = voiced[i] > 0.5 && pitches[i] > 50;
    const midi = on ? Math.round(hzToMidi(pitches[i])) : NaN;
    if (on && (!cur || cur.midi !== midi)) {
      close(i * hop);
      cur = { midi, start: i * hop };
    } else if (!on && cur) {
      close(i * hop);
      cur = null;
    }
  }
  close(pitches.length * hop);
  return out;
}
