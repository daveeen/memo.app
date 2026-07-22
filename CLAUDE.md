# Memo

PWA that records a hum, extracts key/BPM/chords/melody in-browser (Essentia.js WASM), reverse-engineers a reference song, and generates a chord+structure+MIDI skeleton you can hear and open in a DAW.

Full spec: `../memo-plan.md`. Original task-by-task build plan: `../memo-implementation-plan.md` (historical — some tech choices below have since changed, this file is the current source of truth).

## Architecture

React Router 7 SPA (`ssr:false`) on Cloudflare Pages. All DSP runs client-side in WASM (Essentia.js). Supabase is the only backend — Postgres + Storage under RLS, reached directly via `supabase-js`, plus two Deno Edge Functions: `/arrange` (hides the Gemini key, grounded LLM arrangement, JWT-verified) and `/track-search` (public, keyless iTunes search + preview CORS proxy). Output MIDI via `@tonejs/midi`, playback via Tone.js.

**Tech stack:** React Router 7.18.1, TypeScript, Vite 8, `vite-plugin-pwa`, `essentia.js` 0.1.3, `tone` 15, `@tonejs/midi`, `@supabase/supabase-js`, Supabase (Postgres/Auth/Storage/Edge Functions/Deno), **Gemini `gemini-3.1-flash-lite`** via the Interactions API, `@opendaw/studio-sdk` 0.0.160 (headless — pulls in `studio-core` 0.1.1, `studio-core-wasm` 0.0.5, `lib-midi` 0.0.70, `lib-dsp` 0.0.88, `lib-std`, `lib-box` 0.0.90, `studio-adapters` 0.1.1, `studio-boxes`), Cloudflare Pages (`wrangler`).

## File map

```
app/
  root.tsx, routes.ts              # route config (RR7 explicit routes.ts convention, not flat-file)
  lib/
    supabase.ts                    # supabase client singleton
    types.ts                       # CaptureAnalysis, VibeBrief, SongBuild, BankEntry — canonical shapes
    audio/
      decode.ts                    # decodeAndClean: Blob -> mono Float32 PCM, silence-trimmed, peak-normalized
      essentia.ts                  # Essentia singleton loader (see gotchas — real import path was non-obvious)
      classify.ts                  # classifyInput heuristic (hum/vocal/guitar/other)
      analyze.ts                   # analyzeCapture (monophonic hum) + analyzeReference (polyphonic song)
      chords.ts                    # detectChords: per-frame HPCP + JS triad match (see gotchas — HPCP rotation)
      segment.ts                   # segment: even-quarters placeholder w/ real labels (ponytail-marked ceiling)
      midi.ts                      # buildMidi: notes+chordChart -> .mid bytes (@tonejs/midi); also exports
                                    # addNotesToTrack/PlayableNote (raw-MIDI-pitch helper, reused by
                                    # opendaw/exportMidi.ts so the write-loop isn't duplicated)
      playback.ts                  # playSong: Tone.Transport+Tone.Part playback of a chord chart, returns a
                                    # SongPlayback controller (stop/seek/getPosition/getDuration) — real
                                    # position tracking, not fire-and-forget (2026-07-22)
    opendaw/
      engine.ts                    # ensureOpenDawEngine: WASM engine singleton (AudioWorklets + WasmEngine
                                    # install/ensureReady); createOpenDawProject: hand-assembles ProjectEnv,
                                    # returns a fresh Project (see gotchas)
      importMidi.ts                # importMidiIntoProject: decode .mid (ByteArrayInput) -> pair NOTE_ON/OFF
                                    # -> Vaporisateur note tracks/regions/events, inside editing.modify
      exportMidi.ts                # exportProjectToMidi: walk project's note events -> PlayableNote[] ->
                                    # buildMidi's addNotesToTrack (inverse of importMidi.ts)
    api/
      bank.ts                      # supabase CRUD: ideas, vibe_briefs, songs — saveIdea/listIdeas/renameIdea/
                                    # saveBrief/listBriefs/saveSong/updateIdeaNote, plus getIdea/getBrief/getSong/
                                    # listSongs/listSongsForIdea/updateIdeaLyrics (added in the Phase A port)
      tracks.ts                    # client for /track-search edge fn
      arrange.ts                   # client for /arrange edge fn (sends user's session JWT, not anon key)
    cssText.ts                     # parses the Memo.html mockup's inline CSS-declaration strings into React
                                    # style objects (kebab->camel, first-colon split so gradients/urls survive)
    memoVisuals.ts                 # presentation + pure-math helpers: PAL/SEC_COLORS palettes, wavePoints
                                    # (synthetic per-id waveform, still what Cassette's thumbnail always uses),
                                    # realWavePath+bucketPeaks (real decoded-audio waveform, Idea Detail's big
                                    # waveform only, 2026-07-22), chordIndexToRow (playback position -> Builder
                                    # structure row, positional not label-matched), decoIdea (raw ideas row ->
                                    # cassette display props)
    useCachedFetch.ts               # stale-while-revalidate fetch hook (module-level Map cache, session-lived);
                                    # Ideas/Songs list + detail pages all use this instead of raw useEffect
                                    # fetches (2026-07-22)
  components/
    Spinner.tsx                    # shared loading spinner (used by useCachedFetch's cold-start loading state)
    memo/
      Cassette.tsx                 # the mockup's cassette-tape visual, ported 1:1; takes one decoIdea()-shaped prop
    opendaw/
      TransportControls.tsx        # play/stop + bars:beats readout, subscribes to project.engine.position
      PianoRoll.tsx                # DOM/pointer-event note grid: move/resize/delete; ppqn-native, SDK-free
      InstrumentPicker.tsx         # fixed Vaporisateur/Apparat select; SDK-free, produce.tsx maps name -> factory
  routes/
    _shell.tsx                     # layout route: session guard (redirects to /auth unless on splash/auth),
                                    # bottom tab bar (Ideas/Record/Songs) shown on /ideas*, /songs*, /brief
    splash.tsx                     # / — logo beat, then routes to /ideas (session) or /auth
    auth.tsx                       # /auth — magic-link form + "check your email" state (signInWithOtp)
    ideas.tsx                      # /ideas — cassette-rack library, live filter chips + search
    ideas.$id.tsx                  # /ideas/:id — cassette, measured grid, notes+lyrics, derived songs
    record.tsx                     # /record — real MediaRecorder capture + staged reveal (real analyzeCapture
                                    # results, not the mockup's hardcoded fixture) + save/edit/discard
    brief.tsx                      # /brief — track search/upload -> analyzeReference -> chord/section recipe
    songs.tsx                      # /songs — built-songs list with parent idea/brief pills
    songs.new.tsx                  # /songs/new — Chooser: pick idea+brief, runs buildSong+buildMidi+saveSong
                                    # itself, then navigates to the new song's Builder (Builder never builds)
    songs.$id.tsx                  # /songs/:id — Builder: structure map, instrumentation, playback, stage
                                    # breakdown, export .mid, "Open in openDAW" handoff
    produce.tsx                    # /produce/:songId — real headless openDAW editor: loads signed .mid,
                                    # imports into a Project, renders transport/piano-roll/instrument picker,
                                    # exports back over the same storage path (upsert); restyled onto the
                                    # mockup's PRODUCE chrome in the Phase A port, engine/SDK logic untouched
supabase/
  migrations/0001_init.sql         # tables (ideas, vibe_briefs, songs) + RLS + storage buckets (raw-audio, midi)
  migrations/0002_add_idea_note.sql # adds ideas.note text column
  migrations/0003_add_idea_lyrics.sql # adds ideas.lyrics text column (Idea Detail's lyrics textarea)
  migrations/0004_dedupe_vibe_briefs.sql # one-time cleanup of duplicate vibe_briefs rows (saveBrief now
                                    # dedupes by source_track_name+source before insert) + a unique index so
                                    # it can't recur
  migrations/0005_add_idea_waveform.sql # adds ideas.waveform_json jsonb — real decoded-audio peaks, see
                                    # memoVisuals.ts's bucketPeaks (2026-07-22)
  functions/arrange/index.ts       # Deno edge fn, Gemini Interactions API, JWT-verified
  functions/track-search/index.ts  # Deno edge fn, public/no-verify-jwt, SSRF-guarded preview proxy
scripts/
  extract-memo-screens.mjs         # decodes docs/design/Memo.html (Artifact bundle) into per-screen HTML
                                    # under .memo-design/ (gitignored, regenerable) for screen-port transcription
  check-midi.mjs                   # node --experimental-strip-types — real runnable MIDI validity check
  copy-opendaw-wasm.mjs            # predev/prebuild hook (package.json): mirrors @opendaw/studio-core-wasm's
                                    # dist/ (wasm-processor.js, wasm-offline-worker.js, wasm/**) into
                                    # public/opendaw-wasm/ for same-origin COEP-safe serving; gitignored,
                                    # mechanically regenerated, never committed
```

## Setup (manual — no credentials live in this repo)

1. `npx supabase login` → `npx supabase link --project-ref <ref>` → `npx supabase db push`
2. Verify RLS in the SQL editor as `anon` role (see comments in `0001_init.sql`)
3. Copy `.env.example` → `.env`, fill `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
4. `npx supabase secrets set GEMINI_API_KEY=...` → `npx supabase functions deploy arrange` (keep JWT verify ON — no `--no-verify-jwt`)
5. `npx supabase functions deploy track-search --no-verify-jwt` (intentionally public)
6. `npm run build && npx wrangler pages deploy build/client --project-name memo`

Runnable checks: `npm run typecheck`, `npm run build`, `npm run check-midi`.

## Gotchas (non-obvious, cost real debugging time to find)

- **`create-react-router@latest` resolves to v8**, not v7, because the template repo's `main` branch moved on. This project needs 7.x — if re-scaffolding anything, pin via `--template https://github.com/remix-run/react-router-templates/tree/v7/default`, not just `create-react-router@7.x.x` (version-pinning the CLI alone isn't enough, the template itself drifts independently).
- **essentia.js real import isn't what its README implies.** Browser/Vite: `import Essentia from "essentia.js/dist/essentia.js-core.es.js"` (default export) + `import { EssentiaWASM } from "essentia.js/dist/essentia-wasm.es.js"` (named). `new Essentia(EssentiaWASM)` is **synchronous** — no `.ready` promise, despite the package looking like it should need async init. The `.es.js` build cannot be loaded under plain Node ESM (emscripten's `ENVIRONMENT_IS_NODE` detection breaks under `node --experimental-vm-modules`/native ESM) — the `.umd.js` build works fine in Node if you ever need a script-level smoke test again.
- **HPCP bin 0 is pitch class A, not C.** `chords.ts`'s `toCChroma()` rotation (`c[pc] = hpcp[(pc+3)%12]`) exists because of this — omit it and every detected chord comes back transposed by a minor third.
- **Chord-quality (major/minor) gets silently dropped if you're not careful.** `chords.ts` produces bare pitch class (major) or pitch-class+`"m"` (minor) strings — e.g. `"Am"`. Both `midi.ts` (`triadNotes`) and `playback.ts` had to be fixed to actually branch on that trailing `"m"` before building a triad; the first pass at both files silently rendered every chord as major.
- **`@tonejs/midi` has no ESM named export** — `import { Midi } from "@tonejs/midi"` throws under native Node ESM (works fine bundled through Vite/esbuild, which papers over CJS interop). Use `import pkg from "@tonejs/midi"; const { Midi } = pkg;` anywhere it needs to run outside a bundler (e.g. `scripts/check-midi.mjs`).
- **Tone.js v15: `PolySynth` cannot wrap `Sampler`.** `Sampler` extends `Instrument`, not `Monophonic` — `new Tone.PolySynth(Tone.Sampler, {...})` fails `tsc`. `Sampler` is already polyphonic on its own; instantiate it directly.
- **The shared `AnalyserNode` must come from Tone's own AudioContext**, not `new AudioContext()`. `playback.ts` connects a Tone synth to the analyser; Web Audio forbids cross-context node connections, so a separately-constructed context makes `playSong` throw at runtime. Dashboard creates it lazily on first user gesture via `Tone.getContext().createAnalyser()` (also sidesteps the browser autoplay-suspended-context warning).
- **`supabase/functions/**` must stay excluded from `tsconfig.json`** (`"exclude": ["supabase/functions/**"]`) — Deno globals (`Deno.serve`, `Deno.env`) aren't real to the app's `tsc` pass, and Deno has its own type-checking at deploy time.
- **`user!.id` non-null assertions were replaced with explicit `if (!user) throw` in `bank.ts`** — an unauthenticated call now fails with a clear "not authenticated" error instead of a confusing runtime TypeError.
- **All outbound `fetch` calls (both edge functions + `arrange.ts`/`tracks.ts` clients) check `r.ok` before parsing.** Without this, a non-200 upstream response (bad API key, rate limit, etc.) parses as valid-but-empty JSON and silently produces a "successful" empty result instead of a visible error — found by CodeRabbit review, not obvious from reading the code casually.
- **No `@opendaw/*` package can be `import`-ed under plain Node (v22)** — same class of issue as essentia.js above, but the cause is packaging, not a browser dependency: the compiled `dist/*.js` use extensionless relative imports (`export * from "./Channel"`) that only a bundler resolves, and `--experimental-specifier-resolution=node` was removed in Node 22. To test the pure data-model packages (`lib-midi`, `lib-dsp`, `lib-std`) headlessly, bundle a throwaway entry file first: `npx esbuild entry.mjs --bundle --format=esm --platform=node`. `studio-core`/`studio-core-wasm` additionally need a real `AudioContext`/`AudioWorklet`/`SharedArrayBuffer` and cannot run in Node at all, bundled or not.
- **There is no turnkey `createProjectEnv()` / `Project.create()`.** A `ProjectEnv` (`studio-core/dist/project/ProjectEnv.d.ts`) must be hand-assembled from six required fields (`audioContext`, `audioWorklets` via `AudioWorklets.get(ctx)` after `AudioWorklets.createFor(ctx)`, `sampleManager`/`soundfontManager` via `GlobalSampleLoaderManager`/`GlobalSoundfontLoaderManager`, `sampleService`/`soundfontService`) before calling `Project.new(env)`. `app/lib/opendaw/engine.ts`'s `createOpenDawProject()` does this once; don't reinvent it elsewhere. This app has no real sample/soundfont backend, so it passes rejecting stub providers — safe only because `importMidiIntoProject` exclusively creates `Vaporisateur` instruments, which never call `provider.fetch`.
- **Every project mutation must be wrapped in `project.editing.modify(() => {...})`, and there is no `ProjectApi.deleteRegion` / mutate-region method.** Region and note-event edits (move/resize/delete in `PianoRoll`) go straight through box-graph field setters (`eventBox.position.setValue(...)`, `.duration.setValue(...)`) or box deletion (`eventBox.delete()`) — not a named `ProjectApi` call. `ProjectApi.duplicateNotes`'s own doc comment is what confirms the `editing.modify` wrapping requirement.
- **`NoteEventBox.position`/`.duration` are ppqn integers LOCAL to their parent `NoteRegionBox`, not absolute timeline position.** Absolute position is `region.position + event.position` (inferred from `NoteRegionBox` also exposing `loopOffset`/`loopDuration`/`eventOffset`, which only makes sense as a clip-content-vs-placement split). Getting this backwards — treating `event.position` as already absolute — silently shifts every note by its region's start offset; `produce.tsx`'s `handleMove` and `exportMidi.ts`'s `collectNoteTracks` both convert explicitly.
- **`MidiFileDecoder` wants a `ByteArrayInput` (from `@opendaw/lib-std`), not a raw `ArrayBuffer`/`Uint8Array`, and `decode()` returns raw per-channel `ControlEvent`s (`NOTE_ON`/`NOTE_OFF`), not pre-paired notes.** `importMidi.ts`'s `pairNotes()` matches `NOTE_ON` to the next `NOTE_OFF` (or a `NOTE_ON` with velocity 0) per channel/pitch. Decoded `ticks` are in the source file's own `timeDivision`, **not** openDAW's `PPQN.Quarter` (960) — every position/duration must be rescaled by `PPQN.Quarter / format.timeDivision` before it reaches `ProjectApi`. `ProjectApi.createNoteEvent`'s `velocity` is a `0..1` float — MIDI's raw `0..127` must be divided by 127.
- **Instrument choices are a fixed SDK enum, not free-form.** `InstrumentFactories.Named` = `{ Apparat, MIDIOutput, Nano, Playfield, Soundfont, Tape, Vaporisateur }`; only `Vaporisateur` and `Apparat` play with no sample/soundfont attachment, so those are the only two `InstrumentPicker` offers (an attachment-backed choice would silently fail against this app's rejecting stub providers).
- **The openDAW WASM engine singleton is bound to whichever `AudioContext` it first sees** (`AudioWorklets.createFor(ctx)` records its result in a per-context `WeakMap`). `produce.tsx` keeps one module-level `sharedAudioContext`, created lazily on first mount, instead of `new AudioContext()` per navigation — a fresh context on a second visit would hit the already-resolved engine singleton and `AudioWorklets.get(newCtx)` would throw "Worklets not installed."
- **WASM/worklet assets must be served same-origin** because of this project's COEP `require-corp` header (`public/_headers`) — a cross-origin fetch (e.g. straight from a CDN) would be blocked. `scripts/copy-opendaw-wasm.mjs` mirrors `node_modules/@opendaw/studio-core-wasm/dist/` into `public/opendaw-wasm/` via `predev`/`prebuild` npm hooks; the output is gitignored and never committed, same treatment as any other mechanically-regenerated build artifact.
- **The AudioWorklet processor asset is the single biggest unconfirmed boot-time risk.** `AudioWorklets.install(url)` resolves to `context.audioWorklet.addModule(url)`, and the package that's supposed to build that processor bundle — `@opendaw/studio-core-processors` — is a dev-only dependency of `studio-core-wasm` and is **not installed** in this project. `wasm-processor.js` (copied into `public/opendaw-wasm/`) is the best on-disk candidate — it contains a `registerProcessor(...)` call — but whether `addModule` actually succeeds against it, and whether the registered processor is usable by `EngineWorklet`, has not been confirmed without a live cross-origin-isolated browser page. If engine boot fails, check this first.
- **Every `position:fixed` bar in this app is scoped by a `transform`, not by the viewport — and two separate transforms do it.** Any non-`none` `transform` makes an element the containing block for its `position:fixed` descendants, so `bottom:0` means "bottom of that element", not "bottom of the screen". Both sources bit in the same session (2026-07-22):
  1. `root.tsx`'s 480px column carries `transform: translateZ(0)` **deliberately**, to keep the tab bar and transport bar inside the mobile column on desktop. The consequence is that the column must be **exactly viewport-height and scroll internally** (`height:100dvh;overflow:hidden` + flex column) — it was `minHeight:100vh`, which grows with content, so on a long page (Songs) the tab bar landed at the bottom of the *document*. Do not give that column a content-driven height again.
  2. `animation:mUp .3s ease both` on a route root persists the final keyframe's `transform:translateY(0)` forever, so an animated route root silently becomes a containing block too. `songs.$id.tsx`'s transport bar had to be moved **out** of the animated scroller (sibling under a fragment) to pin to the screen. Any future fixed element must not be a descendant of an `mUp`-animated div.
  Corollary: every route root is `flex:1;min-height:0` + `.m-scroll`, never `min-height:100vh` — `100vh` exceeds `100dvh` on mobile and overflows the now-clipped column.

## Decisions

- **2026-07-21 — Frontend port (Phase A): all 11 screens of the approved `docs/design/Memo.html` mockup ported onto real RR7 route components, wired to the existing Supabase/Essentia/Gemini/openDAW backend.** Markup/CSS/copy/animation ported verbatim (pixel-faithful, not a redesign) via a small `cssText()` inline-style parser; fixture data replaced with real API calls; the mockup's fake `setTimeout`/`setInterval` state simulations (most notably Record's hardcoded analysis result) replaced with real async flows (`analyzeCapture`, `analyzeReference`, `buildSong`). The old unstyled dashboard (`_index.tsx`, `login.tsx`, and the panel components under `components/`) is retired — the same backend calls now live behind the ported routes. Full plan: `docs/superpowers/plans/2026-07-21-frontend-port-backend-wiring.md`; design rationale: `docs/superpowers/specs/2026-07-21-frontend-port-backend-wiring-design.md`.
  - Deferred to Phase B (deliberately out of scope, not oversights): the Ideas screen's "crate"/folders feature (no backend); Record's "similar vibes" reference list (static fixture, no similarity backend); analysis-failure/too-short/mic-permission-denied visual states (mockup has none); PWA install/offline/delete flows. (Real decoded waveform peaks and the Builder's real-position playhead — both listed here originally — shipped 2026-07-22, see below.)
  - The Chooser (`songs.new.tsx`), not the Builder, performs the actual arrangement build (`buildSong`+`buildMidi`+`saveSong`) — the Builder is a pure viewer of an already-existing song. This wasn't literally spelled out by the mockup (which has no real backend) and was a Phase A implementation decision.
  - `ideas.lyrics` is a new column (`migrations/0003_add_idea_lyrics.sql`) backing Idea Detail's lyrics textarea — needs `npx supabase db push` before that field persists live.

- **2026-07 — Gemini over Anthropic for `/arrange`.** Swapped from `claude-haiku-4-5-20251001` to `gemini-3.1-flash-lite` via Gemini's **Interactions API** (`POST /v1beta/interactions`, `x-goog-api-key` header) — confirmed live against `ai.google.dev` docs, not assumed from training data; the older `generateContent` API is now labeled legacy. Uses `response_format: {type:"text", mime_type:"application/json", schema:...}` for real schema-enforced JSON output, which replaced the old return-ONLY-JSON-prompt + manual `indexOf("{")`/`lastIndexOf("}")` brace-slicing hack. Env var is `GEMINI_API_KEY`.
- **2026-07-21 — openDAW: real headless-SDK integration shipped, superseding the Task 8.2 stub.** `@opendaw/studio-sdk` still has no top-level `mount()`/`Studio` UI in the published packages (confirmed again during this build, not just the original stub research) — there is no mounted openDAW editor here. Instead, `/produce/:songId` (`app/routes/produce.tsx`) drives the SDK headlessly: `@opendaw/studio-core`'s `Project`/`ProjectApi`/`EngineFacade`, `@opendaw/studio-core-wasm`'s prebuilt WASM engine, and `@opendaw/lib-midi`'s decoder, behind a custom lightweight React editor (transport controls, a DOM/pointer-event piano roll, an instrument picker). MIDI stays the interchange format — no native `.dawproject` work. Full plan + Task 1's API spike findings: `docs/superpowers/plans/2026-07-21-opendaw-integration.md`; design rationale: `docs/superpowers/specs/2026-07-21-opendaw-integration-design.md`.
  - **License correction: `LGPL-3.0-or-later`, not AGPL v3.** The old stub entry recorded AGPL v3 as a blocker the user had "resolved" without a stated basis; Task 1's spike re-checked `studio-sdk`'s and `studio-core-wasm`'s installed `package.json` directly and both say `LGPL-3.0-or-later`. Worth flagging since it corrects a specific factual claim this file previously made, not just a status update.
  - Everything requiring a live browser (engine/worklet boot, real playback, drag/resize/delete interaction, the Storage/COEP fetch actually succeeding, a full import→edit→export→re-import round-trip) was **not** verified in this build environment — see the Gotchas entries above (AudioWorklet processor asset, WASM singleton/AudioContext binding) for the specific open risks, and re-run a live-browser pass before trusting this in production.
  - `ProducePanel.tsx`'s signed-URL `.mid` download remains as the always-works fallback link alongside the new "Open in openDAW →" link (only rendered once a real `songId` exists).
- **Segmentation ships as labeled even-quarters, not real self-similarity DSP** (`segment.ts`, `ponytail:`-marked). Upgrade path: true self-similarity boundary detection, if it ever matters more than the current placeholder.
- **`track-search` is public/no-verify-jwt with an SSRF allowlist** (`*.mzstatic.com` only on the `?preview=` param); `/arrange` requires Supabase JWT verification instead of its own auth code, since it spends a paid API budget per call.

- **2026-07-22 — Real playback engine + real waveforms, closing two of Phase A's deferred items.** `playback.ts`'s `playSong` was fire-and-forget (raw `Tone.now()`-offset one-shot scheduling, no reference returned, no way to stop/seek/track position) — rewritten onto `Tone.Transport`+`Tone.Part`, returning a `SongPlayback` controller (`stop`/`seek`/`getPosition`/`getDuration`). Song Builder (`songs.$id.tsx`) now derives its structure-row highlight and progress bar from real position via `memoVisuals.ts`'s `chordIndexToRow` (purely positional — deliberately does NOT fix `structure`'s pre-existing label-match filter, which still silently merges rows sharing a label; out of scope, not a regression). Idea Detail's waveform switches from the synthetic per-id fingerprint to real decoded-audio peaks (`bucketPeaks`, computed once at record time in `analyzeCapture` off the PCM `decodeAndClean()` already produces, stored in a new `ideas.waveform_json` column) with a scrubbable playhead; `Cassette`'s own thumbnail waveform deliberately keeps using the synthetic fingerprint everywhere else (a tiny decorative thumbnail doesn't need to be literal). Also added: a stale-while-revalidate fetch cache (`useCachedFetch.ts`) killing the empty-then-populated flash on Ideas/Songs list + detail pages; a "Recent" rack on Ideas; both detail pages' redundant back buttons and Builder's broken "Built in" stages timeline removed. Full plan: `docs/superpowers/plans/2026-07-22-ideas-songs-playback-polish.md`; design rationale: `docs/superpowers/specs/2026-07-22-ideas-songs-playback-polish-design.md`.
  - **Not verified live.** No browser was available in this build environment — real audio playback, `Tone.Transport` start/stop/seek behavior, `timeupdate`/scrub accuracy, and repeated play/stop/play cycles (confirming no leaked `Tone.Part`/`Sampler` instances) were never exercised live. Typecheck + build passing confirms the code compiles, not that it sounds or feels right — re-run a live-browser pass before trusting this in production, same caveat as the openDAW integration above.
  - `ideas.waveform_json` (`migrations/0005_add_idea_waveform.sql`) needs `npx supabase db push` before it exists on the live table — until then, every `saveIdea` insert (which now always sends `waveform_json`) will fail. This must land before/at deploy, not after.
  - `playback.ts` guards against overlapping playback at the module level (an `activeStop` singleton disposes any still-active `Tone.Part`/`Sampler` before a new `playSong()` call schedules its own) — added after code review caught that two rapid `playSong()` calls without an intervening `stop()` would otherwise leak the old Part and play both simultaneously. Callers should still call `stop()` when done; this is defense-in-depth, not a substitute.

## For future Claude

This file is maintained by Claude, read by both Claude and the human. Update the **Decisions** and **Gotchas** sections when you make a non-obvious call or hit a real bug that would waste time to rediscover — don't log routine feature work here, that belongs in commit messages. Keep the file map in sync when files are added/removed. If a `docs/superpowers/specs/` design doc exists for a feature under active development, link it here rather than duplicating its content.
