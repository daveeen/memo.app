# Memo

PWA that records a hum, extracts key/BPM/chords/melody in-browser (Essentia.js WASM), reverse-engineers a reference song, and generates a chord+structure+MIDI skeleton you can hear and open in a DAW.

Full spec: `../memo-plan.md`. Original task-by-task build plan: `../memo-implementation-plan.md` (historical — some tech choices below have since changed, this file is the current source of truth).

## Architecture

React Router 7 SPA (`ssr:false`) on Cloudflare Pages. All DSP runs client-side in WASM (Essentia.js). Supabase is the only backend — Postgres + Storage under RLS, reached directly via `supabase-js`, plus two Deno Edge Functions: `/arrange` (hides the Gemini key, grounded LLM arrangement, JWT-verified) and `/track-search` (public, keyless iTunes search + preview CORS proxy). Output MIDI via `@tonejs/midi`, playback via Tone.js.

**Tech stack:** React Router 7.18.1, TypeScript, Vite 8, `vite-plugin-pwa`, `essentia.js` 0.1.3, `tone` 15, `@tonejs/midi`, `@supabase/supabase-js`, Supabase (Postgres/Auth/Storage/Edge Functions/Deno), **Gemini `gemini-3.1-flash-lite`** via the Interactions API, Cloudflare Pages (`wrangler`).

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
      midi.ts                      # buildMidi: notes+chordChart -> .mid bytes (@tonejs/midi)
      playback.ts                  # playSong: Tone.Sampler playback of a chord chart
    api/
      bank.ts                      # supabase CRUD: ideas, vibe_briefs, songs (saveIdea/saveBrief/saveSong etc)
      tracks.ts                    # client for /track-search edge fn
      arrange.ts                   # client for /arrange edge fn (sends user's session JWT, not anon key)
  components/
    RecordPanel.tsx                # mic capture -> analyze -> save; routes mic into shared analyser
    BankList.tsx                   # list/search/replay/rename ideas
    VibeBriefPanel.tsx             # iTunes search + upload -> analyze -> save brief
    SongBuilderPanel.tsx           # pick idea+brief -> build -> render chart -> play; onBuilt exposes midiPath
    Visualizer.tsx                 # AnalyserNode waveform + glow canvas
    ProducePanel.tsx               # signed-URL .mid download (the always-works fallback)
    Timer.tsx                      # time-saved stopwatch
  routes/
    _index.tsx                     # dashboard — composes everything, owns the one shared Tone AudioContext analyser
    login.tsx                      # magic-link auth
    produce.tsx                    # openDAW route — currently a STUB, see openDAW section below
supabase/
  migrations/0001_init.sql         # tables (ideas, vibe_briefs, songs) + RLS + storage buckets (raw-audio, midi)
  functions/arrange/index.ts       # Deno edge fn, Gemini Interactions API, JWT-verified
  functions/track-search/index.ts  # Deno edge fn, public/no-verify-jwt, SSRF-guarded preview proxy
scripts/check-midi.mjs             # node --experimental-strip-types — real runnable MIDI validity check
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

## Decisions

- **2026-07 — Gemini over Anthropic for `/arrange`.** Swapped from `claude-haiku-4-5-20251001` to `gemini-3.1-flash-lite` via Gemini's **Interactions API** (`POST /v1beta/interactions`, `x-goog-api-key` header) — confirmed live against `ai.google.dev` docs, not assumed from training data; the older `generateContent` API is now labeled legacy. Uses `response_format: {type:"text", mime_type:"application/json", schema:...}` for real schema-enforced JSON output, which replaced the old return-ONLY-JSON-prompt + manual `indexOf("{")`/`lastIndexOf("}")` brace-slicing hack. Env var is `GEMINI_API_KEY`.
- **openDAW (Task 8.2) shipped as an honest stub, not a real mount.** `@opendaw/studio-sdk` installs as a version-string-only meta-package; real functionality lives in ~15 sibling packages with no top-level `mount()`/`Studio` API, built on openDAW's own JSX runtime (not React). AGPL v3 licensing was a blocker — **user has since resolved the licensing question** and asked for a real "full potential" integration; this is being researched/redesigned (see brainstorm spec once written, expect a `docs/superpowers/specs/` entry). `app/routes/produce.tsx` and `ProducePanel.tsx`'s `.mid` download remain the working fallback in the meantime.
- **Segmentation ships as labeled even-quarters, not real self-similarity DSP** (`segment.ts`, `ponytail:`-marked). Upgrade path: true self-similarity boundary detection, if it ever matters more than the current placeholder.
- **`track-search` is public/no-verify-jwt with an SSRF allowlist** (`*.mzstatic.com` only on the `?preview=` param); `/arrange` requires Supabase JWT verification instead of its own auth code, since it spends a paid API budget per call.

## For future Claude

This file is maintained by Claude, read by both Claude and the human. Update the **Decisions** and **Gotchas** sections when you make a non-obvious call or hit a real bug that would waste time to rediscover — don't log routine feature work here, that belongs in commit messages. Keep the file map in sync when files are added/removed. If a `docs/superpowers/specs/` design doc exists for a feature under active development, link it here rather than duplicating its content.
