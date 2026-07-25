// Runnable check for the arrange edge fn's normTriad chord normalizer.
// Run: node scripts/check-arrange-chord.mjs
// Keep this regex identical to normTriad in supabase/functions/arrange/index.ts.
import assert from "node:assert";

function normTriad(raw) {
  if (typeof raw !== "string") return "C";
  const m = raw.trim().match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!m) return "C";
  const isMinor = /^(m(?!aj)|min|-)/.test(m[3]);
  return m[1].toUpperCase() + m[2] + (isMinor ? "m" : "");
}

const cases = [
  ["C", "C"], ["Am", "Am"], ["F#", "F#"], ["Bbm", "Bbm"],
  ["Dm7", "Dm"],        // seventh stripped, stays minor
  ["G7", "G"],          // dominant seventh -> major triad
  ["Fsus4", "F"], ["Fsus2", "F"],
  ["F/A", "F"],         // slash bass dropped
  ["Cmaj7", "C"],       // "maj" must NOT read as minor
  ["Cmin7", "Cm"], ["C-", "Cm"],
  ["Ab", "Ab"], ["a", "A"],
  ["bogus", "B"],       // starts with note letter b -> B major, still renderer-safe
  ["xyz", "C"], ["", "C"], [null, "C"], [42, "C"], // no leading note letter -> C fallback
];
for (const [input, want] of cases) {
  const got = normTriad(input);
  assert.equal(got, want, `normTriad(${JSON.stringify(input)}) = ${got}, want ${want}`);
}
console.log(`ok — ${cases.length} chord normalization cases pass`);
