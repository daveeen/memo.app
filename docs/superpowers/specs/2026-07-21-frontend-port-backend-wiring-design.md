# Memo — Frontend Port + Backend Wiring (Phase A) — Design

## Status

Design. Not yet planned or built. Covers **Phase A only** — see Scope below for what's deliberately excluded and why.

## Context

`docs/design/Memo.html` is a Claude Artifact export (custom `DCLogic` reactive engine — `sc-for` loops, `{{ }}` bindings, a `renderVals()` that returns a computed props object) holding the final, approved visual design for all 11 app screens, fully styled, entirely fixture-driven (zero backend calls). `docs/ux/memo-ux-flow.md` is the binding behavioral contract (screens, states, journeys, honesty rules) it was built against.

The current app (`app/`) is a functional-only skeleton: real Supabase/Essentia/Gemini/openDAW backend logic exists and works, but there is no routing beyond `/`, `/login`, `/produce/:songId`, no styling, and everything is jammed into one `_index.tsx` composing raw unstyled panels. None of it resembles Memo.html.

**Goal of Phase A:** port Memo.html's 11 screens into real React Router 7 components — identical markup, CSS, copy, animations — and wire each one to the backend logic that already exists. No redesign. No new backend capability beyond mechanical CRUD gaps and one flagged schema addition (below).

## Decisions (confirmed with user 2026-07-21)

1. **Port method:** transcribe to real JSX components, not `dangerouslySetInnerHTML`. Memo.html's `render()` already returns an almost-JSX-shaped props object; `sc-for` → `.map()`, `{{ x }}` → `{x}`, computed inline-style strings → copied verbatim as plain JS functions returning style-attribute strings (React accepts a `style` object, not a string — see Style System below for the conversion approach).
2. **Preview chrome dropped:** the 404×864 phone-bezel div and the "Screen Jumper" sidebar are desktop-preview-only artifacts of the Artifact tool, not app UI. Real screens render full-viewport on the actual device.
3. **Fonts:** Caveat, Plus Jakarta Sans, Space Mono via Google Fonts `<link>` tags in `root.tsx`, same pattern as the existing Inter link. Not self-hosted in Phase A.
4. **`listSongs`/`getSong`:** built in Phase A. Same table, same existing RLS, just a missing `SELECT` — mechanical extension of `bank.ts`'s existing pattern, required for Songs/Chooser to render anything.
5. **`ideas.lyrics` column:** added in Phase A (`0003_add_idea_lyrics.sql`, one line, same additive shape as `0002_add_idea_note.sql`). Memo.html's Idea Detail binds both a notes and a lyrics textarea; without the column, Detail would ship a lyrics field that silently fails to save — a real correctness bug, not a visual nicety.

## Scope rule (resolves every A-vs-B boundary question)

**If Memo.html draws a visual state/element for it, it's Phase A (wire it, even if that needs a small additive change like passing a real title through). If Memo.html has no visual for it at all, it's Phase B (needs new design work, not just wiring) — even if the underlying behavior is a known correctness gap.**

Applied:

| Behavior | Has UI in Memo.html? | Phase |
|---|---|---|
| Staged reveal (input→tempo→key→mood, 380ms steps) | Yes (`revealStats`, `revealStep`) | A |
| Editable pending title before save | Yes (`pendingTitle`, `onPendingTitle`) | A |
| Idea notes + lyrics, accordion detail | Yes | A (+ schema addition, see Decision 5) |
| Filter chips (All/Vocal/Guitar/Bright/Warm) | Yes (`filters`) | A |
| Songs list, Chooser (idea+brief picker) | Yes | A (+ `listSongs`/`getSong`) |
| Stage breakdown (captured/analysed/brief/built) | Yes (`stages`) | A — derived from existing `created_at` columns, see below. `analysed` collapses into `captured` (no separate timestamp exists; analysis is synchronous pre-insert today) |
| Analysis-failed / audio-never-lost state | **No** — `recPhase` fixture enum is only `idle/recording/analysing/reveal`, no failed state drawn | B |
| Too-short recording | **No** | B |
| Silence warning | **No** | B |
| Mic-permission-denied recovery | **No** (mockup's `startRec` never calls `getUserMedia`) | B |
| Confidence markers (`keyLow`, low-confidence badges) | Referenced in fixture data (`keyLow:true`) but no rendered consequence found in markup scan | B |
| `sectionsEstimated` badge | **No** | B |
| Idea deletion + undo | **No** | B |
| Offline queue / install-prompt states | **No** | B |
| Multi-track upload | **No** (Tier 3 in UX doc, outline-depth only) | B |
| Waveform peaks | Design shows a waveform, but it's **synthetic** — `wavePoints(seed)` generates fake sine-derived peaks from the idea's id, never from real audio | A ships the same synthetic-but-deterministic generator (visually identical to design); storing/rendering *real* decoded peaks is Phase B |

## Architecture

### Routing (`app/routes.ts`)

```
layout("routes/_shell.tsx")          # session guard + tab bar (conditionally rendered)
  index("routes/splash.tsx")         # "/" — session check: has session -> /ideas, no session -> /auth (after ~2.1s cassette-logo beat)
  route("auth", "routes/auth.tsx")   # replaces /login; form/sent states + resend/reopen
  route("ideas", "routes/ideas.tsx")
  route("ideas/:id", "routes/ideas.$id.tsx")
  route("record", "routes/record.tsx")
  route("brief", "routes/brief.tsx")           # J3 entry — search/upload, no id yet
  route("brief/:id", "routes/brief.$id.tsx")   # reachable directly per UX doc §6.2
  route("songs", "routes/songs.tsx")
  route("songs/new", "routes/songs.new.tsx")   # Chooser
  route("songs/:id", "routes/songs.$id.tsx")   # Builder
route("produce/:songId", "routes/produce.tsx") # existing — restyle only, SDK/engine logic untouched
```

`_shell.tsx` carries the existing `_index.tsx` session-check-and-redirect pattern (today gated on `supabase.auth.getSession()`), plus the tab bar — rendered only on routes in Memo.html's `showTabs` set (`ideas, detail, songs, chooser, brief, builder, produce`), matching the design's own `isRecord`/`isAuth`/`isSplash` exclusions. Tab-active state follows the design's existing `tabIdeas`/`tabSongs` logic verbatim (Brief highlights the Songs tab, per the UX doc's "Briefs live inside the Songs flow").

### Style system

Memo.html has **no Tailwind classes** — everything is computed inline `style` strings from `renderVals()`, plus one small global `<style>` block (reset, `@keyframes mSpin/mReel/mWave/mGlow/mFloat/mUp`, `.m-spine`/`.m-scroll`). Plan:

- New `app/memo.css` (not `app.css` — keeps Tailwind's existing surface untouched) holding the reset + keyframes, imported once in `root.tsx`.
- Per-screen style-string helper functions (`spineOf`, `cellBase`, `playBtn`, etc.) copied verbatim from the mockup's `renderVals()` as plain `.ts` functions, still returning CSS-text strings — applied via a tiny `style={cssTextToObject(str)}` helper (or, more simply, since every string is authored by us and static per-render, a one-line parser: split on `;`, split each on first `:`, camelCase the property). One shared util, `app/lib/cssText.ts`.
- Google Fonts `<link>` added to `root.tsx`'s existing `links()` export, alongside Inter (Inter itself is unused by the ported screens but left in place — not part of this change).

### Screen → route → data source map

| Screen (Memo.html) | Route | Backing data / calls |
|---|---|---|
| SPLASH | `/` (index) | `supabase.auth.getSession()` |
| AUTH | `/auth` | `supabase.auth.signInWithOtp` (existing `login.tsx` logic, moved) |
| IDEAS | `/ideas` | `listIdeas()` (existing) + filter chips computed client-side over the same fields `BankList` already filters on |
| IDEA DETAIL | `/ideas/:id` | `listIdeas()` row lookup by id (or a new `getIdea(id)`), `renameIdea`, `updateIdeaNote`, new `updateIdeaLyrics`, `ideaAudioUrl`; "derived songs" via new `listSongsForIdea(ideaId)` |
| RECORD | `/record` | `analyzeCapture` + `saveIdea(blob, analysis, pendingTitle)` — title now threaded through instead of hardcoded `"Untitled"` |
| BRIEF | `/brief`, `/brief/:id` | `searchTracks`, `fetchPreviewBlob`, `analyzeReference`, `saveBrief`; `/brief/:id` needs a new `getBrief(id)` |
| SONGS | `/songs` | new `listSongs()` (join `ideas.title` + `vibe_briefs.source_track_name` for the composed title, no new column) |
| CHOOSER | `/songs/new` | `listIdeas()` + `listBriefs()` (both exist) |
| BUILDER | `/songs/:id` | new `getSong(id)`, existing `buildSong`/`buildMidi`/`saveSong`/`playSong`; stage breakdown computed from `ideas.created_at` / `vibe_briefs.created_at` / `songs.created_at` deltas |
| PRODUCE (openDAW) | `/produce/:songId` | existing route, unchanged logic — only the JSX/CSS layer is replaced to match Memo.html's PRODUCE markup |
| TAB BAR | (in `_shell.tsx`) | route-derived active state only |

### New/changed backend surface (all additive, `bank.ts` pattern)

```
supabase/migrations/0003_add_idea_lyrics.sql   -- alter table ideas add column lyrics text;

app/lib/api/bank.ts:
  + getIdea(id)                    -- single-row select, mirrors listIdeas
  + updateIdeaLyrics(id, lyrics)   -- mirrors updateIdeaNote
  + getBrief(id)
  + listSongs()                    -- select + join for composed title
  + listSongsForIdea(ideaId)
  + getSong(id)
  saveIdea(...): title now required, no hardcoded default
```

No RLS changes needed — all three tables already have owner-only `for all` policies; new `SELECT`s ride the existing policy.

## Known Phase A limitations (carried forward, not hidden)

- Waveform peaks are synthetic (seeded, not derived from real audio) — visually correct, not real data. Real peaks storage is Phase B.
- No visual state exists yet for: analysis failure (audio can still be lost today), too-short recordings, silence warnings, mic-permission-denied recovery, low-confidence/estimated markers. These are correctness/trust gaps called out explicitly in the UX doc, but building them means designing new UI Memo.html doesn't have — Phase B.
- "Analysed" stage timestamp collapses into "captured" (no separate timestamp captured today).
- No offline write-queue, no install-prompt UI, no idea deletion.

## Verification plan

- `npm run typecheck` and `npm run build` after each screen lands (existing scripts, no new tooling).
- No test framework exists in this repo today (`ponytail:` — not adding one for a UI port; each screen's manual smoke path is: load route → confirm real data renders → confirm the one write action on that screen persists (e.g. rename, save idea, save brief, save song) → confirm on Supabase Studio / a re-fetch).
- Live-browser check required for: recording (mic permission), openDAW produce screen (WASM/AudioWorklet boot — checkpoint.md already flags this as the single biggest unconfirmed risk), PWA install. None of this has been browser-verified in this build environment before either; unchanged risk, not newly introduced.

## File map (new files this phase adds)

```
app/routes/_shell.tsx
app/routes/splash.tsx
app/routes/auth.tsx            (replaces login.tsx's role; routes.ts drops "login")
app/routes/ideas.tsx
app/routes/ideas.$id.tsx
app/routes/record.tsx
app/routes/brief.tsx
app/routes/brief.$id.tsx
app/routes/songs.tsx
app/routes/songs.new.tsx
app/routes/songs.$id.tsx
app/memo.css
app/lib/cssText.ts
supabase/migrations/0003_add_idea_lyrics.sql
```

`app/routes/_index.tsx` and `app/routes/login.tsx` are deleted (superseded by `splash.tsx`/`auth.tsx`). `app/components/*.tsx` (the current unstyled panels) are retired in favor of the new per-route components, but their *logic* (the actual `analyzeCapture`/`saveIdea`/etc. calls) is what moves into the new components — nothing in `app/lib/audio/`, `app/lib/opendaw/`, or `app/lib/api/` (beyond the additive functions above) changes.
