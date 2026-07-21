# Memo

Record a hum. Memo works out its key, tempo, and melody in your browser — no upload, no server round-trip. Pick a song you love as a reference, and Memo reverse-engineers its chords and structure, then arranges your melody into a full chord chart you can hear, edit, and export.

> **Status:** feature-complete for its core loop, zero live-browser verification. Every line of this app was built and typechecked without a browser in the loop (see [Testing status](#testing-status) below) — the first real test is you, in an actual browser, once setup is done.

---

## What it does

Three things, in order:

1. **Capture an Idea** — record a hum/vocal/guitar snippet. Essentia.js (WASM, runs entirely client-side) extracts key, BPM, input type, mood, and the melody's note sequence. Saved to your personal bank with a title and a free-text note.
2. **Build a Vibe Brief** — search iTunes for a reference track (or upload a file). Memo analyzes it the same way, plus chord detection and song-structure segmentation (intro/verse/chorus/etc).
3. **Build a Song** — pick one Idea + one Brief. An LLM (Gemini) arranges your melody's contour onto the reference's chord progression and structure, staying in-key. Play it back, download the `.mid`, or open it in an in-browser DAW editor to move notes around, swap instruments, and re-export.

## Tech stack

React Router 7 (SPA, no SSR) · TypeScript · Vite · Essentia.js (WASM DSP) · Tone.js + `@tonejs/midi` · Supabase (Postgres + Storage + Edge Functions, RLS-scoped) · Gemini (`gemini-3.1-flash-lite`, Interactions API) · `@opendaw` headless SDK (in-browser DAW editing) · Cloudflare Pages (Wrangler deploy only — **not** Vercel, **not** Docker, **not** any Node host; this app has no server component to run).

Full architecture, file map, and every non-obvious gotcha found while building this: **[`CLAUDE.md`](./CLAUDE.md)**. Read it before making changes — it documents real bugs already found and fixed so you don't rediscover them.

---

## Setup

Nothing runs live without these — this repo ships with no credentials of any kind.

```bash
npm install
```

### 1. Supabase (database, auth, storage, edge functions)

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push          # applies both migrations: schema+RLS, then the idea-notes column
```

Copy `.env.example` → `.env` and fill in from your Supabase project's API settings:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Deploy the two edge functions:

```bash
npx supabase secrets set GEMINI_API_KEY=<your Gemini API key>
npx supabase functions deploy arrange                      # JWT verification ON — keep it on
npx supabase functions deploy track-search --no-verify-jwt # intentionally public (no auth needed to search iTunes)
```

Verify Row Level Security actually isolates users — in the Supabase SQL editor, run a query as the `anon` role against `ideas`/`vibe_briefs`/`songs` and confirm nothing comes back without a real session (comments in `supabase/migrations/0001_init.sql` have the exact query).

### 2. Run it

```bash
npm run dev
```

Opens at `http://localhost:5173`. Sign in via magic link (check your email for the link — no passwords anywhere).

### 3. Deploy

```bash
npm run build
npx wrangler pages deploy build/client --project-name memo
```

Cloudflare only. `wrangler login` first if you haven't.

---

## How to use / test every feature

Do these in order the first time — later features need data from earlier ones.

### Auth

Go to `/login`, enter your email, click the link that arrives. Session should survive a page reload (`supabase.auth.getSession()` in devtools console to check).

### Record an Idea

On the dashboard, hit **Record**. Browser will ask for mic permission — allow it. Hum, sing, or play something for a few seconds, hit **Stop**. Button shows "Analyzing…" for a couple seconds (real WASM DSP running in your browser, not a server call), then the idea appears at the top of your bank — **with its note field auto-focused**, ready to type a lyric fragment or reminder into. Tab away to save the note.

**What to check:** the new row shows a plausible key (e.g. "C major"), a BPM in a sane range (60–180 for most humming), and an input-type guess. Play button (▶) replays your recording from Supabase Storage.

### Idea Bank

Below the record button — every idea you've saved. Rename inline (click the title). Filter by typing into the filter box — matches against mood/key/bpm/input-type as one search string. Notes are editable anytime, not just at creation.

### Vibe Brief

Search a song by name — results come from iTunes (no login needed for this part, that edge function is public). Pick one and Memo fetches + analyzes a 30-second preview clip: key, tempo, chord progression, and a section map. No preview available? Upload a file instead.

**What to check:** chord progression should look like real chord symbols (`C`, `Am`, `F`, `G`, etc, not garbage). Section labels come back even if segmentation is a rough approximation — it's an intentionally simple even-quarters heuristic, not full audio self-similarity analysis (see `CLAUDE.md` Decisions).

### Song Builder

Pick a saved Idea and a Brief from the dropdowns, hit **Build**. This calls the Gemini-backed `/arrange` edge function — should return a chord chart that stays diatonic to your idea's key (or borrows a chord from the reference progression). Hit **Play** to hear it via Tone.js sampled piano. Chord chart and section structure render on screen.

**What to check:** playback should audibly sound like real chords (not just droning root notes — this was a real bug that got fixed). If Build fails, your inputs aren't lost — retry doesn't make you re-pick.

### Produce (openDAW editor)

Once a song is built, click **Open in openDAW →**. Loads a real in-browser DAW: your song's MIDI gets imported into a live audio engine, rendered as a piano-roll grid. Drag notes to move them, drag the right edge to resize, delete button removes a note. Swap the instrument per track (Vaporisateur/Apparat — the two synths that don't need external sample libraries). Hit **Export .mid** to save your edits back — re-opening the editor later picks up exactly where you left off, since the saved `.mid` file *is* the project state.

**What to check first if this doesn't work:** requires cross-origin isolation (COOP/COEP headers, already configured in `public/_headers` — should just work on Cloudflare Pages). If the editor fails to load, it degrades to a **Download .mid** fallback instead of a blank/broken page — that fallback always works regardless of the DAW editor's state, download the file and open it in any real DAW (GarageBand, FL Studio, Ableton, etc).

### Time-saved counter & visualizer

Cosmetic but real: a stopwatch starts when you pick an idea to build with, showing elapsed time next to "(manual ≈ 3–4 hr)" for comparison. A waveform visualizer reacts to both your mic input while recording and to song playback — glow intensifies with volume.

---

## Runnable checks (no browser needed)

```bash
npm run typecheck   # tsc across the whole app
npm run build       # full production build, including the openDAW WASM asset copy step
npm run check-midi  # real Node-executed MIDI encode/decode roundtrip — the one thing genuinely tested end-to-end
```

## Testing status

This entire app — DSP, audio playback, drag-and-drop editing, the works — was built in an environment with no browser available. Every piece was verified as deeply as static analysis and Node-level execution allow (real WASM execution for Essentia, real esbuild-bundled roundtrips for MIDI/openDAW data, `.d.ts`-source-verified API calls throughout) — but **nothing has been clicked, dragged, or listened to by a human yet.** Treat the first real session in an actual browser as the true first test pass, and expect to find things that only show up there (audio glitches, layout issues, the openDAW WASM engine actually booting). `CLAUDE.md`'s Gotchas section names the specific spots most likely to need a fix on first contact.

## Project docs

- [`CLAUDE.md`](./CLAUDE.md) — architecture, file map, every gotcha found, dated decisions
- [`checkpoint.md`](./checkpoint.md) — session resume notes
- [`docs/superpowers/specs/`](./docs/superpowers/specs/) — feature design docs (Idea Notes, openDAW integration)
- [`docs/superpowers/plans/`](./docs/superpowers/plans/) — task-by-task implementation plans
- [`../memo-plan.md`](../memo-plan.md) — original full product spec
