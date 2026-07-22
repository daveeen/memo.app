# Arrangement Quality: Real Melody + Drum Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `docs/superpowers/specs/2026-07-22-arrangement-quality-design.md` — quantize the raw pitch-detected melody to the song's key and a rhythmic grid instead of replaying detector jitter verbatim, and add a section-aware drum track (there is none today).

**Architecture:** Both are pure functions added to `app/lib/audio/midi.ts`, called from `buildMidi` right before it writes each track. No new files, no new dependencies — `@tonejs/midi`'s existing `Track.channel` property (verified in its shipped `.d.ts`) is all a drum track needs to land on General MIDI channel 10.

**Tech Stack:** `@tonejs/midi`. No test framework — verification is `npm run typecheck`, `npm run build`, and this project's one real runnable check, `npm run check-midi` (`scripts/check-midi.mjs`, imports `buildMidi` directly and asserts on the real `@tonejs/midi` output).

---

## File Structure

**Modified:**
- `app/lib/audio/midi.ts` — new `midiToName`/`quantizeMelody`/`buildDrumTrack`; `buildMidi` gains a `key` parameter, its melody track is quantized, a third `drums` track is added
- `app/routes/songs.new.tsx` — one call site, passes `idea.key` through
- `scripts/check-midi.mjs` — its `buildMidi()` call and assertions updated for the new signature and third track (this is a real runnable check this project relies on, not a throwaway)

---

### Task 1: Melody quantization

**Files:**
- Modify: `app/lib/audio/midi.ts`
- Modify: `app/routes/songs.new.tsx`
- Modify: `scripts/check-midi.mjs`

- [ ] **Step 1: Add `midiToName` (inverse of the existing `nameToMidi`)**

Find:
```ts
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
```

Replace with:
```ts
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

// The actual inverse of nameToMidi — needed here (not just in analyze.ts,
// which has its own copy for detection output) because quantizeMelody below
// snaps a MIDI pitch and has to hand buildMidi back a name string, matching
// the `{pitch: string}` shape callers already pass around.
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function midiToName(m: number): string {
  return `${NOTE_NAMES[((m % 12) + 12) % 12]}${Math.floor(m / 12) - 1}`;
}
```

- [ ] **Step 2: Add `quantizeMelody`**

Find:
```ts
// Raw-MIDI-pitch note shape (as opposed to buildMidi's `notes` param, which
```

Replace with:
```ts
// Snaps a captured melody to the song's key (pitch) and a 16th-note grid
// (rhythm). The raw pitch-detector output is frame-by-frame — every bit of
// natural vibrato or timing jitter from the original hum comes through
// verbatim otherwise, which reads as noisy rather than melodic. `key` is
// analyze.ts's detectedKey format ("C major" / "A minor" — space-separated
// root + scale word), not chords.ts's "Cm"-style chord-quality notation.
function quantizeMelody(
  notes: { pitch: string; startSec: number; durSec: number }[],
  key: string,
  bpm: number,
): { pitch: string; startSec: number; durSec: number }[] {
  const [rootName, scaleWord] = key.split(" ");
  const root = NOTE_TO_SEMITONE[rootName] ?? 0;
  const intervals = scaleWord === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
  const inScale = new Set(intervals.map((iv) => (root + iv) % 12));

  function snapPitch(midi: number): number {
    for (let delta = 0; delta <= 6; delta++) {
      if (inScale.has(((midi - delta) % 12 + 12) % 12)) return midi - delta;
      if (inScale.has(((midi + delta) % 12 + 12) % 12)) return midi + delta;
    }
    return midi; // unreachable — every 12-note chromatic run contains a scale tone within 6 semitones
  }

  const grid = (60 / bpm) / 4; // one 16th note
  const snapped = notes.map((n) => ({
    pitch: midiToName(snapPitch(nameToMidi(n.pitch))),
    startSec: Math.round(n.startSec / grid) * grid,
    durSec: Math.max(grid, Math.round(n.durSec / grid) * grid),
  }));

  // Rhythm-snapping can push a note's end past the next note's (also
  // snapped) start — clip rather than let two notes stack. Input notes are
  // already time-ordered (analyze.ts emits them in capture order), so a
  // single forward pass is enough.
  for (let i = 0; i < snapped.length - 1; i++) {
    const end = snapped[i].startSec + snapped[i].durSec;
    const nextStart = snapped[i + 1].startSec;
    if (end > nextStart) snapped[i].durSec = Math.max(grid / 2, nextStart - snapped[i].startSec);
  }
  return snapped;
}

// Raw-MIDI-pitch note shape (as opposed to buildMidi's `notes` param, which
```

- [ ] **Step 3: Use it in `buildMidi`, add the `key` parameter**

Find:
```ts
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
```

Replace with:
```ts
export function buildMidi(
  notes: { pitch: string; startSec: number; durSec: number }[],
  chordChart: { chord: string }[],
  bpm: number,
  key: string,
): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);

  const melody = midi.addTrack();
  melody.name = "melody";
  addNotesToTrack(
    melody,
    quantizeMelody(notes, key, bpm).map((n) => ({ pitch: nameToMidi(n.pitch), startSec: n.startSec, durSec: n.durSec })),
  );
```

- [ ] **Step 4: Thread `idea.key` through the one call site**

Find (in `app/routes/songs.new.tsx`):
```tsx
      const midi = buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm);
```

Replace with:
```tsx
      const midi = buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm, idea.key);
```

- [ ] **Step 5: Update the runnable check for the new signature**

Find (in `scripts/check-midi.mjs`):
```js
  const notes = [
    { pitch: "C4", startSec: 0, durSec: 0.5 },
    { pitch: "E4", startSec: 0.5, durSec: 0.5 },
    { pitch: "G4", startSec: 1.0, durSec: 0.5 },
  ];
  const chordChart = [{ chord: "C" }, { chord: "Am" }, { chord: "F" }, { chord: "G" }];
  const bpm = 120;

  const bytes = buildMidi(notes, chordChart, bpm);
```

Replace with:
```js
  // C4/E4/G4 are all diatonic in C major and all four timings/durations are
  // already exact multiples of the 16th-note grid at 120 BPM (0.125s) — this
  // fixture is a no-op for quantizeMelody by construction, so the existing
  // exact-value assertions below stay valid rather than needing recomputed
  // "what does quantization produce" numbers.
  const notes = [
    { pitch: "C4", startSec: 0, durSec: 0.5 },
    { pitch: "E4", startSec: 0.5, durSec: 0.5 },
    { pitch: "G4", startSec: 1.0, durSec: 0.5 },
  ];
  const chordChart = [{ chord: "C" }, { chord: "Am" }, { chord: "F" }, { chord: "G" }];
  const bpm = 120;
  const key = "C major";

  const bytes = buildMidi(notes, chordChart, bpm, key);
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 7: Run the real MIDI check**

Run: `npm run check-midi`
Expected: `MIDI roundtrip OK` then `buildMidi() roundtrip OK: 3 melody notes, 12 chord notes` (unchanged counts — this fixture was chosen specifically so quantization is a no-op, see Step 5's comment).

- [ ] **Step 8: Commit**

```bash
git add app/lib/audio/midi.ts app/routes/songs.new.tsx scripts/check-midi.mjs
git commit -m "feat: quantize captured melody to key + rhythm grid instead of raw detector output"
```

---

### Task 2: Section-aware drum track

**Files:**
- Modify: `app/lib/audio/midi.ts`
- Modify: `scripts/check-midi.mjs`

- [ ] **Step 1: Add `buildDrumTrack`**

Find:
```ts
export function buildMidi(
  notes: { pitch: string; startSec: number; durSec: number }[],
  chordChart: { chord: string }[],
  bpm: number,
  key: string,
): Uint8Array {
```

Replace with:
```ts
// General MIDI percussion note numbers (channel 10, i.e. Track.channel = 9
// zero-indexed) — standard across GM-compatible players/synths.
const DRUM = { kick: 36, snare: 38, hihat: 42 };

// Each chordChart slot is a fixed 2-beat window (mirrors buildMidi's own
// chord loop below — beatSec = (60/bpm)*2 is one slot). Intro/Outro get a
// sparse kick+hihat pattern; everything else (Verse/Chorus/Bridge, or any
// section label this loose match doesn't recognize — e.g. Gemini-invented
// labels when there's no reference brief) gets a basic full kick/snare/hihat
// beat. Substring match, not exact equality, since section labels aren't a
// fixed enum.
function buildDrumTrack(
  chordChart: { chord: string; section: string }[],
  bpm: number,
): { pitch: number; startSec: number; durSec: number }[] {
  const beatSec = (60 / bpm) * 2;
  const beat = beatSec / 2;
  const hitDur = Math.min(0.15, beat / 4);
  const hits: { pitch: number; startSec: number; durSec: number }[] = [];
  let t = 0;
  for (const c of chordChart) {
    const isEdge = /intro|outro/i.test(c.section);
    if (isEdge) {
      hits.push({ pitch: DRUM.kick, startSec: t, durSec: hitDur });
      hits.push({ pitch: DRUM.hihat, startSec: t, durSec: hitDur });
      hits.push({ pitch: DRUM.hihat, startSec: t + beat, durSec: hitDur });
    } else {
      hits.push({ pitch: DRUM.kick, startSec: t, durSec: hitDur });
      hits.push({ pitch: DRUM.snare, startSec: t + beat, durSec: hitDur });
      for (let i = 0; i < 4; i++) hits.push({ pitch: DRUM.hihat, startSec: t + i * (beat / 2), durSec: hitDur });
    }
    t += beatSec;
  }
  return hits;
}

export function buildMidi(
  notes: { pitch: string; startSec: number; durSec: number }[],
  chordChart: { chord: string; section: string }[],
  bpm: number,
  key: string,
): Uint8Array {
```

- [ ] **Step 2: Add the drums track**

Find:
```ts
  const chords = midi.addTrack();
  chords.name = "chords";
  let t = 0;
  const beatSec = (60 / bpm) * 2;
  for (const c of chordChart) {
    const isMinor = c.chord.endsWith("m");
    const root = c.chord.replace(/m|maj|dim|7/g, "");
    for (const noteMidi of triadNotes(root, isMinor)) {
      chords.addNote({ midi: noteMidi, time: t, duration: beatSec });
    }
    t += beatSec;
  }

  return midi.toArray();
}
```

Replace with:
```ts
  const chords = midi.addTrack();
  chords.name = "chords";
  let t = 0;
  const beatSec = (60 / bpm) * 2;
  for (const c of chordChart) {
    const isMinor = c.chord.endsWith("m");
    const root = c.chord.replace(/m|maj|dim|7/g, "");
    for (const noteMidi of triadNotes(root, isMinor)) {
      chords.addNote({ midi: noteMidi, time: t, duration: beatSec });
    }
    t += beatSec;
  }

  const drums = midi.addTrack();
  drums.name = "drums";
  drums.channel = 9;
  addNotesToTrack(drums, buildDrumTrack(chordChart, bpm));

  return midi.toArray();
}
```

- [ ] **Step 3: Update the runnable check for the third track**

Find (in `scripts/check-midi.mjs`):
```js
  const chordChart = [{ chord: "C" }, { chord: "Am" }, { chord: "F" }, { chord: "G" }];
  const bpm = 120;
  const key = "C major";

  const bytes = buildMidi(notes, chordChart, bpm, key);
  assert(bytes instanceof Uint8Array, "buildMidi did not return a Uint8Array");

  const parsed = new Midi(bytes);
  assert(parsed.tracks.length === 2, `expected 2 tracks, got ${parsed.tracks.length}`);

  const melody = parsed.tracks.find((tr) => tr.name === "melody");
  const chords = parsed.tracks.find((tr) => tr.name === "chords");
  assert(melody, "melody track missing");
  assert(chords, "chords track missing");
  assert(
    melody.notes.length === notes.length,
    `expected ${notes.length} melody notes, got ${melody.notes.length}`,
  );
  assert(
    chords.notes.length === chordChart.length * 3,
    `expected ${chordChart.length * 3} chord notes, got ${chords.notes.length}`,
  );

  // Spot-check actual MIDI numbers, not just counts.
  assert(melody.notes[0].midi === 60, `expected C4 -> midi 60, got ${melody.notes[0].midi}`);
  assert(melody.notes[1].midi === 64, `expected E4 -> midi 64, got ${melody.notes[1].midi}`);
  assert(melody.notes[2].midi === 67, `expected G4 -> midi 67, got ${melody.notes[2].midi}`);
  for (const n of [...melody.notes, ...chords.notes]) {
    assert(n.midi >= 0 && n.midi <= 127, `midi value out of range: ${n.midi}`);
  }

  console.log(
    `buildMidi() roundtrip OK: ${melody.notes.length} melody notes, ${chords.notes.length} chord notes`,
  );
```

Replace with:
```js
  // Section labels chosen to exercise both buildDrumTrack branches: Intro
  // and Outro get the sparse pattern (3 hits each), the two Verse slots get
  // the full pattern (6 hits each) — 3+6+6+3 = 18 total drum hits.
  const chordChart = [
    { chord: "C", section: "Intro" },
    { chord: "Am", section: "Verse" },
    { chord: "F", section: "Verse" },
    { chord: "G", section: "Outro" },
  ];
  const bpm = 120;
  const key = "C major";

  const bytes = buildMidi(notes, chordChart, bpm, key);
  assert(bytes instanceof Uint8Array, "buildMidi did not return a Uint8Array");

  const parsed = new Midi(bytes);
  assert(parsed.tracks.length === 3, `expected 3 tracks, got ${parsed.tracks.length}`);

  const melody = parsed.tracks.find((tr) => tr.name === "melody");
  const chords = parsed.tracks.find((tr) => tr.name === "chords");
  const drums = parsed.tracks.find((tr) => tr.name === "drums");
  assert(melody, "melody track missing");
  assert(chords, "chords track missing");
  assert(drums, "drums track missing");
  assert(
    melody.notes.length === notes.length,
    `expected ${notes.length} melody notes, got ${melody.notes.length}`,
  );
  assert(
    chords.notes.length === chordChart.length * 3,
    `expected ${chordChart.length * 3} chord notes, got ${chords.notes.length}`,
  );
  assert(drums.notes.length === 18, `expected 18 drum hits, got ${drums.notes.length}`);

  // Spot-check actual MIDI numbers, not just counts.
  assert(melody.notes[0].midi === 60, `expected C4 -> midi 60, got ${melody.notes[0].midi}`);
  assert(melody.notes[1].midi === 64, `expected E4 -> midi 64, got ${melody.notes[1].midi}`);
  assert(melody.notes[2].midi === 67, `expected G4 -> midi 67, got ${melody.notes[2].midi}`);
  for (const n of [...melody.notes, ...chords.notes, ...drums.notes]) {
    assert(n.midi >= 0 && n.midi <= 127, `midi value out of range: ${n.midi}`);
  }

  console.log(
    `buildMidi() roundtrip OK: ${melody.notes.length} melody notes, ${chords.notes.length} chord notes, ${drums.notes.length} drum hits`,
  );
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 5: Run the real MIDI check**

Run: `npm run check-midi`
Expected: `MIDI roundtrip OK` then `buildMidi() roundtrip OK: 3 melody notes, 12 chord notes, 18 drum hits`.

- [ ] **Step 6: Note the verification gap**

Drum pattern musicality (does it actually sound good under real chord progressions/tempos) and `Track.channel = 9` actually producing a General-MIDI-recognizable percussion track in real playback (`playback.ts`'s `Tone.Part` scheduling, or an external DAW opening the exported `.mid`) were not verified live — no audio playback available in this build environment. `npm run check-midi` confirms the MIDI *data* is structurally correct (right note counts, right channel assignment, all pitches in valid range), not that it sounds right.

- [ ] **Step 7: Commit**

```bash
git add app/lib/audio/midi.ts scripts/check-midi.mjs
git commit -m "feat: add section-aware drum track to generated songs"
```

---

## Self-Review

**Spec coverage:**
1. Melody quantization (pitch + rhythm) → Task 1. ✓
2. Drum track, section-aware → Task 2. ✓

**Placeholder scan:** none — every step shows complete code.

**Type consistency:** `buildMidi`'s `chordChart` parameter type is `{chord: string}[]` after Task 1 and widens to `{chord: string; section: string}[]` after Task 2 (needed once `buildDrumTrack` reads `.section`) — this matches the real shape `chordChart` always has in production (`arrange/index.ts`'s `RESPONSE_SCHEMA` requires `section` on every entry), so the widen is a correctness fix, not a loosening. `quantizeMelody`'s return shape (`{pitch, startSec, durSec}[]`) exactly matches `buildMidi`'s own `notes` parameter shape, so the `.map()` immediately after it in Task 1 Step 3 needs no adjustment beyond what's shown.

**Ordering:** Task 1 must land before Task 2 — Task 2's `Find` blocks (in both `midi.ts` and `check-midi.mjs`) match text that Task 1 introduces (the `key` parameter, the `key = "C major"` fixture line). Not parallelizable with each other; this plan's two tasks are a strict chain.
