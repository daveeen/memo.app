# Graph Report - memo  (2026-07-22)

## Corpus Check
- 79 files · ~245,563 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 696 nodes · 1006 edges · 51 communities (45 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.71)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `72e1c267`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Bank & Tracks API Layer|Bank & Tracks API Layer]]
- [[_COMMUNITY_openDAW Integration Decisions|openDAW Integration Decisions]]
- [[_COMMUNITY_Audio DSP Analysis|Audio DSP Analysis]]
- [[_COMMUNITY_CLAUDE.md Gotchas & Decisions|CLAUDE.md Gotchas & Decisions]]
- [[_COMMUNITY_Vite Dev Dependencies|Vite Dev Dependencies]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_MIDI Build & Playback|MIDI Build & Playback]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Idea Notes Feature|Idea Notes Feature]]
- [[_COMMUNITY_Arrange Edge Function|Arrange Edge Function]]
- [[_COMMUNITY_Track-Search Edge Function|Track-Search Edge Function]]
- [[_COMMUNITY_App Icon Asset|App Icon Asset]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]

## God Nodes (most connected - your core abstractions)
1. `cssText()` - 28 edges
2. `openDAW Integration Implementation Plan` - 25 edges
3. `openDAW Integration — Design Spec` - 24 edges
4. `DocPage` - 23 edges
5. `Memo Frontend Port + Backend Wiring (Phase A) Implementation Plan` - 19 edges
6. `Checkpoint — 2026-07-21` - 16 edges
7. `Idea Notes Implementation Plan` - 16 edges
8. `compilerOptions` - 15 edges
9. `Part 3 — Screen inventory` - 15 edges
10. `Part 3 — Screen inventory` - 15 edges

## Surprising Connections (you probably didn't know these)
- `openDAW Integration Implementation Plan` --references--> `InstrumentPicker()`  [EXTRACTED]
  docs/superpowers/plans/2026-07-21-opendaw-integration.md → app/components/opendaw/InstrumentPicker.tsx
- `openDAW Integration — Design Spec` --references--> `InstrumentPicker()`  [EXTRACTED]
  docs/superpowers/specs/2026-07-21-opendaw-integration-design.md → app/components/opendaw/InstrumentPicker.tsx
- `openDAW Integration Implementation Plan` --references--> `PianoRoll()`  [EXTRACTED]
  docs/superpowers/plans/2026-07-21-opendaw-integration.md → app/components/opendaw/PianoRoll.tsx
- `openDAW Integration — Design Spec` --references--> `PianoRoll()`  [EXTRACTED]
  docs/superpowers/specs/2026-07-21-opendaw-integration-design.md → app/components/opendaw/PianoRoll.tsx
- `openDAW Integration Implementation Plan` --references--> `TransportControls()`  [EXTRACTED]
  docs/superpowers/plans/2026-07-21-opendaw-integration.md → app/components/opendaw/TransportControls.tsx

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Idea Notes Auto-Focus Data Flow (record -> id -> dashboard state -> BankList focus -> persist)** — api_bank_updateideanote, components_recordpanel_onsaved, routes_index_justcreatedid_state, components_banklist_justcreatedid [EXTRACTED 1.00]
- **openDAW Headless SDK Stack (ProjectApi/EngineFacade + WASM engine + MIDI decoder + data model)** — opendaw_studio_core, opendaw_studio_core_wasm, opendaw_lib_midi, opendaw_lib_box [EXTRACTED 1.00]
- **openDAW Produce Editor UI Components (route + transport + piano roll + instrument picker)** — routes_produce_produce, opendaw_transportcontrols_transportcontrols, opendaw_pianoroll_pianoroll, opendaw_instrumentpicker_instrumentpicker [EXTRACTED 1.00]

## Communities (51 total, 6 thin omitted)

### Community 0 - "Bank & Tracks API Layer"
Cohesion: 0.06
Nodes (60): buildSong(), deleteIdea(), getIdea(), getSong(), ideaAudioUrl(), listBriefs(), listIdeas(), listSongs() (+52 more)

### Community 1 - "openDAW Integration Decisions"
Cohesion: 0.29
Nodes (6): 4.1 Recording and analysis lifecycle, 4.2 Playback transport, 4.3 Connectivity and sync, Memo — UX Flow Handoff, Part 4 — State machines, Summary — the five things that matter most

### Community 2 - "Audio DSP Analysis"
Cohesion: 0.15
Nodes (20): analyzeCapture(), analyzeReference(), framesToNotes(), hzToMidi(), moodFrom(), NOTE_NAMES, ChordEssentia, ChordSpan (+12 more)

### Community 3 - "CLAUDE.md Gotchas & Decisions"
Cohesion: 0.15
Nodes (13): Cloudflare Pages Deploy via Wrangler (build/client), Gotcha: create-react-router@latest resolves to v8; must pin v7 template explicitly, CLAUDE.md (Project Memory), Memo (Hum-to-Song PWA), Gotcha: all outbound fetch calls must check r.ok before parsing (found by CodeRabbit), React Router 7 SPA Architecture (ssr:false, Cloudflare Pages), Decision: segmentation ships as labeled even-quarters, not real self-similarity DSP, Gotcha: shared AnalyserNode must come from Tone's own AudioContext, not a new one (+5 more)

### Community 4 - "Vite Dev Dependencies"
Cohesion: 0.06
Nodes (35): @opendaw/studio-sdk — dependency-aggregator meta-package, no real API of its own, dependencies, essentia.js, isbot, @opendaw/studio-sdk, react, react-dom, react-router (+27 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, jsx, lib, module, moduleResolution, noEmit, paths (+10 more)

### Community 6 - "MIDI Build & Playback"
Cohesion: 0.29
Nodes (9): addNotesToTrack(), buildMidi(), nameToMidi(), NOTE_TO_SEMITONE, PlayableNote, triadNotes(), collectNoteTracks(), exportProjectToMidi() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.06
Nodes (47): boot(), cdnScriptFor(), collectProps(), compileAttr(), compileTemplate(), contentKey(), createComponentFactory(), createExternalModules() (+39 more)

### Community 8 - "Idea Notes Feature"
Cohesion: 0.06
Nodes (39): Checkpoint — 2026-07-21, Done this session, Known open item, Manual steps still pending (user doing separately), Not started: openDAW integration, Resume instructions (fresh session), Update: openDAW integration complete, BankList note textarea + justCreatedId auto-focus-once mechanism (+31 more)

### Community 16 - "Community 16"
Cohesion: 0.17
Nodes (11): Data flow, Error handling (deliberate deviation from this codebase's usual silent-fail convention), Known unresolved risk — flagged, not solved here, New files, openDAW Integration — Design, Purpose, Research summary (full findings in prior conversation turn — condensed here), Routing change (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (13): Architecture, Context, Decisions (confirmed with user 2026-07-21), File map (new files this phase adds), Known Phase A limitations (carried forward, not hidden), Memo — Frontend Port + Backend Wiring (Phase A) — Design, New/changed backend surface (all additive, `bank.ts` pattern), Routing (`app/routes.ts`) (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.08
Nodes (23): Manual live-verification checklist (user, after deploy), Memo Frontend Port + Backend Wiring (Phase A) Implementation Plan, R1 — Transcription protocol (mockup DCLogic → JSX), R2 — The mockup's `renderVals()` is the source of truth for computed props, R3 — Palette + waveform helpers (shared, copied verbatim), R4 — Screen → route → file map, Self-review notes (author), Shared reference (read once before Task 5 onward) (+15 more)

### Community 19 - "Community 19"
Cohesion: 0.07
Nodes (25): Architecture, Decisions, File map, For future Claude, Gotchas (non-obvious, cost real debugging time to find), Memo, Setup (manual — no credentials live in this repo), 1. Supabase (database, auth, storage, edge functions) (+17 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (15): 3.10 openDAW handoff, 3.11 Multi-track upload, 3.1 Record, 3.2 Analysis reveal, 3.3 Ideas (library), 3.4 Brief, 3.5 Song Builder, 3.6 Auth (+7 more)

### Community 21 - "Community 21"
Cohesion: 0.25
Nodes (8): Confirmed real paths (on disk, differ slightly from plan Step 1 guesses), Confirmed signatures, Environment / version, Node-level sanity import (Step 4), Per-task change list (draft code that MUST change), Still needs a live browser (unchanged from plan's stated limits), Task 1 findings, WASM asset file list (Step 3 — exact, for Task 3's copy step)

### Community 22 - "Community 22"
Cohesion: 0.33
Nodes (5): coreSrcDir, destDir, __dirname, projectRoot, wasmSrcDir

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (11): 7.0 Concept, 7.1 Record — the deck proper, 7.2 Waveform — sharp and snappy, 7.3 Idea Bank — the rack, 7.4 The expanded spine, 7.5 Song Builder — the transport, 7.6 Time-saved — the tape counter, 7.7 Motion, performance, accessibility (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.18
Nodes (11): 7.0 Concept, 7.1 Record — the deck proper, 7.2 Waveform — sharp and snappy, 7.3 Idea Bank — the rack, 7.4 The expanded spine, 7.5 Song Builder — the transport, 7.6 Time-saved — the tape counter, 7.7 Motion, performance, accessibility (+3 more)

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (7): 5.1 Latency policy, 5.2 Error taxonomy, 5.3 Permissions and dead ends, 5.4 Offline behaviour, 5.5 Honesty rules, 5.6 Accessibility floor, Part 5 — Cross-cutting rules

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (15): 3.10 openDAW handoff, 3.11 Multi-track upload, 3.1 Record, 3.2 Analysis reveal, 3.3 Ideas (library), 3.4 Brief, 3.5 Song Builder, 3.6 Auth (+7 more)

### Community 28 - "Community 28"
Cohesion: 0.25
Nodes (8): Gotcha: chord quality (major/minor trailing "m") silently dropped if not branched on, Gotcha: essentia.js real import path differs from its README (sync core, .es.js vs .umd.js), Essentia.js WASM DSP Engine (client-side), Gotcha: HPCP bin 0 is pitch class A, not C (toCChroma rotation fix), createOpenDawProject(), ensureOpenDawEngine(), rejectingSampleProvider, rejectingSoundfontProvider

### Community 29 - "Community 29"
Cohesion: 0.29
Nodes (5): suggestTitle(), manifest, markers, raw, template

### Community 30 - "Community 30"
Cohesion: 0.15
Nodes (12): openDAW Integration Implementation Plan, Task 10: Final self-check, Task 1: Confirm the real openDAW API (spike), Task 2: Routing — `/produce/:songId`, Task 3: WASM engine asset pipeline + singleton loader, Task 4: MIDI import — decode `.mid` into a project, Task 5: MIDI export — read edited project back to `.mid`, Task 6: `produce.tsx` route — load, init, error states (+4 more)

### Community 31 - "Community 31"
Cohesion: 0.17
Nodes (11): Data flow, Error handling (deliberate deviation from this codebase's usual silent-fail convention), Known unresolved risk — flagged, not solved here, New files, openDAW Integration — Design, Purpose, Research summary (full findings in prior conversation turn — condensed here), Routing change (+3 more)

### Community 32 - "Community 32"
Cohesion: 0.17
Nodes (16): openDAW AGPL v3 licensing blocker resolved by user, proceeding on that basis, Decision: openDAW (Task 8.2) shipped as an honest stub, not a real mount, ProducePanel signed-URL .mid download — the always-works fallback, Gotcha: Tone.js v15 PolySynth cannot wrap Sampler (Sampler already polyphonic), andremichelle/opendaw-headless — official minimal headless-integration template, importMidiIntoProject(), @opendaw/lib-box (underlying data-model / box handles/ids), @opendaw/lib-jsx — openDAW's own JSX runtime (not React), powers its unpublished studio UI (+8 more)

### Community 33 - "Community 33"
Cohesion: 0.29
Nodes (7): Brief, Design consequences, Idea, Information architecture, Part 1 — Product model, Song, The whole app in one line

### Community 34 - "Community 34"
Cohesion: 0.29
Nodes (6): 4.1 Recording and analysis lifecycle, 4.2 Playback transport, 4.3 Connectivity and sync, Memo — UX Flow Handoff, Part 4 — State machines, Summary — the five things that matter most

### Community 35 - "Community 35"
Cohesion: 0.29
Nodes (7): 5.1 Latency policy, 5.2 Error taxonomy, 5.3 Permissions and dead ends, 5.4 Offline behaviour, 5.5 Honesty rules, 5.6 Accessibility floor, Part 5 — Cross-cutting rules

### Community 37 - "Community 37"
Cohesion: 0.29
Nodes (7): Brief, Design consequences, Idea, Information architecture, Part 1 — Product model, Song, The whole app in one line

### Community 38 - "Community 38"
Cohesion: 0.33
Nodes (6): 6.1 Types, 6.2 Routes, 6.3 State ownership, 6.4 Building before the backend exists, 6.5 Open questions for whoever builds this, Part 6 — Appendix: data contracts

### Community 39 - "Community 39"
Cohesion: 0.33
Nodes (6): 6.1 Types, 6.2 Routes, 6.3 State ownership, 6.4 Building before the backend exists, 6.5 Open questions for whoever builds this, Part 6 — Appendix: data contracts

### Community 40 - "Community 40"
Cohesion: 0.14
Nodes (13): INSTRUMENT_OPTIONS, InstrumentName, InstrumentPicker(), PianoRoll(), Region, TRACK_COLORS, TransportControls(), EventHandles (+5 more)

### Community 41 - "Community 41"
Cohesion: 0.40
Nodes (5): Glossary, Part 0 — How to read this, Priority tiers, What is a contract vs. what is your call, What this document is

### Community 42 - "Community 42"
Cohesion: 0.40
Nodes (5): J1 — Cold start (first-ever use), J2 — Warm start (the demo path), J3 — Reverse-engineer (Brief-first), J4 — Returning user (the habit loop), Part 2 — Journeys

### Community 43 - "Community 43"
Cohesion: 0.40
Nodes (5): Glossary, Part 0 — How to read this, Priority tiers, What is a contract vs. what is your call, What this document is

### Community 44 - "Community 44"
Cohesion: 0.40
Nodes (5): J1 — Cold start (first-ever use), J2 — Warm start (the demo path), J3 — Reverse-engineer (Brief-first), J4 — Returning user (the habit loop), Part 2 — Journeys

### Community 45 - "Community 45"
Cohesion: 0.15
Nodes (12): 1. Ideas page: Recent rack + scoped scrolling, 2. Anti-flash: stale-while-revalidate cache, 3 & 4. Detail-page nav cleanup, 5. Playback lifecycle fix, 6. Idea Detail: real waveform + scrub, 7. Song Builder: real transport playback, Error handling, Ideas/Songs polish + real playback engine — Design (+4 more)

### Community 46 - "Community 46"
Cohesion: 0.13
Nodes (14): File Structure, Ideas/Songs Polish + Real Playback Engine Implementation Plan, Self-Review, Task 10: `playback.ts` rewrite — `Tone.Transport`-based `SongPlayback`, Task 11: Song Builder — wire real playback, integer BPM, scrubbable progress bar, Task 1: Migration — `ideas.waveform_json`, Task 2: `useCachedFetch` hook + `Spinner` component, Task 3: Wire cache + spinner into Ideas and Songs lists (+6 more)

### Community 47 - "Community 47"
Cohesion: 0.17
Nodes (11): 1. Shared: `usePreviewPlayer()`, 2. `suggest-similar` Gemini edge function, 3. Record — real "sounds like", 4. Chooser Side B — search, 5. Build-button state fix, Error handling, Purpose, Real reference-song discovery — Design (+3 more)

### Community 48 - "Community 48"
Cohesion: 0.18
Nodes (10): File Structure, Real Reference-Song Discovery Implementation Plan, Self-Review, Task 1: Migration + shared type, Task 2: `usePreviewPlayer()` hook, Task 3: `suggest-similar` Gemini edge function + client, Task 4: `bank.ts` — thread `soundsLike` through `saveIdea`, Task 5: Record — wire real sounds-like, remove the old fake matching (+2 more)

### Community 50 - "Community 50"
Cohesion: 0.50
Nodes (4): PITCH_CLASSES, playSong(), SongPlayback, transposeNote()

## Knowledge Gaps
- **351 isolated node(s):** `CassetteIdea`, `INSTRUMENT_OPTIONS`, `TRACK_COLORS`, `NOTE_NAMES`, `PC` (+346 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `openDAW Integration — Design Spec` connect `Community 32` to `CLAUDE.md Gotchas & Decisions`, `Vite Dev Dependencies`, `MIDI Build & Playback`, `Idea Notes Feature`, `Community 40`, `Community 28`, `Community 30`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `cssText()` connect `Bank & Tracks API Layer` to `Community 40`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `Checkpoint — 2026-07-21` connect `Idea Notes Feature` to `Community 32`, `CLAUDE.md Gotchas & Decisions`, `Community 19`, `Community 30`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **What connects `CassetteIdea`, `INSTRUMENT_OPTIONS`, `TRACK_COLORS` to the rest of the system?**
  _361 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Bank & Tracks API Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.06183310533515732 - nodes in this community are weakly interconnected._
- **Should `Vite Dev Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `TypeScript Config` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._