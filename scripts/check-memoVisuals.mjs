// Real, runnable check for the pure math in app/lib/memoVisuals.ts — no test
// framework, just assert, mirroring scripts/check-midi.mjs's pattern.
//
// Run with:
//   node --experimental-strip-types scripts/check-memoVisuals.mjs
import assert from "node:assert";
import { bucketPeaks, realWavePath, wavePoints, chordIndexToRow } from "../app/lib/memoVisuals.ts";

// --- bucketPeaks --------------------------------------------------------
{
  const pcm = new Float32Array(700);
  for (let i = 0; i < pcm.length; i++) pcm[i] = i < 350 ? 0.5 : 1.0; // louder second half
  const peaks = bucketPeaks(pcm, 70);
  assert.strictEqual(peaks.length, 70, `expected 70 buckets, got ${peaks.length}`);
  assert(peaks.every((p) => p >= 0 && p <= 1), "peak out of 0..1 range");
  assert(peaks[0] < peaks[peaks.length - 1], "louder second half should produce larger late-bucket peaks");
  const empty = bucketPeaks(new Float32Array(0), 70);
  assert.strictEqual(empty.length, 70, "empty pcm should still return bucketCount zeros");
  assert(empty.every((p) => p === 0), "empty pcm buckets should all be 0");
  console.log("bucketPeaks OK");
}

// --- realWavePath / wavePoints — both return a well-formed closed path --
{
  const peaks = Array.from({ length: 70 }, (_, i) => (i % 10) / 10 + 0.05);
  const path = realWavePath(peaks);
  assert(path.startsWith("M "), "path should start with a moveto");
  assert(path.endsWith("Z"), "path should be closed");
  assert(path.includes("Q "), "path should use quadratic curves, not straight lines");

  const short = realWavePath([0.5]);
  assert(short.startsWith("M ") && short.endsWith("Z"), "single-peak input should fall back to a valid path, not throw");

  const synthetic = wavePoints(3.7);
  assert(synthetic.startsWith("M ") && synthetic.endsWith("Z"), "synthetic wavePoints should also be a valid closed path");
  console.log("realWavePath/wavePoints OK");
}

// --- chordIndexToRow — positional, not label-based ----------------------
{
  // 3 rows: intro(2 chords), verse(4 chords), verse(4 chords) — duplicate
  // label on purpose, to prove this doesn't merge them.
  const counts = [2, 4, 4];
  assert.strictEqual(chordIndexToRow(counts, 0), 0, "chord 0 -> row 0 (intro)");
  assert.strictEqual(chordIndexToRow(counts, 1), 0, "chord 1 -> row 0 (intro)");
  assert.strictEqual(chordIndexToRow(counts, 2), 1, "chord 2 -> row 1 (first verse)");
  assert.strictEqual(chordIndexToRow(counts, 5), 1, "chord 5 -> row 1 (first verse)");
  assert.strictEqual(chordIndexToRow(counts, 6), 2, "chord 6 -> row 2 (second verse)");
  assert.strictEqual(chordIndexToRow(counts, 9), 2, "chord 9 -> row 2 (second verse)");
  assert.strictEqual(chordIndexToRow(counts, 999), 2, "out-of-range index clamps to the last row");
  console.log("chordIndexToRow OK");
}
