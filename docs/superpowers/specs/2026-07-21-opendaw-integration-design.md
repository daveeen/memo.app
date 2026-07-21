# openDAW Integration — Design

## Purpose

Replace the current `/produce` stub (Task 8.2 — an honest "no mount API found" placeholder, licensing was the blocker at the time) with a real editing surface: load a generated song's `.mid` into openDAW's audio engine, play it, and do basic note editing (move/resize/delete regions, swap instrumentation), then export back to `.mid`.

## Research summary (full findings in prior conversation turn — condensed here)

- `@opendaw/studio-sdk` is a dependency-aggregator meta-package with no real API of its own.
- There is **no packaged, mountable studio UI** in the npm packages — the full visual editor lives only in openDAW's own monorepo (`packages/app/studio`), built on `@opendaw/lib-jsx` (not React), and is not published.
- The **headless SDK path is officially supported and proven**: `andremichelle/opendaw-headless` is the official minimal-integration template; `naomiaro/opendaw-test` is a ~20-demo React reference suite built on it (mixer, track editing, MIDI recording, WASM engine — confirms this works embedded in a React app).
- Audio engine: `@opendaw/studio-core-wasm` ships prebuilt WASM (`wasm-processor.js`, `wasm-offline-worker.js`, `wasm/engine.wasm`, plugin wasm) — no Rust toolchain needed to consume it, only to build openDAW's own app from source (not our path).
- Project/data model: `@opendaw/studio-core`'s `ProjectApi` (`createNoteTrack`, `createNoteRegion`, `createInstrument`, `setBpm`, …) and `EngineFacade` (`play/stop/setPosition`, `cpuLoad`, observables).
- MIDI: `@opendaw/lib-midi` (`MidiFileDecoder.decode()`) can parse a standard `.mid` into note events; there is **no turnkey SMF import/export helper in the published packages** — placing decoded notes into the project, and reading edited notes back out, is glue code we write.
- Native rich format is `.dawproject` (has a turnkey import/export service) — **not used here**; we stay on plain `.mid` since that's what the rest of this app already produces/consumes.
- Cross-origin isolation (COOP/COEP) is required for `SharedArrayBuffer` — already set project-wide in `public/_headers` from Task 0.2, for exactly this reason.
- APIs are pre-1.0 (`0.0.16x` at time of writing) and can break between patches — pin exact versions.
- Licensing (AGPL v3 / commercial) — resolved by the user outside this repo; not re-litigated here.

## Scope (from brainstorm)

- **In:** load engine, import a song's current `.mid` into a project, play/stop/scrub, move/resize/delete note regions, swap instrumentation, export back to `.mid` overwriting the same storage path.
- **Out:** full mixer/automation UI, `.dawproject` fidelity, edit-history/versioning, reverse-deriving `chordChart`/`structure` JSON from edited notes (those stay as originally generated — the MIDI file is the only thing this editor touches).

## Routing change

Current `app/routes.ts`: `route("produce", "routes/produce.tsx")` — the route takes no identifier, so `ProducePanel`'s `<a href="/produce">` links to a page with no way to know which song to load. This is a **pre-existing gap being fixed as part of this feature**, not a regression.

New: `route("produce/:songId", "routes/produce.tsx")`.

Ripple: `SongBuilderPanel.tsx`'s `onBuilt` callback currently passes only `midiPath` — extend to `onBuilt?.(songId: string, midiPath: string)` (the `saveSong` return already has `song.id` available at that call site). `app/routes/_index.tsx` tracks `songId` alongside `midiPath` and passes it to `ProducePanel`, which builds `<a href={`/produce/${songId}`}>` instead of the current bare `/produce`.

## New files

```
app/lib/opendaw/
  engine.ts        # WASM engine singleton loader — same lazy-singleton pattern as app/lib/audio/essentia.ts
  importMidi.ts     # fetch signed URL -> decode via @opendaw/lib-midi -> ProjectApi note tracks/regions
  exportMidi.ts     # read current project's note events -> MIDI bytes, reusing app/lib/audio/midi.ts's
                     # proven note-building logic (NOT an unconfirmed openDAW-native SMF export path)
app/routes/produce.tsx   # rebuilt: loads song by :songId param, renders editor or a graceful error/fallback
app/components/opendaw/
  PianoRoll.tsx      # custom minimal editor: render regions, drag-move, resize, delete
  TransportControls.tsx  # play/stop/scrub against EngineFacade
  InstrumentPicker.tsx   # swap instrumentation on a track
```

`public/opendaw-wasm/` (or similar) — build-time copy target for `@opendaw/studio-core-wasm`'s prebuilt `dist/` assets, served same-origin (satisfies COEP without cross-origin CORP wrangling for the engine itself; Supabase Storage fetches are the separate COEP concern below).

## Data flow

1. Dashboard build flow unchanged up through `saveSong` — additionally surfaces `songId` (see routing section).
2. User clicks "Open in openDAW" (`ProducePanel`) → navigates to `/produce/:songId`.
3. `produce.tsx` on mount: look up the `songs` row by id (RLS-scoped, same pattern as existing bank queries) → get `midi_path` → `createSignedUrl` → `fetch(url, {mode:"cors"})` (needs `crossorigin`, see risk below) → `importMidi.ts` decodes bytes and builds the project via `ProjectApi` (one note track per original `.mid` track — melody and chords, mirroring `buildMidi()`'s existing two-track structure) → engine installed and ready (`WasmEngine.install` + `ensureReady`) → render `PianoRoll` + `TransportControls` + `InstrumentPicker` against the live project.
4. Edits (move/resize/delete/instrument swap) mutate the in-memory project only — no autosave.
5. "Export .mid": `exportMidi.ts` walks the project's current note events, builds MIDI bytes (adapting `midi.ts`'s note-to-MIDI logic rather than duplicating it — extract a shared helper if the shapes line up cleanly, otherwise a small parallel function; decide at implementation time based on how close the shapes actually are), uploads to the **same** `midi_path` with `{upsert: true}` (current `saveSong`'s `.upload()` call has no upsert flag and will need one, or this becomes a distinct upload call — check Supabase JS behavior on conflict before assuming).

## Error handling (deliberate deviation from this codebase's usual silent-fail convention)

- Engine fails to load (not cross-origin-isolated, WASM fetch fails, browser incompatible): render a clear inline message + link to the existing `.mid` download fallback (`ProducePanel` stays reachable regardless). Do not blank-screen.
- MIDI decode fails: same graceful fallback message.
- Export fails: visible inline error, not silent — losing edit work silently would be a real regression from every other write path in this app being low-stakes/re-driveable.

## Known unresolved risk — flagged, not solved here

**Supabase Storage + COEP.** The produce page is cross-origin-isolated (COEP `require-corp`). Fetching a Storage signed URL cross-origin may be blocked unless the fetch uses `crossorigin` and Storage's response carries CORP-friendly headers. This cannot be verified without a live browser + live Supabase project (neither exists in the environment that built the rest of this app). **First implementation task should include a live-browser smoke test of exactly this fetch, isolated from the rest of the feature**, before building the full import/edit/export pipeline on top of an assumption that might not hold.

## Verification

Same constraint as the rest of this project: no live browser in the build environment. `npm run typecheck` + `npm run build` are the available automated checks. Anything involving actual WASM engine boot, audio playback, drag interactions, or the Storage/COEP fetch needs a live-browser pass the user runs themselves — call this out explicitly rather than claiming it works.

## Self-review

- No placeholders/TBDs — the two genuinely undecided implementation details (shared vs. parallel MIDI-building helper; exact Supabase upload conflict behavior) are explicitly flagged as "decide at implementation time" with the deciding question named, not silently glossed over.
- Consistency: reuses established patterns from the rest of the codebase (lazy singleton per `essentia.ts`, RLS-scoped lookups per `bank.ts`, graceful-fallback UX aligns with the "always-works fallback" philosophy already present in Task 8.1).
- Scope: bounded to the "basic editing" tier chosen in brainstorm; explicitly excludes mixer/automation/versioning/chord-chart-reversal.
- Ambiguity: routing gap (`/produce` with no id) called out as pre-existing, fixed as part of this work, not scope creep.
