# Ideas/Songs polish + real playback engine — Design

## Purpose

A batch of UI fixes on Ideas/Songs plus a real rewrite of audio playback, which
today is fundamentally broken: Idea Detail's play button creates an untracked
`Audio` object on every click (nothing to pause later), and Song Builder's
`playSong()` schedules every chord as a fire-and-forget `Tone.now()`-offset
event with no handle returned at all — there is currently no way to stop,
seek, or track position for either. Both keep playing after navigating away.

## Scope

**In scope:**
1. Ideas page: "Recent" rack (3 most recent) above "All ideas"; only the "All
   ideas" rack scrolls internally once it overflows.
2. Stale-while-revalidate client cache for Ideas/Songs list + detail fetches,
   removing the empty→populated flash; spinner remains as cold-start fallback.
3. Remove `← Ideas`/`← Songs` back links from Idea Detail and Song Builder.
4. Remove the "Built in" stages card from Song Builder.
5. Playback lifecycle: real pause/resume + force-stop-on-unmount for both idea
   audio and song playback.
6. Idea Detail: real waveform from precomputed peaks (not the synthetic
   per-id fingerprint), with a scrubbable playhead.
7. Song Builder: `Tone.Transport`-based playback with real position tracking,
   section-synced progress bar, scrubbing, integer BPM display.

**Out of scope:** offline caching (persists only for the SPA session, cleared
on full reload), waveform peaks for reference tracks/briefs, any change to
`Cassette`'s synthetic list-view waveform (stays as-is — decorative, not
meant to be literal there), a real "Stop" icon distinct from Play/Pause (the
existing ▶/❚❚ toggle just needs to actually work).

## 1. Ideas page: Recent rack + scoped scrolling

`app/routes/ideas.tsx`:
- New section between the filter chips and "All ideas": heading "Recent" +
  a rack using the exact same `spineOf`/`spineStyle` rendering as "All
  ideas", fed by `ideas.slice(0, 3)` (natural order from `listIdeas()`,
  already `created_at desc`). Not filtered by search/filter state — always
  the 3 most recent, full stop. These 3 also still appear in "All ideas"
  below; nothing is removed from that list.
- Structural change: the page stops being one scrolling column. Root
  container becomes a fixed-height flex column (`height:100dvh`); header,
  search bar, filter chips, and the new Recent rack stay in normal
  (non-scrolling) flow; only the "All ideas" rack gets
  `flex:1;min-height:0;overflow-y:auto` (the `min-height:0` is required —
  flex children default to `min-height:auto`, which silently defeats
  `overflow-y:auto` inside a flex column). Search/filter behavior and
  position are otherwise untouched, per explicit instruction.

## 2. Anti-flash: stale-while-revalidate cache

New file `app/lib/useCachedFetch.ts`:

```ts
import { useEffect, useState } from "react";
const cache = new Map<string, unknown>();

export function useCachedFetch<T>(key: string, fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | undefined>(() => cache.get(key) as T | undefined);
  const [loading, setLoading] = useState(!cache.has(key));
  useEffect(() => {
    let cancelled = false;
    fetcher().then((fresh) => {
      if (cancelled) return;
      cache.set(key, fresh);
      setData(fresh);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [key]);
  return { data, loading };
}
```

Cache hit on mount → data renders instantly, `loading=false`, no spinner;
fetch still runs in the background and silently corrects `data`/cache when
it resolves. Cache miss (true first visit this session) → `loading=true`
until the first fetch resolves, spinner shown.

Applied to:
- `ideas.tsx`: `useCachedFetch("ideas", listIdeas)` replaces the raw
  `useEffect(() => { listIdeas().then(setRows) }, [])`.
- `songs.tsx`: `useCachedFetch("songs", listSongs)`.
- `ideas.$id.tsx`: `useCachedFetch(\`idea:${id}\`, () => getIdea(id))`
  (song list for the idea stays a separate small fetch, low value to cache).
- `songs.$id.tsx`: `useCachedFetch(\`song:${id}\`, () => getSong(id))`.

Each of these four currently does `if (!data) return null;` (blank flash).
Replaced with: `if (loading) return <Spinner/>; if (!data) return null;`
(genuine 404/missing-row case still renders nothing — unchanged). New
content mount gets `animation:mUp .3s ease both` (existing keyframe in
`memo.css`) instead of an instant hard swap.

No invalidation logic beyond the revalidate-on-mount — acceptable staleness
window (e.g. a just-recorded idea not yet in a cached Ideas list) self-heals
on the next navigation to that page, same as standard SWR behavior.

## 3 & 4. Detail-page nav cleanup

`ideas.$id.tsx`, `songs.$id.tsx`: remove the `← Ideas`/`← Songs` `<button>`.
Tab bar already shows on both routes (`_shell.tsx`'s `showTabs` already
matches `/ideas/*` and `/songs/*`) — this is decluttering, not a navigation
fix.

`songs.$id.tsx`: remove the `stages`/"Built in" computed array and its
rendered card entirely (captured/analysed/brief/built timeline). Delete, not
fix — the underlying time math was also wrong (`built` could read absurd
values like `162:45`), but the whole section is being removed regardless.

## 5. Playback lifecycle fix

**Idea Detail (`ideas.$id.tsx`):** replace the per-click `new
Audio(u).play()` with an `audioRef = useRef<HTMLAudioElement>()`, created
once (lazily, on first play) and reused. `play()` toggles `.play()`/`.pause()`
on that one element instead of always creating a new one. `useEffect`
cleanup on unmount calls `.pause()`.

**Song Builder:** depends on the `playback.ts` rewrite (section 7) — the
returned controller's `.stop()` is called from a `useEffect` cleanup on
unmount, guaranteeing audio actually stops when the user navigates away.

## 6. Idea Detail: real waveform + scrub

**Data model** — new migration `supabase/migrations/0005_add_idea_waveform.sql`:

```sql
alter table ideas add column waveform_json jsonb;
```

No RLS change needed (`ideas_owner` policy already covers all columns).

**Capture (`app/lib/audio/decode.ts` or a small new helper in
`memoVisuals.ts`/`analyze.ts`):** `decodeAndClean()` already produces the
full decoded PCM `Float32Array` in `record.tsx`'s flow — bucket it into ~70
peak samples (max absolute amplitude per bucket, normalized 0..1) right
there, zero extra decode cost. Threaded through `analyzeCapture`'s return
value (`CaptureAnalysis` gains `waveformPeaks: number[]`) and saved via
`saveIdea()` into the new column.

**Rendering (`ideas.$id.tsx`):** if `row.waveform_json` is present, build the
SVG path from real peaks (reusing the existing smooth-path-through-points
logic already written for the synthetic waveform in `memoVisuals.ts`, applied
to real data instead of the seeded-noise generator); falls back to the
existing synthetic `wavePoints()` if a row predates this migration (old
ideas with `waveform_json = null`).

**Scrub:** a vertical line positioned at `(audio.currentTime / audio.duration) * width`,
updated via the `<audio>` element's `timeupdate` event. Click/drag on the
waveform's SVG computes the clicked fraction and sets `audio.currentTime`
directly (native seek, no extra plumbing needed).

**`Cassette` component:** unchanged — its compact list/thumbnail waveform
keeps using the synthetic per-id fingerprint; real peaks are only rendered on
Idea Detail's big waveform, per explicit scope decision above.

## 7. Song Builder: real transport playback

**`app/lib/audio/playback.ts` rewrite.** `playSong` currently: creates a
`Sampler`, loops `chordChart` scheduling each via
`synth.triggerAttackRelease(notes, beat, Tone.now() + i*beat)`, and resolves
once scheduling is done — no reference to the synth or any scheduled event is
returned, so nothing can stop it and there is no way to query position.

New shape:

```ts
export interface SongPlayback {
  stop(): void;
  seek(sec: number): void;
  getPosition(): number;      // seconds, current Transport position
  getDuration(): number;      // seconds, total scheduled length
}

export async function playSong(
  chordChart: { chord: string }[],
  bpm: number,
  onStart?: () => void,
): Promise<SongPlayback>
```

Implementation: schedule chords onto `Tone.Transport` via `Tone.Part` (each
part entry a `{ time, chord }` at its `index * beat` offset), start the
Transport, and return a controller wrapping `Tone.Transport.stop()` /
`Tone.Transport.seconds = sec` / `Tone.Transport.seconds` (get) / duration
computed once as `chordChart.length * beat`. `stop()` also disposes the
`Sampler` and clears the `Part` (`part.dispose()`) so repeated
play/stop/play cycles don't leak scheduled events or accumulate Samplers.

*(Considered and rejected: keeping raw `Tone.now()` scheduling and hand-
tracking elapsed time + pending event IDs for stop/seek. This reimplements
what `Tone.Transport` already provides, for strictly less capability and
more edge cases — e.g. seeking would mean cancelling and re-scheduling every
remaining chord by hand.)*

**`songs.$id.tsx` changes:**
- `songKey`/`songBpm`-equivalent display: `Math.round(idea.bpm)` instead of
  the raw float (`idea.bpm` is already used unrounded today — this fixes the
  `90.6661 BPM` display).
- `togglePlay` becomes async: on play, `await playSong(chart, idea.bpm)`,
  store the returned controller in a ref, `setPlaying(true)`; on
  pause/stop, call `controller.stop()`, `setPlaying(false)`.
- Position tracking: a `requestAnimationFrame` loop (only while `playing`)
  reads `controller.getPosition()`, converts to `currentChordIndex =
  floor(position / beat)`, and maps that index to a section via the
  already-flattened, already-section-tagged `chordchart_json` (each chord
  entry carries `section: string` — cross-reference against the `structure`
  array's per-section chord counts to find which section index owns the
  current chord). This replaces the hardcoded `const playIndex = 2` —
  section highlighting and the transport bar's fill percentage both derive
  from real position now, not a constant.
- Progress bar (`position:fixed;bottom:80px` in `songs.$id.tsx`, already
  sitting just above the fixed tab bar — no repositioning needed, just
  wiring) becomes click/drag-to-seek: pointer position over the bar maps to
  a fraction, `controller.seek(fraction * duration)`.
- `useEffect` cleanup on unmount: `controllerRef.current?.stop()` — the
  actual fix for "keeps playing after leaving the page."

## Error handling

Matches this codebase's established minimal style (fire-and-forget writes,
no toast system) except where already upgraded this session (e.g.
`renameIdea` throws on error). No new error-handling pattern introduced.
Audio/Transport failures (e.g. Sampler load failure) are not specially
handled beyond what already exists — out of scope for this batch.

## Testing / verification

No live browser available in this build environment (project-wide
constraint). Verification is `npm run typecheck` + `npm run build`, both
must pass with zero errors. Everything touching real audio timing, seeking,
Transport start/stop/dispose cycles, and the waveform peak capture pipeline
needs a live-browser pass before being considered fully verified — noting
that gap explicitly rather than claiming it works from static checks alone.

## Self-review

- No placeholders/TBDs.
- Internal consistency: `Cassette`'s synthetic waveform is explicitly kept
  (not silently contradicted by the "real waveform" heading elsewhere) —
  scope section and section 6 agree.
- Scope: one cohesive batch across two related-but-separable concerns (list
  UI polish, playback engine). Not decomposed into separate specs since the
  UI polish items (sections 1–4) need no real design deliberation and
  sections 5–7 share the same playback-lifecycle root cause — splitting
  would add process overhead without reducing risk.
- Ambiguity: "Recent 3" ordering (`created_at desc`, natural `listIdeas()`
  order) and duplication (also shown in "All ideas") both stated explicitly
  rather than left implicit.
