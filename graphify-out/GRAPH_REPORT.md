# Graph Report - .  (2026-07-21)

## Corpus Check
- Corpus is ~16,438 words - fits in a single context window. You may not need a graph.

## Summary
- 207 nodes · 319 edges · 16 communities (13 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Bank & Tracks API Layer|Bank & Tracks API Layer]]
- [[_COMMUNITY_openDAW Integration Decisions|openDAW Integration Decisions]]
- [[_COMMUNITY_Audio DSP Analysis|Audio DSP Analysis]]
- [[_COMMUNITY_CLAUDE.md Gotchas & Decisions|CLAUDE.md Gotchas & Decisions]]
- [[_COMMUNITY_Vite Dev Dependencies|Vite Dev Dependencies]]
- [[_COMMUNITY_TypeScript Config|TypeScript Config]]
- [[_COMMUNITY_MIDI Build & Playback|MIDI Build & Playback]]
- [[_COMMUNITY_npm Dependencies & openDAW SDK|npm Dependencies & openDAW SDK]]
- [[_COMMUNITY_Idea Notes Feature|Idea Notes Feature]]
- [[_COMMUNITY_Arrange Edge Function|Arrange Edge Function]]
- [[_COMMUNITY_Track-Search Edge Function|Track-Search Edge Function]]
- [[_COMMUNITY_App Icon Asset|App Icon Asset]]

## God Nodes (most connected - your core abstractions)
1. `openDAW Integration — Design Spec` - 24 edges
2. `compilerOptions` - 15 edges
3. `openDAW Integration Implementation Plan` - 13 edges
4. `Memo (Hum-to-Song PWA)` - 11 edges
5. `Produce()` - 9 edges
6. `Checkpoint — 2026-07-21` - 9 edges
7. `Idea Notes Implementation Plan` - 9 edges
8. `Idea Notes — Design Spec` - 8 edges
9. `analyzeCapture()` - 7 edges
10. `buildMidi()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `app/lib/opendaw/exportMidi.ts exportProjectToMidi()` --references--> `buildMidi()`  [EXTRACTED]
  docs/superpowers/plans/2026-07-21-opendaw-integration.md → app/lib/audio/midi.ts
- `app/lib/opendaw/importMidi.ts importMidiIntoProject()` --references--> `buildMidi()`  [EXTRACTED]
  docs/superpowers/plans/2026-07-21-opendaw-integration.md → app/lib/audio/midi.ts
- `Decision: segmentation ships as labeled even-quarters, not real self-similarity DSP` --semantically_similar_to--> `.dawproject native rich format — has turnkey import/export, deliberately NOT used here`  [INFERRED] [semantically similar]
  CLAUDE.md → docs/superpowers/specs/2026-07-21-opendaw-integration-design.md
- `Gotcha: all outbound fetch calls must check r.ok before parsing (found by CodeRabbit)` --semantically_similar_to--> `Deliberate deviation: visible inline export errors, not silent-fail (losing edits would be a real regression)`  [INFERRED] [semantically similar]
  CLAUDE.md → docs/superpowers/specs/2026-07-21-opendaw-integration-design.md
- `Docker/Container Deployment Options (AWS ECS, Cloud Run, Fly.io, Railway, etc.)` --semantically_similar_to--> `Cloudflare Pages Deploy via Wrangler (build/client)`  [INFERRED] [semantically similar]
  README.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Idea Notes Auto-Focus Data Flow (record -> id -> dashboard state -> BankList focus -> persist)** — api_bank_updateideanote, components_recordpanel_onsaved, routes_index_justcreatedid_state, components_banklist_justcreatedid [EXTRACTED 1.00]
- **openDAW Headless SDK Stack (ProjectApi/EngineFacade + WASM engine + MIDI decoder + data model)** — opendaw_studio_core, opendaw_studio_core_wasm, opendaw_lib_midi, opendaw_lib_box [EXTRACTED 1.00]
- **openDAW Produce Editor UI Components (route + transport + piano roll + instrument picker)** — routes_produce_produce, opendaw_transportcontrols_transportcontrols, opendaw_pianoroll_pianoroll, opendaw_instrumentpicker_instrumentpicker [EXTRACTED 1.00]

## Communities (16 total, 3 thin omitted)

### Community 0 - "Bank & Tracks API Layer"
Cohesion: 0.11
Nodes (21): ideaAudioUrl(), listBriefs(), listIdeas(), renameIdea(), saveBrief(), saveIdea(), fetchPreviewBlob(), searchTracks() (+13 more)

### Community 1 - "openDAW Integration Decisions"
Cohesion: 0.13
Nodes (29): Checkpoint — 2026-07-21, Idea Notes feature — fully done this session (all 6 tasks), Manual setup steps pending (Supabase link/db push, RLS check, .env, secrets+deploy, first smoke test), Constraint: no live browser in build environment (only typecheck/build/Node-level checks), openDAW AGPL v3 licensing blocker resolved by user, proceeding on that basis, CLAUDE.md (Project Memory), Gotcha: essentia.js real import path differs from its README (sync core, .es.js vs .umd.js), Decision: openDAW (Task 8.2) shipped as an honest stub, not a real mount (+21 more)

### Community 2 - "Audio DSP Analysis"
Cohesion: 0.15
Nodes (20): analyzeCapture(), analyzeReference(), framesToNotes(), hzToMidi(), moodFrom(), NOTE_NAMES, ChordEssentia, ChordSpan (+12 more)

### Community 3 - "CLAUDE.md Gotchas & Decisions"
Cohesion: 0.10
Nodes (21): /arrange Edge Function (Gemini-grounded arrangement, JWT-verified), Gotcha: chord quality (major/minor trailing "m") silently dropped if not branched on, Cloudflare Pages Deploy via Wrangler (build/client), Gotcha: create-react-router@latest resolves to v8; must pin v7 template explicitly, Essentia.js WASM DSP Engine (client-side), Decision: Gemini gemini-3.1-flash-lite (Interactions API) over Anthropic for /arrange, Gotcha: HPCP bin 0 is pitch class A, not C (toCChroma rotation fix), Memo (Hum-to-Song PWA) (+13 more)

### Community 4 - "Vite Dev Dependencies"
Cohesion: 0.10
Nodes (19): devDependencies, @react-router/dev, tailwindcss, @tailwindcss/vite, @types/node, @types/react, @types/react-dom, typescript (+11 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, esModuleInterop, jsx, lib, module, moduleResolution, noEmit, paths (+10 more)

### Community 6 - "MIDI Build & Playback"
Cohesion: 0.21
Nodes (10): buildSong(), saveSong(), buildMidi(), nameToMidi(), NOTE_TO_SEMITONE, triadNotes(), PITCH_CLASSES, playSong() (+2 more)

### Community 7 - "npm Dependencies & openDAW SDK"
Cohesion: 0.15
Nodes (13): @opendaw/studio-sdk — dependency-aggregator meta-package, no real API of its own, dependencies, essentia.js, isbot, @opendaw/studio-sdk, react, react-dom, react-router (+5 more)

### Community 8 - "Idea Notes Feature"
Cohesion: 0.31
Nodes (11): updateIdeaNote(), BankList note textarea + justCreatedId auto-focus-once mechanism, RecordPanel onSaved callback — extended to pass new idea id, Migration 0002: alter table ideas add column note text, Idea Notes Implementation Plan, superpowers:executing-plans (alternate sub-skill), superpowers:subagent-driven-development (required sub-skill), _index.tsx dashboard justCreatedId state wiring (+3 more)

## Knowledge Gaps
- **64 isolated node(s):** `BankRow`, `Track`, `NOTE_NAMES`, `PC`, `ChordEssentia` (+59 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `openDAW Integration — Design Spec` connect `openDAW Integration Decisions` to `CLAUDE.md Gotchas & Decisions`, `npm Dependencies & openDAW SDK`?**
  _High betweenness centrality (0.324) - this node is a cross-community bridge._
- **Why does `dependencies` connect `npm Dependencies & openDAW SDK` to `Vite Dev Dependencies`?**
  _High betweenness centrality (0.212) - this node is a cross-community bridge._
- **Why does `@opendaw/studio-sdk — dependency-aggregator meta-package, no real API of its own` connect `npm Dependencies & openDAW SDK` to `openDAW Integration Decisions`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **What connects `BankRow`, `Track`, `NOTE_NAMES` to the rest of the system?**
  _75 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Bank & Tracks API Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.10634920634920635 - nodes in this community are weakly interconnected._
- **Should `openDAW Integration Decisions` be split into smaller, more focused modules?**
  _Cohesion score 0.12873563218390804 - nodes in this community are weakly interconnected._
- **Should `CLAUDE.md Gotchas & Decisions` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._