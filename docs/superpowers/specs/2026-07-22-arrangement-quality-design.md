# Arrangement Quality: Real Melody + Drum Track — Design

**Why:** The generated song's "melody" track is literally the pitch-detector's raw frame-by-frame output replayed as MIDI — every pitch wobble and timing jitter from the original hum comes through, so it sounds stuttery rather than melodic. There is also no drum track at all today; `instrumentation` (Gemini's suggested instrument list) is display-only and was never wired to any actual MIDI content.

**Scope:** `app/lib/audio/midi.ts` only (`buildMidi`'s signature changes; two new pure functions). Callers (`app/routes/songs.new.tsx`) pass one new argument.

## 1. Melody quantization

New pure function in `midi.ts`:

```ts
function quantizeMelody(
  notes: { pitch: string; startSec: number; durSec: number }[],
  key: string,     // "C major" | "A minor" — analyze.ts's detectedKey format
  bpm: number,
): { pitch: string; startSec: number; durSec: number }[]
```

- **Pitch snap:** parse `key` into a root pitch class + scale intervals (major: `[0,2,4,5,7,9,11]`, natural minor: `[0,2,3,5,7,8,10]`). For each note, convert to MIDI (`nameToMidi`, already exists), find the nearest in-key MIDI pitch by scanning the diatonic scale across the note's own octave and the ones immediately above/below (so a note doesn't jump an octave to reach a "closer" scale tone by pitch-class alone), convert back to a name (`midiToName`, mirrored from `analyze.ts`'s inverse — needs to exist in `midi.ts` or be imported; currently only `nameToMidi` lives here, so add a local `midiToName` matching the existing one-liner formula).
- **Rhythm snap:** grid = one 16th note = `(60 / bpm) / 4` seconds. Round each note's `startSec` to the nearest grid line. `durSec` rounds to the nearest grid multiple with a floor of one grid unit (never zero-length). If two consecutive notes' snapped times would overlap, clip the earlier note's duration to end exactly where the next one starts — no overlapping/stacked notes.
- Called from `buildMidi` before the melody track is written, replacing the raw `notes` array with `quantizeMelody(notes, key, bpm)`.

`buildMidi`'s signature gains `key: string` as a new parameter: `buildMidi(notes, chordChart, bpm, key)`. The one call site (`songs.new.tsx`'s `build()`) already has `idea.key` in scope — `buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm, idea.key)`.

## 2. Drum track

New pure function in `midi.ts`:

```ts
function buildDrumTrack(
  chordChart: { chord: string; section: string }[],
  bpm: number,
): { pitch: number; startSec: number; durSec: number }[]  // raw MIDI pitch, channel 10 GM drum map
```

- Each `chordChart` entry already spans a fixed 2-beat window (`beatSec = (60/bpm)*2`, same constant `buildMidi`'s existing chord loop uses) — the drum track walks the same slots in lockstep, one pattern per slot.
- **Section-aware pattern**, matched case-insensitively against `section` with a substring check (`"intro"`, `"outro"` vs. everything else, since Gemini-generated section labels won't always match a fixed enum exactly):
  - **Intro / Outro:** kick (36) on beat 1, closed hi-hat (42) on both beats — sparse.
  - **Everything else** (Verse/Chorus/Bridge/unrecognized): kick (36) on beat 1, snare (38) on beat 2, closed hi-hat (42) on every 8th-note subdivision of the 2-beat window — a basic full pattern.
- General MIDI channel 10 is the standard percussion channel; `@tonejs/midi`'s `Track` needs `channel = 9` (0-indexed) set before adding notes — confirmed via the `@tonejs/midi` API (`track.channel = 9`), the one new external-library fact this design relies on.
- `buildMidi` adds a third track: `const drums = midi.addTrack(); drums.channel = 9; drums.name = "drums"; addNotesToTrack(drums, buildDrumTrack(chordChart, bpm));` — reuses the existing `addNotesToTrack` helper (already takes `PlayableNote[] = {pitch, startSec, durSec}[]`, which is exactly `buildDrumTrack`'s return shape).

**Explicitly out of scope:** wiring Gemini's `instrumentation` suggestions to real synth patches/programs for the melody and chord tracks. That's a materially bigger scope (needs a soundfont/sample story this app doesn't have — recall the project's own gotcha that only `Vaporisateur`/`Apparat` play with no sample attachment) than "add a drum track," and wasn't asked for.

## Self-review

- No placeholders/TBDs.
- Verified against real current code: `nameToMidi`/`triadNotes`/`addNotesToTrack`/the chord loop's `beatSec` constant all already exist in `midi.ts` exactly as referenced here — nothing invented.
- `@tonejs/midi` track-channel API (`track.channel = 9`) is the one external fact asserted without a live test — worth confirming against the installed package's types during implementation rather than assuming, per this project's own established gotcha pattern of "confirmed live, not assumed."
- Scope is one file — no decomposition needed.
