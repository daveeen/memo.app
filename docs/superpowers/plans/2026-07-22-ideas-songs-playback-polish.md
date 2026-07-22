# Ideas/Songs Polish + Real Playback Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the batch in `docs/superpowers/specs/2026-07-22-ideas-songs-playback-polish-design.md` — Ideas page Recent-3 + scoped scrolling, a stale-while-revalidate fetch cache killing the list/detail-page flash, detail-page cleanup, and a real (stoppable, seekable, scrubbable) playback engine for both idea audio and song chord playback.

**Architecture:** No new runtime dependencies. `Tone.Transport` replaces raw `Tone.now()`-offset scheduling in `playback.ts` so song playback gets real position tracking for free. Idea waveforms switch from synthetic per-id noise to real peaks bucketed from the PCM `decodeAndClean()` already decodes at record time, stored as a new jsonb column. A tiny hand-rolled `useCachedFetch` hook (module-level `Map`, no library) gives stale-while-revalidate semantics to the four pages that currently flash empty-then-populated.

**Tech Stack:** React Router 7 (SPA, `ssr:false`), Supabase (Postgres/Storage), Tone.js 15, existing `cssText()` inline-style convention. No test framework in this repo — verification is `npm run typecheck` (must pass with zero errors after every task) plus, for pure non-trivial logic, a runnable Node check script mirroring the existing `scripts/check-midi.mjs` pattern (`node --experimental-strip-types scripts/check-X.mjs` with plain `assert`).

---

## File Structure

**New:**
- `supabase/migrations/0005_add_idea_waveform.sql` — `ideas.waveform_json jsonb`
- `app/lib/useCachedFetch.ts` — stale-while-revalidate fetch hook
- `app/components/Spinner.tsx` — shared loading spinner
- `scripts/check-memoVisuals.mjs` — runnable check for the new pure math in `memoVisuals.ts`

**Modified:**
- `app/lib/memoVisuals.ts` — `bucketPeaks`, `envelopeToPath` (shared by `wavePoints`/new `realWavePath`), `chordIndexToRow`, `decoIdea` gains `realWavePoints`
- `app/lib/types.ts` — `CaptureAnalysis.waveformPeaks: number[]`
- `app/lib/audio/analyze.ts` — `analyzeCapture` computes `waveformPeaks`
- `app/lib/api/bank.ts` — `saveIdea` persists `waveform_json`
- `app/lib/audio/playback.ts` — full rewrite: `Tone.Transport`-based, returns a `SongPlayback` controller
- `app/routes/ideas.tsx` — cache+spinner, Recent-3 rack, scoped scroll
- `app/routes/songs.tsx` — cache+spinner
- `app/routes/ideas.$id.tsx` — cache+spinner, back-button removal, real ref-based playback, real waveform+scrub
- `app/routes/songs.$id.tsx` — cache+spinner, back-button + Built-in-stages removal, new playback wiring, integer BPM, real progress bar + scrub

---

### Task 1: Migration — `ideas.waveform_json`

**Files:**
- Create: `supabase/migrations/0005_add_idea_waveform.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table ideas add column waveform_json jsonb;
```

No RLS change needed — `ideas_owner` policy (`user_id = auth.uid()`) already covers all columns on the row, same reasoning as `0002_add_idea_note.sql`/`0003_add_idea_lyrics.sql`.

- [ ] **Step 2: Verify migration syntax**

Run: `npx supabase db lint` (or, if unavailable in this environment, visually diff against the existing `alter table ideas add column note text;` in `0002_add_idea_note.sql` — same shape, known-good pattern).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_add_idea_waveform.sql
git commit -m "feat(db): add ideas.waveform_json column for real waveform peaks"
```

Not applied to the live database by this task — that's a manual `npx supabase db push` step for the user, same as migration `0004`.

---

### Task 2: `useCachedFetch` hook + `Spinner` component

**Files:**
- Create: `app/lib/useCachedFetch.ts`
- Create: `app/components/Spinner.tsx`

- [ ] **Step 1: Write the hook**

```ts
// app/lib/useCachedFetch.ts
import { useEffect, useState } from "react";

// Module-level — survives client-side navigation within the SPA session,
// cleared on a full page reload. Not meant to outlive the tab.
const cache = new Map<string, unknown>();

// Stale-while-revalidate: a cache hit renders instantly (loading=false, no
// spinner) while silently refetching in the background and correcting
// data/cache when the fresh result lands. A cache miss (true first visit
// this session) sets loading=true until the first fetch resolves.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { data, loading };
}
```

No runnable check for this file — it's thin React state plumbing around
`Map.get`/`Map.set` (both already-correct stdlib behavior), not the kind of
non-trivial logic ponytail's "leave one check" rule is aimed at. Verified by
`npm run typecheck` plus the four call sites in Tasks 3–4 actually rendering
correctly.

- [ ] **Step 2: Write the spinner**

```tsx
// app/components/Spinner.tsx
import { cssText } from "~/lib/cssText";

export function Spinner() {
  return (
    <div style={cssText("flex:1;display:flex;align-items:center;justify-content:center;min-height:200px;")}>
      <div style={cssText("width:40px;height:40px;border-radius:50%;border:4px solid rgba(0,0,0,.08);border-top-color:#B5503C;animation:mSpin 1s linear infinite;")}></div>
    </div>
  );
}
```

`mSpin` keyframe already exists in `app/memo.css` (used by `brief.tsx`'s
loading state) — no new CSS needed.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/useCachedFetch.ts app/components/Spinner.tsx
git commit -m "feat: add stale-while-revalidate fetch cache + shared spinner"
```

---

### Task 3: Wire cache + spinner into Ideas and Songs lists

**Files:**
- Modify: `app/routes/ideas.tsx`
- Modify: `app/routes/songs.tsx`

- [ ] **Step 1: `ideas.tsx` — replace the raw fetch**

Replace:
```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { listIdeas } from "~/lib/api/bank";
import { decoIdea } from "~/lib/memoVisuals";
import { cssText } from "~/lib/cssText";

export default function Ideas() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [pullingId, setPullingId] = useState<string | null>(null);
  useEffect(() => { listIdeas().then(setRows); }, []);
```

With:
```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { listIdeas } from "~/lib/api/bank";
import { decoIdea } from "~/lib/memoVisuals";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function Ideas() {
  const nav = useNavigate();
  const { data: rows = [], loading } = useCachedFetch("ideas", listIdeas);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [pullingId, setPullingId] = useState<string | null>(null);
```

(`useEffect` import dropped — no longer used directly in this file.)

- [ ] **Step 2: `ideas.tsx` — add the loading branch and fade-in**

Find the `return (` that starts the JSX and insert a loading guard immediately before it:

```tsx
  if (loading) return <Spinner />;

  return (
```

Find the outermost returned `<div>` (currently `<div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>` — this exact line changes shape again in Task 5, so for this step only add the fade-in animation to whatever the current root style string is by appending `animation:mUp .3s ease both;` to it. After this step the line reads:

```tsx
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;animation:mUp .3s ease both;")}>
```

`mUp` keyframe already exists in `memo.css`.

- [ ] **Step 3: `songs.tsx` — same treatment**

Replace:
```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { listSongs } from "~/lib/api/bank";
import { cssText } from "~/lib/cssText";

export default function Songs() {
  const nav = useNavigate();
  const [songs, setSongs] = useState<any[]>([]);
  useEffect(() => { listSongs().then(setSongs); }, []);
```

With:
```tsx
import { useNavigate } from "react-router";
import { listSongs } from "~/lib/api/bank";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function Songs() {
  const nav = useNavigate();
  const { data: songs = [], loading } = useCachedFetch("songs", listSongs);
```

Then, before the `return (`:
```tsx
  if (loading) return <Spinner />;

  return (
```

And change the root div's style from:
```tsx
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
```
to:
```tsx
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;animation:mUp .3s ease both;")}>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/routes/ideas.tsx app/routes/songs.tsx
git commit -m "fix: cache Ideas/Songs list fetches, fade in instead of flashing empty"
```

---

### Task 4: Wire cache + spinner into Idea Detail and Song Builder

**Files:**
- Modify: `app/routes/ideas.$id.tsx`
- Modify: `app/routes/songs.$id.tsx`

- [ ] **Step 1: `ideas.$id.tsx` — replace the raw fetch**

Replace:
```tsx
import { useEffect, useState, Fragment } from "react";
import { useNavigate, useParams } from "react-router";
import { getIdea, ideaAudioUrl, renameIdea, updateIdeaNote, updateIdeaLyrics, listSongsForIdea, deleteIdea } from "~/lib/api/bank";
import { decoIdea } from "~/lib/memoVisuals";
import { Cassette } from "~/components/memo/Cassette";
import { cssText } from "~/lib/cssText";

export default function IdeaDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [row, setRow] = useState<any>();
  const [songs, setSongs] = useState<any[]>([]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!id) return;
    getIdea(id).then(setRow);
    listSongsForIdea(id).then(setSongs);
  }, [id]);
  if (!row || !id) return null;
```

With:
```tsx
import { useEffect, useState, Fragment } from "react";
import { useNavigate, useParams } from "react-router";
import { getIdea, ideaAudioUrl, renameIdea, updateIdeaNote, updateIdeaLyrics, listSongsForIdea, deleteIdea } from "~/lib/api/bank";
import { decoIdea } from "~/lib/memoVisuals";
import { Cassette } from "~/components/memo/Cassette";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function IdeaDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: row, loading } = useCachedFetch(`idea:${id}`, () => getIdea(id!));
  const [songs, setSongs] = useState<any[]>([]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!id) return;
    listSongsForIdea(id).then(setSongs);
  }, [id]);
  if (loading) return <Spinner />;
  if (!row || !id) return null;
```

(`getIdea` is only called inside the cached fetcher now — kept in the import list since it's still referenced there.)

- [ ] **Step 2: `ideas.$id.tsx` — fade in**

Change the root div's style from:
```tsx
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
```
to:
```tsx
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;animation:mUp .3s ease both;")}>
```

- [ ] **Step 3: `songs.$id.tsx` — replace the raw fetch**

Replace:
```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getSong } from "~/lib/api/bank";
import { playSong } from "~/lib/audio/playback";
import { supabase } from "~/lib/supabase";
import { SEC_COLORS } from "~/lib/memoVisuals";
import { cssText } from "~/lib/cssText";

export default function Builder() {
  const { id } = useParams();
  const nav = useNavigate();
  const [song, setSong] = useState<any>();
  const [playing, setPlaying] = useState(false);
  const [exported, setExported] = useState(false);
  useEffect(() => { if (id) getSong(id).then(setSong); }, [id]);
  if (!song || !id) return null;
```

With:
```tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getSong } from "~/lib/api/bank";
import { playSong } from "~/lib/audio/playback";
import { supabase } from "~/lib/supabase";
import { SEC_COLORS } from "~/lib/memoVisuals";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function Builder() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: song, loading } = useCachedFetch(`song:${id}`, () => getSong(id!));
  const [playing, setPlaying] = useState(false);
  const [exported, setExported] = useState(false);
  if (loading) return <Spinner />;
  if (!song || !id) return null;
```

(`useEffect` import dropped here too.)

- [ ] **Step 4: `songs.$id.tsx` — fade in**

The root div's exact style string changes again in Task 6 (Built-in removal doesn't touch it) and Task 11 — for this step, change:
```tsx
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 190px;")}>
```
to:
```tsx
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 190px;animation:mUp .3s ease both;")}>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add app/routes/ideas.\$id.tsx app/routes/songs.\$id.tsx
git commit -m "fix: cache Idea Detail/Song Builder fetches, fade in instead of flashing"
```

---

### Task 5: Ideas page — Recent-3 rack + scoped scrolling

**Files:**
- Modify: `app/routes/ideas.tsx`

- [ ] **Step 1: Factor the spine row into a reusable function**

Find:
```tsx
      <div style={cssText("margin-top:12px;background:linear-gradient(180deg,#2E2318,#1B140D);border-radius:12px;padding:10px 9px;box-shadow:inset 0 2px 12px rgba(0,0,0,.55),0 8px 18px rgba(60,44,32,.16);display:flex;flex-direction:column;gap:5px;overflow:visible;")}>
        {shown.map(d => (
          <button key={d.id} className="m-spine" onClick={() => pull(d.id)} style={spineStyle(d)}>
            <div style={cssText(`width:7px;align-self:stretch;background:${d.stripe};border-radius:3px 0 0 3px;flex:none;`)}></div>
            <div style={cssText("position:absolute;top:0;left:7px;right:0;height:46%;background:linear-gradient(180deg,rgba(255,255,255,.26),transparent);pointer-events:none;border-radius:0 3px 0 0;")}></div>
            <div style={cssText("flex:1;min-width:0;margin:0 9px;padding:4px 10px;background:linear-gradient(180deg,#F4EDDB,#E6D8BC);border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.55);display:flex;align-items:center;")}>
              <span style={cssText("font-size:19px;font-weight:700;line-height:1.3;color:#2E2418;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{d.name}</span>
            </div>
            <div style={cssText(`flex:none;display:flex;align-items:center;gap:9px;padding-right:12px;color:${d.ink};`)}>
              <span style={cssText("font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.8;white-space:nowrap;")}>{d.type}</span>
              <span style={cssText("font-family:'Space Mono',monospace;font-size:9px;opacity:.82;white-space:nowrap;")}>{d.spineMeta}</span>
              <div style={cssText("display:flex;gap:2px;opacity:.5;")}><div style={cssText("width:2px;height:12px;background:currentColor;border-radius:1px;")}></div><div style={cssText("width:2px;height:12px;background:currentColor;border-radius:1px;")}></div></div>
            </div>
          </button>
        ))}
      </div>
```

Replace with (note: this step only extracts the row into a function — the
rack `<div>` wrapper itself moves in Step 3, so don't render `spineRack`
here yet, just define it above the `return`):

Insert, immediately before `return (`:
```tsx
  const spineRow = (d: any) => (
    <button key={d.id} className="m-spine" onClick={() => pull(d.id)} style={spineStyle(d)}>
      <div style={cssText(`width:7px;align-self:stretch;background:${d.stripe};border-radius:3px 0 0 3px;flex:none;`)}></div>
      <div style={cssText("position:absolute;top:0;left:7px;right:0;height:46%;background:linear-gradient(180deg,rgba(255,255,255,.26),transparent);pointer-events:none;border-radius:0 3px 0 0;")}></div>
      <div style={cssText("flex:1;min-width:0;margin:0 9px;padding:4px 10px;background:linear-gradient(180deg,#F4EDDB,#E6D8BC);border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.55);display:flex;align-items:center;")}>
        <span style={cssText("font-size:19px;font-weight:700;line-height:1.3;color:#2E2418;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{d.name}</span>
      </div>
      <div style={cssText(`flex:none;display:flex;align-items:center;gap:9px;padding-right:12px;color:${d.ink};`)}>
        <span style={cssText("font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.8;white-space:nowrap;")}>{d.type}</span>
        <span style={cssText("font-family:'Space Mono',monospace;font-size:9px;opacity:.82;white-space:nowrap;")}>{d.spineMeta}</span>
        <div style={cssText("display:flex;gap:2px;opacity:.5;")}><div style={cssText("width:2px;height:12px;background:currentColor;border-radius:1px;")}></div><div style={cssText("width:2px;height:12px;background:currentColor;border-radius:1px;")}></div></div>
      </div>
    </button>
  );
  const recent = ideas.slice(0, 3);
```

`ideas` (the full `rows.map((r,i)=>decoIdea(r,i))` array, already defined
above this point) is already in natural `created_at desc` order from
`listIdeas()` — `.slice(0,3)` is always the 3 most recent, unaffected by
`query`/`filter`.

- [ ] **Step 2: Restructure the root container to a fixed-height, non-scrolling shell**

Replace:
```tsx
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;animation:mUp .3s ease both;")}>
```
with:
```tsx
    <div style={cssText("height:100dvh;overflow:hidden;display:flex;flex-direction:column;padding:24px 22px 0;animation:mUp .3s ease both;")}>
```

`height:100dvh` is an absolute viewport unit — it holds regardless of the
ancestor `_shell.tsx`/`root.tsx` chain using `min-height:100vh` (which
allows growth), so this route's own box is reliably capped to one viewport
regardless of content length. `overflow:hidden` here is what stops the
*page* from scrolling — only the new inner region (Step 4) does.

- [ ] **Step 3: Insert the Recent rack between the filter chips and "All ideas"**

Find:
```tsx
      <div style={cssText("display:flex;gap:8px;margin-top:11px;overflow-x:auto;")}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={chip(f)}>{f}</button>
        ))}
      </div>

      <div style={cssText("margin-top:24px;display:flex;align-items:baseline;justify-content:space-between;")}>
        <div style={cssText("font-size:16px;font-weight:700;letter-spacing:-.02em;color:#2E2418;")}>All ideas</div>
        <div style={cssText("font-size:11.5px;font-weight:600;color:#8a7d68;")}>Tap a tape to pull it out</div>
      </div>
```

Replace with:
```tsx
      <div style={cssText("display:flex;gap:8px;margin-top:11px;overflow-x:auto;")}>
        {filters.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={chip(f)}>{f}</button>
        ))}
      </div>

      {recent.length > 0 && (
        <>
          <div style={cssText("margin-top:24px;font-size:16px;font-weight:700;letter-spacing:-.02em;color:#2E2418;")}>Recent</div>
          <div style={cssText("margin-top:12px;background:linear-gradient(180deg,#2E2318,#1B140D);border-radius:12px;padding:10px 9px;box-shadow:inset 0 2px 12px rgba(0,0,0,.55),0 8px 18px rgba(60,44,32,.16);display:flex;flex-direction:column;gap:5px;overflow:visible;flex:none;")}>
            {recent.map(spineRow)}
          </div>
        </>
      )}

      <div style={cssText("margin-top:24px;display:flex;align-items:baseline;justify-content:space-between;flex:none;")}>
        <div style={cssText("font-size:16px;font-weight:700;letter-spacing:-.02em;color:#2E2418;")}>All ideas</div>
        <div style={cssText("font-size:11.5px;font-weight:600;color:#8a7d68;")}>Tap a tape to pull it out</div>
      </div>
```

(`flex:none` on both the Recent rack and the "All ideas" header row keeps
them from being squeezed by the new `flex:1` scroll region in Step 4 —
everything above that region should size to its own content, not share
flex-grow with it.)

- [ ] **Step 4: Make the "All ideas" rack — and only it — scroll**

Find:
```tsx
      <div style={cssText("margin-top:12px;background:linear-gradient(180deg,#2E2318,#1B140D);border-radius:12px;padding:10px 9px;box-shadow:inset 0 2px 12px rgba(0,0,0,.55),0 8px 18px rgba(60,44,32,.16);display:flex;flex-direction:column;gap:5px;overflow:visible;")}>
        {shown.map(d => (
          <button key={d.id} className="m-spine" onClick={() => pull(d.id)} style={spineStyle(d)}>
            <div style={cssText(`width:7px;align-self:stretch;background:${d.stripe};border-radius:3px 0 0 3px;flex:none;`)}></div>
            <div style={cssText("position:absolute;top:0;left:7px;right:0;height:46%;background:linear-gradient(180deg,rgba(255,255,255,.26),transparent);pointer-events:none;border-radius:0 3px 0 0;")}></div>
            <div style={cssText("flex:1;min-width:0;margin:0 9px;padding:4px 10px;background:linear-gradient(180deg,#F4EDDB,#E6D8BC);border-radius:2px;box-shadow:0 1px 2px rgba(0,0,0,.28),inset 0 1px 0 rgba(255,255,255,.55);display:flex;align-items:center;")}>
              <span style={cssText("font-size:19px;font-weight:700;line-height:1.3;color:#2E2418;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{d.name}</span>
            </div>
            <div style={cssText(`flex:none;display:flex;align-items:center;gap:9px;padding-right:12px;color:${d.ink};`)}>
              <span style={cssText("font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.8;white-space:nowrap;")}>{d.type}</span>
              <span style={cssText("font-family:'Space Mono',monospace;font-size:9px;opacity:.82;white-space:nowrap;")}>{d.spineMeta}</span>
              <div style={cssText("display:flex;gap:2px;opacity:.5;")}><div style={cssText("width:2px;height:12px;background:currentColor;border-radius:1px;")}></div><div style={cssText("width:2px;height:12px;background:currentColor;border-radius:1px;")}></div></div>
            </div>
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <div style={cssText("text-align:center;padding:36px 14px;")}>
          <div style={cssText("font-size:14px;font-weight:600;color:#57565E;")}>{noResultsMsg}</div>
          <button onClick={clearFilters} style={cssText("margin-top:12px;padding:9px 18px;border-radius:20px;border:none;background:#2E2418;color:#fff;font-weight:600;font-size:13px;cursor:pointer;")}>Clear filters</button>
        </div>
      )}
    </div>
  );
}
```

Replace with:
```tsx
      <div className="m-scroll" style={cssText("flex:1;min-height:0;margin-top:12px;padding-bottom:120px;")}>
        <div style={cssText("background:linear-gradient(180deg,#2E2318,#1B140D);border-radius:12px;padding:10px 9px;box-shadow:inset 0 2px 12px rgba(0,0,0,.55),0 8px 18px rgba(60,44,32,.16);display:flex;flex-direction:column;gap:5px;overflow:visible;")}>
          {shown.map(spineRow)}
        </div>
        {shown.length === 0 && (
          <div style={cssText("text-align:center;padding:36px 14px;")}>
            <div style={cssText("font-size:14px;font-weight:600;color:#57565E;")}>{noResultsMsg}</div>
            <button onClick={clearFilters} style={cssText("margin-top:12px;padding:9px 18px;border-radius:20px;border:none;background:#2E2418;color:#fff;font-weight:600;font-size:13px;cursor:pointer;")}>Clear filters</button>
          </div>
        )}
      </div>
    </div>
  );
}
```

`min-height:0` is required — flex children default to `min-height:auto`,
which silently prevents `overflow-y:auto` from ever kicking in inside a
flex column. `padding-bottom:120px` (moved from the old root) keeps the
last spine clear of the fixed tab bar while scrolled to the bottom.

Search bar, filter chips, and their behavior/position are otherwise
completely untouched, per explicit instruction.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add app/routes/ideas.tsx
git commit -m "feat: Recent-3 rack on Ideas, scope scrolling to the All-ideas list"
```

---

### Task 6: Detail-page cleanup — remove back buttons + Built-in stages

**Files:**
- Modify: `app/routes/ideas.$id.tsx`
- Modify: `app/routes/songs.$id.tsx`

Tab bar already renders on both routes (`_shell.tsx`'s `showTabs` already
matches `/ideas/*` and `/songs/*`) — this is decluttering, not a navigation
fix, and doesn't change how the tab bar itself works.

- [ ] **Step 1: `ideas.$id.tsx` — remove the back button**

Find:
```tsx
      <button onClick={() => nav('/ideas')} style={cssText("display:flex;align-items:center;gap:7px;border:none;background:none;cursor:pointer;color:#57565E;font-size:14px;font-weight:600;padding:0;")}>← Ideas</button>
      <div style={cssText("margin-top:16px;display:flex;gap:16px;align-items:flex-start;")}>
```

Replace with:
```tsx
      <div style={cssText("display:flex;gap:16px;align-items:flex-start;")}>
```

(Dropped `margin-top:16px` along with the button above it, since there's no
longer anything to space away from at the top of the scroll area.)

- [ ] **Step 2: `songs.$id.tsx` — remove the back button and the Built-in stages card**

Find:
```tsx
  const instrumentation: string[] = song.instrumentation_json ?? [];
  const fmt = (a: string, b: string) => { const d = Math.max(0, (new Date(a).getTime() - new Date(b).getTime()) / 1000); return `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, "0")}`; };
  const stages = [
    { label: "captured", time: "0:00" },
    { label: "analysed", time: "0:00" },
    { label: "brief", time: brief ? fmt(brief.created_at, idea.created_at) : "—" },
    { label: "built", time: fmt(song.created_at, idea.created_at) },
  ];
  async function exportMidi() {
```

Replace with:
```tsx
  const instrumentation: string[] = song.instrumentation_json ?? [];
  async function exportMidi() {
```

Find:
```tsx
      {/* bottom padding clears the fixed transport bar (~74px) stacked above the
          fixed tab bar (80px) below it — 120px used to let the last card hide behind them. */}
      {/* Transcribed from .memo-design/screen-07-builder.html's builderComplete branch
          (builderBuilding branch skipped — this route always loads an already-built song). */}
      <button onClick={() => nav("/songs")} style={cssText("display:flex;align-items:center;gap:7px;border:none;background:none;cursor:pointer;color:#57565E;font-size:14px;font-weight:600;padding:0;")}>← Songs</button>
      <div style={cssText("margin-top:14px;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#57565E;")}>Song</div>
```

Replace with:
```tsx
      {/* bottom padding clears the fixed transport bar (~74px) stacked above the
          fixed tab bar (80px) below it — 120px used to let the last card hide behind them. */}
      <div style={cssText("font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#57565E;")}>Song</div>
```

Find:
```tsx
      <div style={cssText("margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Built in</div>
      <div style={cssText("margin-top:10px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:13px;overflow:hidden;")}>
        {stages.map((s, i) => (
          <div key={i} style={cssText(`display:flex;align-items:center;justify-content:space-between;padding:10px 14px;${i < stages.length - 1 ? "border-bottom:1px solid rgba(0,0,0,.06);" : ""}`)}>
            <span style={cssText("font-size:13px;font-weight:600;color:#17161B;text-transform:capitalize;")}>{s.label}</span>
            <span style={cssText("font-family:'Space Mono',monospace;font-size:12px;color:#8a8791;")}>{s.time}</span>
          </div>
        ))}
      </div>

      <div style={cssText("margin-top:20px;display:flex;flex-direction:column;gap:10px;")}>
```

Replace with:
```tsx
      <div style={cssText("margin-top:20px;display:flex;flex-direction:column;gap:10px;")}>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors (confirms `nav` is still used elsewhere in
`songs.$id.tsx` — it is, by the Export/Produce buttons further down — so no
unused-import error from removing just the one button).

- [ ] **Step 4: Commit**

```bash
git add app/routes/ideas.\$id.tsx app/routes/songs.\$id.tsx
git commit -m "chore: remove redundant back buttons and Built-in stages card"
```

---

### Task 7: `memoVisuals.ts` — waveform + section-mapping pure logic

**Files:**
- Modify: `app/lib/memoVisuals.ts`
- Create: `scripts/check-memoVisuals.mjs`

- [ ] **Step 1: Refactor `wavePoints` to share a path builder, add `bucketPeaks`/`realWavePath`/`chordIndexToRow`**

Find:
```ts
// Smooth closed-curve waveform fingerprint — seed derived from a stable
// per-idea number so each recording gets a unique but deterministic shape.
// Returns an SVG <path> `d` string (use with <path>, not <polygon>: a straight-
// edge polygon through raw noise reads as jagged/sketchy, not like audio).
export function wavePoints(seed: number): string {
  const N = 40, W = 100, H = 24, mid = H / 2, amp = mid - 1;
  let env = Array.from({ length: N }, (_, i) => {
    const e = 1 - Math.abs(i - (N - 1) / 2) / ((N - 1) / 2);
    const r = Math.abs(Math.sin(seed * 12.9898 * (i + 1))) % 1;
    return Math.max(0.06, (0.35 + 0.65 * r) * (0.35 + 0.65 * e));
  });
  // Smooth sample-to-sample jaggedness (two passes of a 3-tap average) so the
  // envelope reads like a real audio waveform instead of random spikes.
  for (let pass = 0; pass < 2; pass++) {
    env = env.map((v, i) => (env[Math.max(0, i - 1)] + 2 * v + env[Math.min(N - 1, i + 1)]) / 4);
  }
  const top: [number, number][] = env.map((p, i) => [i * W / (N - 1), mid - p * amp] as [number, number]);
  const bot: [number, number][] = env.map((p, i) => [i * W / (N - 1), mid + p * amp] as [number, number]).reverse();
  const pts = [...top, ...bot];
  // Quadratic midpoint smoothing through the closed point loop — turns the
  // jagged polyline into a flowing organic curve.
  const mid0 = [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2];
  let d = `M ${mid0[0].toFixed(1)},${mid0[1].toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i], next = pts[(i + 1) % pts.length];
    const mx = (cur[0] + next[0]) / 2, my = (cur[1] + next[1]) / 2;
    d += ` Q ${cur[0].toFixed(1)},${cur[1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  return d + ' Z';
}
```

Replace with:
```ts
// Shared by wavePoints() (synthetic) and realWavePath() (actual decoded
// audio): builds a smooth closed SVG <path> `d` string from a 0..1
// normalized envelope of any length, via quadratic midpoint smoothing (turns
// a jagged polyline into a flowing organic curve — a straight-edge <polygon>
// through raw samples reads as sketchy, not like audio).
function envelopeToPath(env: number[]): string {
  const W = 100, H = 24, mid = H / 2, amp = mid - 1;
  const n = env.length;
  const top: [number, number][] = env.map((p, i) => [i * W / (n - 1), mid - p * amp] as [number, number]);
  const bot: [number, number][] = env.map((p, i) => [i * W / (n - 1), mid + p * amp] as [number, number]).reverse();
  const pts = [...top, ...bot];
  const mid0 = [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2];
  let d = `M ${mid0[0].toFixed(1)},${mid0[1].toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i], next = pts[(i + 1) % pts.length];
    const mx = (cur[0] + next[0]) / 2, my = (cur[1] + next[1]) / 2;
    d += ` Q ${cur[0].toFixed(1)},${cur[1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  return d + ' Z';
}

// Synthetic waveform fingerprint — seed derived from a stable per-idea
// number so each recording gets a unique but deterministic shape. Used by
// Cassette's compact list/thumbnail view, which stays decorative/synthetic
// even once real peaks exist (see realWavePath) — a tiny thumbnail doesn't
// need to be literal, and it's the only rendering available before a
// recording has been analyzed.
export function wavePoints(seed: number): string {
  const N = 40;
  let env = Array.from({ length: N }, (_, i) => {
    const e = 1 - Math.abs(i - (N - 1) / 2) / ((N - 1) / 2);
    const r = Math.abs(Math.sin(seed * 12.9898 * (i + 1))) % 1;
    return Math.max(0.06, (0.35 + 0.65 * r) * (0.35 + 0.65 * e));
  });
  // Smooth sample-to-sample jaggedness (two passes of a 3-tap average) so the
  // envelope reads like a real audio waveform instead of random spikes.
  for (let pass = 0; pass < 2; pass++) {
    env = env.map((v, i) => (env[Math.max(0, i - 1)] + 2 * v + env[Math.min(N - 1, i + 1)]) / 4);
  }
  return envelopeToPath(env);
}

// Real waveform from decoded-audio peaks (see bucketPeaks) — used only by
// Idea Detail's big waveform, once a recording has waveform_json stored.
export function realWavePath(peaks: number[]): string {
  if (peaks.length < 2) return envelopeToPath([0.1, 0.1]);
  // Normalize against this recording's own loudest bucket so a quiet take
  // still fills the waveform box, rather than reusing the seeded-noise
  // generator's arbitrary 0.06-1 range.
  const max = Math.max(...peaks, 1e-6);
  return envelopeToPath(peaks.map((p) => Math.max(0.06, p / max)));
}

// Bucket a decoded PCM signal into `bucketCount` peak-amplitude samples
// (max absolute value per bucket). Called once at record time on the same
// Float32Array decodeAndClean() already produced — no extra decode cost.
export function bucketPeaks(pcm: Float32Array, bucketCount = 70): number[] {
  if (pcm.length === 0) return Array.from({ length: bucketCount }, () => 0);
  const bucketSize = Math.max(1, Math.floor(pcm.length / bucketCount));
  const peaks: number[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const start = i * bucketSize;
    const end = i === bucketCount - 1 ? pcm.length : start + bucketSize;
    let max = 0;
    for (let j = start; j < end && j < pcm.length; j++) max = Math.max(max, Math.abs(pcm[j]));
    peaks.push(max);
  }
  return peaks;
}

// Maps an absolute chord index (position/beat, from playback.ts's
// SongPlayback.getPosition()) to which row of Builder's `structure` array
// currently owns it — purely positional (cumulative chord count per row),
// NOT by matching structure[i].label against each chord's `section` string.
// songs.$id.tsx's own `structure` computation filters chords by label match,
// which silently merges rows that share a label (e.g. two "verse" rows) —
// not fixed here (out of scope, not what was asked), but this function
// avoids compounding that ambiguity: given each row's already-computed
// `chords.length`, index-based lookup is unambiguous regardless of
// duplicate labels.
export function chordIndexToRow(chordCountsByRow: number[], chordIndex: number): number {
  let row = 0, cumulative = 0;
  for (let i = 0; i < chordCountsByRow.length; i++) {
    if (chordIndex >= cumulative) row = i;
    cumulative += chordCountsByRow[i];
  }
  return row;
}
```

- [ ] **Step 2: Add `waveform_json` to `decoIdea`'s input type and gain `realWavePoints`**

Find:
```ts
// Cassette-shape decoration for one idea row/card. `idx` selects the palette.
export function decoIdea(d: {id:string; key?:string|null; bpm?:number|null; input_type?:string|null; mood?:string|null; title?:string; duration?:number|null; keyLow?:boolean}, idx: number) {
  const p = PAL[idx % PAL.length];
  const keyShort = (d.key||'').split(' ')[0];
  const bpmShort = d.bpm != null ? `${Math.round(d.bpm)}` : '—';
  return {
    id: d.id, ...p,
    name: d.title || 'Untitled',
    key: d.key || '—', bpm: d.bpm != null ? `${Math.round(d.bpm)} BPM` : '— BPM',
    type: d.input_type || 'other', mood: d.mood || '—',
    duration: d.duration != null ? formatDuration(d.duration) : '0:00',
    wavePoints: wavePoints(seedFromId(d.id)),
    keyLow: !!d.keyLow,
    spineMeta: `${keyShort} · ${bpmShort}`,
  };
}
```

Replace with:
```ts
// Cassette-shape decoration for one idea row/card. `idx` selects the palette.
export function decoIdea(d: {id:string; key?:string|null; bpm?:number|null; input_type?:string|null; mood?:string|null; title?:string; duration?:number|null; keyLow?:boolean; waveform_json?: number[] | null}, idx: number) {
  const p = PAL[idx % PAL.length];
  const keyShort = (d.key||'').split(' ')[0];
  const bpmShort = d.bpm != null ? `${Math.round(d.bpm)}` : '—';
  const realPeaks = d.waveform_json && d.waveform_json.length > 1 ? d.waveform_json : null;
  return {
    id: d.id, ...p,
    name: d.title || 'Untitled',
    key: d.key || '—', bpm: d.bpm != null ? `${Math.round(d.bpm)} BPM` : '— BPM',
    type: d.input_type || 'other', mood: d.mood || '—',
    duration: d.duration != null ? formatDuration(d.duration) : '0:00',
    wavePoints: wavePoints(seedFromId(d.id)),
    realWavePoints: realPeaks ? realWavePath(realPeaks) : null,
    keyLow: !!d.keyLow,
    spineMeta: `${keyShort} · ${bpmShort}`,
  };
}
```

- [ ] **Step 3: Write the runnable check**

```js
// scripts/check-memoVisuals.mjs
// Real, runnable check for the pure math in app/lib/memoVisuals.ts — no test
// framework, just assert, mirroring scripts/check-midi.mjs's pattern.
//
// Run with:
//   node --experimental-strip-types scripts/check-memoVisuals.mjs
import assert from "node:assert";
import { bucketPeaks, realWavePath, wavePoints, chordIndexToRow } from "../app/lib/memoVisuals.ts";

// --- bucketPeaks --------------------------------------------------------
{
  const pcm = new Float32Array(700);
  for (let i = 0; i < pcm.length; i++) pcm[i] = i < 350 ? 0.5 : 1.0; // louder second half
  const peaks = bucketPeaks(pcm, 70);
  assert.strictEqual(peaks.length, 70, `expected 70 buckets, got ${peaks.length}`);
  assert(peaks.every((p) => p >= 0 && p <= 1), "peak out of 0..1 range");
  assert(peaks[0] < peaks[peaks.length - 1], "louder second half should produce larger late-bucket peaks");
  const empty = bucketPeaks(new Float32Array(0), 70);
  assert.strictEqual(empty.length, 70, "empty pcm should still return bucketCount zeros");
  assert(empty.every((p) => p === 0), "empty pcm buckets should all be 0");
  console.log("bucketPeaks OK");
}

// --- realWavePath / wavePoints — both return a well-formed closed path --
{
  const peaks = Array.from({ length: 70 }, (_, i) => (i % 10) / 10 + 0.05);
  const path = realWavePath(peaks);
  assert(path.startsWith("M "), "path should start with a moveto");
  assert(path.endsWith("Z"), "path should be closed");
  assert(path.includes("Q "), "path should use quadratic curves, not straight lines");

  const short = realWavePath([0.5]);
  assert(short.startsWith("M ") && short.endsWith("Z"), "single-peak input should fall back to a valid path, not throw");

  const synthetic = wavePoints(3.7);
  assert(synthetic.startsWith("M ") && synthetic.endsWith("Z"), "synthetic wavePoints should also be a valid closed path");
  console.log("realWavePath/wavePoints OK");
}

// --- chordIndexToRow — positional, not label-based ----------------------
{
  // 3 rows: intro(2 chords), verse(4 chords), verse(4 chords) — duplicate
  // label on purpose, to prove this doesn't merge them.
  const counts = [2, 4, 4];
  assert.strictEqual(chordIndexToRow(counts, 0), 0, "chord 0 -> row 0 (intro)");
  assert.strictEqual(chordIndexToRow(counts, 1), 0, "chord 1 -> row 0 (intro)");
  assert.strictEqual(chordIndexToRow(counts, 2), 1, "chord 2 -> row 1 (first verse)");
  assert.strictEqual(chordIndexToRow(counts, 5), 1, "chord 5 -> row 1 (first verse)");
  assert.strictEqual(chordIndexToRow(counts, 6), 2, "chord 6 -> row 2 (second verse)");
  assert.strictEqual(chordIndexToRow(counts, 9), 2, "chord 9 -> row 2 (second verse)");
  assert.strictEqual(chordIndexToRow(counts, 999), 2, "out-of-range index clamps to the last row");
  console.log("chordIndexToRow OK");
}
```

- [ ] **Step 4: Run the check**

Run: `node --experimental-strip-types scripts/check-memoVisuals.mjs`
Expected:
```
bucketPeaks OK
realWavePath/wavePoints OK
chordIndexToRow OK
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add app/lib/memoVisuals.ts scripts/check-memoVisuals.mjs
git commit -m "feat: real-waveform + chord-to-section pure logic, with a runnable check"
```

---

### Task 8: Thread waveform capture through types, analyze, save

**Files:**
- Modify: `app/lib/types.ts`
- Modify: `app/lib/audio/analyze.ts`
- Modify: `app/lib/api/bank.ts`

- [ ] **Step 1: `types.ts` — add the field**

Find:
```ts
export interface CaptureAnalysis {
  id: string; durationSec: number; detectedKey: string; bpm: number;
  inputType: "hum" | "vocal" | "guitar" | "other"; moodTag: string;
  notes: { pitch: string; startSec: number; durSec: number }[];
  cleanedAudioPath: string;
}
```

Replace with:
```ts
export interface CaptureAnalysis {
  id: string; durationSec: number; detectedKey: string; bpm: number;
  inputType: "hum" | "vocal" | "guitar" | "other"; moodTag: string;
  notes: { pitch: string; startSec: number; durSec: number }[];
  cleanedAudioPath: string;
  waveformPeaks: number[];
}
```

- [ ] **Step 2: `analyze.ts` — compute it**

Find:
```ts
import { getEssentia } from "./essentia";
import { decodeAndClean } from "./decode";
import { classifyInput } from "./classify";
import { detectChords } from "./chords";
import { segment } from "./segment";
import type { CaptureAnalysis, VibeBrief } from "~/lib/types";
```

Replace with:
```ts
import { getEssentia } from "./essentia";
import { decodeAndClean } from "./decode";
import { classifyInput } from "./classify";
import { detectChords } from "./chords";
import { segment } from "./segment";
import { bucketPeaks } from "~/lib/memoVisuals";
import type { CaptureAnalysis, VibeBrief } from "~/lib/types";
```

Find:
```ts
  const moodTag = moodFrom(scale, bpm);
  return { durationSec, detectedKey: `${key} ${scale}`, bpm, inputType, moodTag, notes };
}
```

Replace with:
```ts
  const moodTag = moodFrom(scale, bpm);
  const waveformPeaks = bucketPeaks(pcm);
  return { durationSec, detectedKey: `${key} ${scale}`, bpm, inputType, moodTag, notes, waveformPeaks };
}
```

(`pcm` is already in scope at this point in `analyzeCapture` — destructured
earlier from `decodeAndClean(blob)`.)

- [ ] **Step 3: `bank.ts` — persist it**

Find:
```ts
export async function saveIdea(blob: Blob, a: Omit<CaptureAnalysis, "id" | "cleanedAudioPath">, title: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const path = `${user.id}/${crypto.randomUUID()}.webm`;
  const { error: uploadError } = await supabase.storage.from("raw-audio").upload(path, blob);
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("ideas").insert({
    title, raw_path: path, duration: a.durationSec, key: a.detectedKey,
    bpm: a.bpm, notes_json: a.notes, input_type: a.inputType, mood: a.moodTag,
  }).select().single();
  if (error) throw error;
  return data;
}
```

Replace with:
```ts
export async function saveIdea(blob: Blob, a: Omit<CaptureAnalysis, "id" | "cleanedAudioPath">, title: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const path = `${user.id}/${crypto.randomUUID()}.webm`;
  const { error: uploadError } = await supabase.storage.from("raw-audio").upload(path, blob);
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("ideas").insert({
    title, raw_path: path, duration: a.durationSec, key: a.detectedKey,
    bpm: a.bpm, notes_json: a.notes, input_type: a.inputType, mood: a.moodTag,
    waveform_json: a.waveformPeaks,
  }).select().single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero errors. (`record.tsx`'s `finishAnalysis` already passes the
full `CaptureAnalysis` result through to `saveIdea` unchanged — no edit
needed there, `a.waveformPeaks` flows through automatically now that the
type carries it.)

- [ ] **Step 5: Commit**

```bash
git add app/lib/types.ts app/lib/audio/analyze.ts app/lib/api/bank.ts
git commit -m "feat: capture + persist real waveform peaks at record time"
```

Note: this requires migration `0005` (Task 1) to be applied
(`npx supabase db push`) before newly-recorded ideas will actually have
`waveform_json` populated — until then the insert's extra column is simply
ignored/errors depending on whether the column exists; apply the migration
before or immediately after this task lands.

---

### Task 9: Idea Detail — real playback (ref-based) + real waveform + scrub

**Files:**
- Modify: `app/routes/ideas.$id.tsx`

This is the fix for "can't stop the idea audio, keeps playing after leaving
the page" — `play()` currently does `new Audio(u).play()` on every click,
an untracked object with nothing to call `.pause()` on. Also adds the real
waveform (from Task 7/8's data) and a scrub playhead.

- [ ] **Step 1: Replace the play() function with a ref-based one, add scrub state**

Find:
```tsx
export default function IdeaDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: row, loading } = useCachedFetch(`idea:${id}`, () => getIdea(id!));
  const [songs, setSongs] = useState<any[]>([]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!id) return;
    listSongsForIdea(id).then(setSongs);
  }, [id]);
  if (loading) return <Spinner />;
  if (!row || !id) return null;
  const d = decoIdea(row, 0);
  async function play() {
    const u = await ideaAudioUrl(row.raw_path);
    if (u) { new Audio(u).play(); setPlaying(true); }
  }
```

Replace with:
```tsx
export default function IdeaDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: row, loading } = useCachedFetch(`idea:${id}`, () => getIdea(id!));
  const [songs, setSongs] = useState<any[]>([]);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(undefined);
  useEffect(() => {
    if (!id) return;
    listSongsForIdea(id).then(setSongs);
  }, [id]);
  // Force-stop on unmount/navigation — this, plus reusing one <audio>
  // element below instead of a fresh one per click, is the actual fix for
  // "keeps playing after leaving the page."
  useEffect(() => () => { audioRef.current?.pause(); }, []);
  if (loading) return <Spinner />;
  if (!row || !id) return null;
  const d = decoIdea(row, 0);
  async function togglePlay() {
    if (!audioRef.current) {
      const u = await ideaAudioUrl(row.raw_path);
      if (!u) return;
      const el = new Audio(u);
      el.addEventListener("loadedmetadata", () => setDuration(el.duration));
      el.addEventListener("timeupdate", () => setCurrentTime(el.currentTime));
      el.addEventListener("ended", () => setPlaying(false));
      audioRef.current = el;
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { audioRef.current.play(); setPlaying(true); }
  }
  function seek(fraction: number) {
    if (!audioRef.current || !duration) return;
    audioRef.current.currentTime = Math.max(0, Math.min(1, fraction)) * duration;
  }
```

- [ ] **Step 2: Add the `useRef` import**

Find:
```tsx
import { useEffect, useState, Fragment } from "react";
```

Replace with:
```tsx
import { useEffect, useRef, useState, Fragment } from "react";
```

- [ ] **Step 3: Wire the play button to the renamed handler**

Find:
```tsx
          <button onClick={play} style={cssText("margin-top:12px;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:22px;border:none;background:#17161B;color:#fff;font-weight:600;font-size:13px;cursor:pointer;")}>{playing ? '❚❚' : '▶'} {playing ? 'Playing' : 'Play take'}</button>
```

Replace with:
```tsx
          <button onClick={togglePlay} style={cssText("margin-top:12px;display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:22px;border:none;background:#17161B;color:#fff;font-weight:600;font-size:13px;cursor:pointer;")}>{playing ? '❚❚' : '▶'} {playing ? 'Playing' : 'Play take'}</button>
```

- [ ] **Step 4: Real waveform + scrub, replacing the static SVG block**

Find:
```tsx
      {/* full angular waveform */}
      <div style={cssText("margin-top:20px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:16px;padding:16px;box-shadow:0 4px 14px rgba(0,0,0,.04);")}>
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={cssText("width:100%;height:70px;display:block;")}><path d={d.wavePoints} fill={d.stripe}></path></svg>
      </div>
```

Replace with:
```tsx
      {/* full angular waveform — real decoded peaks when available (Task 7/8),
          falls back to the synthetic per-id fingerprint for ideas recorded
          before waveform_json existed */}
      <div
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          seek((e.clientX - rect.left) / rect.width);
        }}
        style={cssText("position:relative;margin-top:20px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:16px;padding:16px;box-shadow:0 4px 14px rgba(0,0,0,.04);cursor:pointer;")}
      >
        <svg viewBox="0 0 100 26" preserveAspectRatio="none" style={cssText("width:100%;height:70px;display:block;")}><path d={d.realWavePoints ?? d.wavePoints} fill={d.stripe}></path></svg>
        {duration > 0 && (
          <div style={cssText(`position:absolute;top:16px;bottom:16px;left:${16 + (currentTime / duration) * (100 - 3.2)}%;width:2px;background:#17161B;box-shadow:0 0 4px rgba(0,0,0,.4);pointer-events:none;`)}></div>
        )}
      </div>
```

(The playhead's `left` expression accounts for the container's `16px`
padding on a percentage basis approximately — `16 + fraction*(100-3.2)`
keeps the line within the padded waveform box across typical container
widths; exact enough for a scrub indicator, not pixel-critical.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Note the verification gap**

No live browser available in this build environment (project-wide
constraint). Audio playback, `timeupdate` firing, and pointer-based seeking
all need a live-browser pass before this is considered fully verified —
typecheck passing confirms the code compiles, not that scrubbing feels
right.

- [ ] **Step 7: Commit**

```bash
git add app/routes/ideas.\$id.tsx
git commit -m "fix: idea audio — real stop/pause via a reused element, real waveform + scrub"
```

---

### Task 10: `playback.ts` rewrite — `Tone.Transport`-based `SongPlayback`

**Files:**
- Modify: `app/lib/audio/playback.ts`

This is the root-cause fix: today `playSong` schedules every chord via
`synth.triggerAttackRelease(notes, beat, Tone.now() + i*beat)` and returns
as soon as scheduling is done — no reference to the synth or any scheduled
event, so nothing can stop it and there's no way to query position.

- [ ] **Step 1: Replace the whole file**

Find (the whole current file):
```ts
import * as Tone from "tone";

// Sharps-only pitch classes, matching chords.ts's chord-label alphabet (no
// flats ever appear in a chord string here). Used to transpose a triad's
// third/fifth off the root without relying on Tone's note-name parser
// supporting inline semitone offsets — it doesn't: Tone.Frequency's `note`
// expression regexp (node_modules/tone/build/esm/core/type/Frequency.js) is
// `^([a-g]{1}(?:b|#|##|x|bb|###|#x|x#|bbb)?)(-?[0-9]+)`, i.e. pitch letter +
// optional accidental + octave only, nothing after — a string like "C3+4"
// is not valid Tone note syntax.
const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Transpose a pitch class in a given octave up by `interval` semitones,
// returning a Tone-compatible note name (e.g. transposeNote("A", 3, 3) ->
// "C4"). Handles octave rollover for intervals that cross a C boundary.
function transposeNote(pitchClass: string, octave: number, interval: number): string {
  const index = Math.max(0, PITCH_CLASSES.indexOf(pitchClass));
  const total = index + interval;
  const newIndex = ((total % 12) + 12) % 12;
  const octaveShift = Math.floor(total / 12);
  return `${PITCH_CLASSES[newIndex]}${octave + octaveShift}`;
}

// ponytail: Salamander piano samples over the network = "sampled instruments"
// with zero asset work; swap to bundled soundfont if offline demo needed.
export async function playSong(
  chordChart: { chord: string }[],
  bpm: number,
  analyser?: AnalyserNode,
) {
  await Tone.start();
  // Tone.Sampler is used directly (not wrapped in Tone.PolySynth): v15's
  // `PolySynth<Voice extends Monophonic<any>>` constraint rejects Sampler
  // (it extends Instrument, not Monophonic — confirmed via tsc, see report).
  // Sampler is already polyphonic on its own — triggerAttackRelease accepts
  // an array of notes and manages concurrent voices internally.
  const synth = new Tone.Sampler({
    urls: { C4: "C4.mp3", A4: "A4.mp3" },
    baseUrl: "https://tonejs.github.io/audio/salamander/",
  }).toDestination();
  if (analyser) synth.connect(analyser);
  // Sampler loads its urls asynchronously; scheduling notes before the
  // buffers finish loading can silently drop early notes. Tone.loaded()
  // resolves once every scheduled buffer load (including this Sampler's)
  // has finished (confirmed via node_modules/tone/build/esm/index.d.ts).
  await Tone.loaded();
  const beat = (60 / bpm) * 2;
  let t = Tone.now();
  for (const c of chordChart) {
    // chords.ts's nearestChord only ever emits a bare pitch class ("C") or
    // pitch class + "m" ("C#m") — never "maj"/"dim"/"7" — so a trailing "m"
    // unambiguously means minor (no pitch-class letter ends in "m").
    // Read the quality BEFORE stripping, then strip to isolate the root
    // (stripping leaves the root untouched, e.g. "C#m" -> "C#"). Mirrors
    // chords.ts's triad(root, minor): [0, minor ? 3 : 4, 7] and the same
    // fix applied in midi.ts's triadNotes().
    const isMinor = c.chord.endsWith("m");
    const root = c.chord.replace(/m|maj|dim|7/g, "");
    const third = isMinor ? 3 : 4;
    // Real triad (root + third + fifth) instead of a root-only octave
    // unison, kept within the existing octave 3-4 register.
    synth.triggerAttackRelease(
      [
        `${root}3`,
        transposeNote(root, 3, third),
        transposeNote(root, 3, 7),
        `${root}4`,
      ],
      beat,
      t,
    );
    t += beat;
  }
}
```

Replace with:
```ts
import * as Tone from "tone";

// Sharps-only pitch classes, matching chords.ts's chord-label alphabet (no
// flats ever appear in a chord string here). Used to transpose a triad's
// third/fifth off the root without relying on Tone's note-name parser
// supporting inline semitone offsets — it doesn't: Tone.Frequency's `note`
// expression regexp (node_modules/tone/build/esm/core/type/Frequency.js) is
// `^([a-g]{1}(?:b|#|##|x|bb|###|#x|x#|bbb)?)(-?[0-9]+)`, i.e. pitch letter +
// optional accidental + octave only, nothing after — a string like "C3+4"
// is not valid Tone note syntax.
const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Transpose a pitch class in a given octave up by `interval` semitones,
// returning a Tone-compatible note name (e.g. transposeNote("A", 3, 3) ->
// "C4"). Handles octave rollover for intervals that cross a C boundary.
function transposeNote(pitchClass: string, octave: number, interval: number): string {
  const index = Math.max(0, PITCH_CLASSES.indexOf(pitchClass));
  const total = index + interval;
  const newIndex = ((total % 12) + 12) % 12;
  const octaveShift = Math.floor(total / 12);
  return `${PITCH_CLASSES[newIndex]}${octave + octaveShift}`;
}

export interface SongPlayback {
  stop(): void;
  seek(sec: number): void;
  getPosition(): number;
  getDuration(): number;
}

// ponytail: Salamander piano samples over the network = "sampled instruments"
// with zero asset work; swap to bundled soundfont if offline demo needed.
//
// Schedules chords onto Tone.Transport via a Tone.Part instead of raw
// Tone.now()-offset one-shots — the previous version returned nothing to
// control, so there was no way to stop, seek, or query position at all.
// Transport natively tracks position and supports start/stop/seek, which is
// what makes a real progress bar and scrubbing possible.
export async function playSong(
  chordChart: { chord: string }[],
  bpm: number,
  analyser?: AnalyserNode,
): Promise<SongPlayback> {
  await Tone.start();
  // Tone.Sampler is used directly (not wrapped in Tone.PolySynth): v15's
  // `PolySynth<Voice extends Monophonic<any>>` constraint rejects Sampler
  // (it extends Instrument, not Monophonic — confirmed via tsc, see report).
  // Sampler is already polyphonic on its own — triggerAttackRelease accepts
  // an array of notes and manages concurrent voices internally.
  const synth = new Tone.Sampler({
    urls: { C4: "C4.mp3", A4: "A4.mp3" },
    baseUrl: "https://tonejs.github.io/audio/salamander/",
  }).toDestination();
  if (analyser) synth.connect(analyser);
  // Sampler loads its urls asynchronously; scheduling notes before the
  // buffers finish loading can silently drop early notes. Tone.loaded()
  // resolves once every scheduled buffer load (including this Sampler's)
  // has finished (confirmed via node_modules/tone/build/esm/index.d.ts).
  await Tone.loaded();

  const beat = (60 / bpm) * 2;
  const duration = chordChart.length * beat;

  const events: [number, { chord: string }][] = chordChart.map((c, i) => [i * beat, c]);
  const part = new Tone.Part((time, value) => {
    // chords.ts's nearestChord only ever emits a bare pitch class ("C") or
    // pitch class + "m" ("C#m") — never "maj"/"dim"/"7" — so a trailing "m"
    // unambiguously means minor (no pitch-class letter ends in "m").
    // Read the quality BEFORE stripping, then strip to isolate the root
    // (stripping leaves the root untouched, e.g. "C#m" -> "C#"). Mirrors
    // chords.ts's triad(root, minor): [0, minor ? 3 : 4, 7] and the same
    // fix applied in midi.ts's triadNotes().
    const isMinor = value.chord.endsWith("m");
    const root = value.chord.replace(/m|maj|dim|7/g, "");
    const third = isMinor ? 3 : 4;
    // Real triad (root + third + fifth) instead of a root-only octave
    // unison, kept within the existing octave 3-4 register. `time` is the
    // Part callback's own scheduled time, not Tone.now() — required for
    // sample-accurate playback under Transport.
    synth.triggerAttackRelease(
      [`${root}3`, transposeNote(root, 3, third), transposeNote(root, 3, 7), `${root}4`],
      beat,
      time,
    );
  }, events);
  part.start(0);

  Tone.Transport.stop();
  Tone.Transport.seconds = 0;
  Tone.Transport.start();

  let disposed = false;
  return {
    stop() {
      if (disposed) return;
      disposed = true;
      Tone.Transport.stop();
      part.dispose();
      synth.dispose();
    },
    seek(sec: number) {
      Tone.Transport.seconds = Math.max(0, Math.min(sec, duration));
    },
    getPosition() {
      return Tone.Transport.seconds;
    },
    getDuration() {
      return duration;
    },
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors. (Task 11 updates `songs.$id.tsx`'s call site, which
currently calls `playSong(chart, idea.bpm)` and ignores the return value —
that specific call won't yet be broken by this signature change since
returning an unused Promise is legal TS, but Task 11 is what actually wires
the new controller in.)

- [ ] **Step 3: Note the verification gap**

No live browser available in this build environment. Everything touching
real audio timing, Transport start/stop/seek, and repeated play/stop/play
cycles (confirming no leaked Parts/Samplers) needs a live-browser pass —
typecheck passing confirms the code compiles, not that it sounds right or
that stop() genuinely silences everything.

- [ ] **Step 4: Commit**

```bash
git add app/lib/audio/playback.ts
git commit -m "feat: rewrite playSong on Tone.Transport — real stop/seek/position"
```

---

### Task 11: Song Builder — wire real playback, integer BPM, scrubbable progress bar

**Files:**
- Modify: `app/routes/songs.$id.tsx`

- [ ] **Step 1: Imports and playback state**

Find:
```tsx
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getSong } from "~/lib/api/bank";
import { playSong } from "~/lib/audio/playback";
import { supabase } from "~/lib/supabase";
import { SEC_COLORS } from "~/lib/memoVisuals";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function Builder() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: song, loading } = useCachedFetch(`song:${id}`, () => getSong(id!));
  const [playing, setPlaying] = useState(false);
  const [exported, setExported] = useState(false);
  if (loading) return <Spinner />;
  if (!song || !id) return null;

  const idea = song.ideas, brief = song.vibe_briefs;
  const chart: any[] = song.chordchart_json ?? [];
  const structure = (song.structure_json ?? []).map((s: any, i: number) => ({
    label: s.label, order: s.order, color: SEC_COLORS[i % SEC_COLORS.length],
    chords: chart.filter((c) => c.section === s.label).map((c) => c.chord),
  }));
  const instrumentation: string[] = song.instrumentation_json ?? [];
  async function exportMidi() {
    if (!song.midi_path) return;
    const { data } = await supabase.storage.from("midi").createSignedUrl(song.midi_path, 3600);
    if (data) { window.open(data.signedUrl); setExported(true); }
  }
  const togglePlay = () => { if (!playing) playSong(chart, idea.bpm); setPlaying((p) => !p); };

  // Mockup's simplified "always section 2" playhead: with no real playback-position
  // tracking wired up, the source markup just hardcodes the highlighted structure
  // row / transport indicator to index 2 while playing. Kept as-is (ponytail: real
  // position tracking is a Phase-B upgrade, not this screen's job).
  const playIndex = 2;
  const transportSec = (playing ? structure[playIndex] : structure[0]) ?? structure[0];
```

Replace with:
```tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getSong } from "~/lib/api/bank";
import { playSong, type SongPlayback } from "~/lib/audio/playback";
import { supabase } from "~/lib/supabase";
import { SEC_COLORS, chordIndexToRow } from "~/lib/memoVisuals";
import { useCachedFetch } from "~/lib/useCachedFetch";
import { Spinner } from "~/components/Spinner";
import { cssText } from "~/lib/cssText";

export default function Builder() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: song, loading } = useCachedFetch(`song:${id}`, () => getSong(id!));
  const [playing, setPlaying] = useState(false);
  const [exported, setExported] = useState(false);
  const [position, setPosition] = useState(0);
  const controllerRef = useRef<SongPlayback | null>(null);
  const rafRef = useRef<number>(0);

  // Force-stop on unmount/navigation — the actual fix for "keeps playing
  // after leaving the page."
  useEffect(() => () => {
    controllerRef.current?.stop();
    cancelAnimationFrame(rafRef.current);
  }, []);

  if (loading) return <Spinner />;
  if (!song || !id) return null;

  const idea = song.ideas, brief = song.vibe_briefs;
  const chart: any[] = song.chordchart_json ?? [];
  const structure = (song.structure_json ?? []).map((s: any, i: number) => ({
    label: s.label, order: s.order, color: SEC_COLORS[i % SEC_COLORS.length],
    chords: chart.filter((c) => c.section === s.label).map((c) => c.chord),
  }));
  const instrumentation: string[] = song.instrumentation_json ?? [];
  async function exportMidi() {
    if (!song.midi_path) return;
    const { data } = await supabase.storage.from("midi").createSignedUrl(song.midi_path, 3600);
    if (data) { window.open(data.signedUrl); setExported(true); }
  }

  const beat = (60 / idea.bpm) * 2;
  const duration = chart.length * beat;
  const chordCountsByRow = structure.map((s: any) => s.chords.length);

  function trackPosition() {
    const controller = controllerRef.current;
    if (!controller) return;
    setPosition(controller.getPosition());
    rafRef.current = requestAnimationFrame(trackPosition);
  }

  async function togglePlay() {
    if (playing) {
      controllerRef.current?.stop();
      controllerRef.current = null;
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
      return;
    }
    controllerRef.current = await playSong(chart, idea.bpm);
    setPlaying(true);
    rafRef.current = requestAnimationFrame(trackPosition);
  }

  function seek(fraction: number) {
    if (!controllerRef.current || !duration) return;
    const sec = Math.max(0, Math.min(1, fraction)) * duration;
    controllerRef.current.seek(sec);
    setPosition(sec);
  }

  const currentChordIndex = Math.min(chart.length - 1, Math.floor(position / beat));
  const playRow = chart.length > 0 ? chordIndexToRow(chordCountsByRow, currentChordIndex) : 0;
  const transportSec = (playing ? structure[playRow] : structure[0]) ?? structure[0];
  const progressPct = duration > 0 ? Math.min(100, Math.round((position / duration) * 100)) : 0;
  const positionLabel = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
```

- [ ] **Step 2: Round the BPM display**

Find:
```tsx
        <span style={cssText("font-size:11px;font-weight:800;letter-spacing:.02em;color:#2E2418;background:#F4EDDB;border:1px solid rgba(46,36,24,.14);border-radius:8px;padding:5px 10px;font-family:'Space Mono',monospace;white-space:nowrap;")}>{idea.bpm} BPM</span>
```

Replace with:
```tsx
        <span style={cssText("font-size:11px;font-weight:800;letter-spacing:.02em;color:#2E2418;background:#F4EDDB;border:1px solid rgba(46,36,24,.14);border-radius:8px;padding:5px 10px;font-family:'Space Mono',monospace;white-space:nowrap;")}>{Math.round(idea.bpm)} BPM</span>
```

- [ ] **Step 3: Structure row highlighting — use `playRow` instead of the hardcoded `playIndex`**

Find:
```tsx
        {structure.map((sec: any, i: number) => (
          <div
            key={i}
            style={cssText(`display:flex;align-items:center;gap:10px;padding:12px 14px;${i < structure.length - 1 ? "border-bottom:1px solid rgba(46,36,24,.08);" : ""}${playing && i === playIndex ? "background:rgba(181,80,60,.08);" : ""}`)}
          >
            <div style={cssText(`width:9px;height:9px;border-radius:3px;background:${sec.color};flex:none;`)}></div>
            <div style={cssText("width:74px;flex:none;font-size:13px;font-weight:800;color:#2E2418;text-transform:capitalize;")}>{sec.label}</div>
            <div style={cssText("flex:1;display:flex;flex-wrap:wrap;gap:5px;")}>
              {sec.chords.map((ch: string, j: number) => (
                <span key={j} style={cssText("font-size:12px;font-weight:700;color:#2E2418;background:rgba(46,36,24,.07);border-radius:6px;padding:3px 8px;font-family:'Space Mono',monospace;")}>{ch}</span>
              ))}
            </div>
            {playing && i === playIndex && (
              <span style={cssText("font-size:10px;font-weight:700;color:#B5503C;flex:none;")}>▶</span>
            )}
          </div>
        ))}
```

Replace with:
```tsx
        {structure.map((sec: any, i: number) => (
          <div
            key={i}
            style={cssText(`display:flex;align-items:center;gap:10px;padding:12px 14px;${i < structure.length - 1 ? "border-bottom:1px solid rgba(46,36,24,.08);" : ""}${playing && i === playRow ? "background:rgba(181,80,60,.08);" : ""}`)}
          >
            <div style={cssText(`width:9px;height:9px;border-radius:3px;background:${sec.color};flex:none;`)}></div>
            <div style={cssText("width:74px;flex:none;font-size:13px;font-weight:800;color:#2E2418;text-transform:capitalize;")}>{sec.label}</div>
            <div style={cssText("flex:1;display:flex;flex-wrap:wrap;gap:5px;")}>
              {sec.chords.map((ch: string, j: number) => (
                <span key={j} style={cssText("font-size:12px;font-weight:700;color:#2E2418;background:rgba(46,36,24,.07);border-radius:6px;padding:3px 8px;font-family:'Space Mono',monospace;")}>{ch}</span>
              ))}
            </div>
            {playing && i === playRow && (
              <span style={cssText("font-size:10px;font-weight:700;color:#B5503C;flex:none;")}>▶</span>
            )}
          </div>
        ))}
```

- [ ] **Step 4: Real, scrubbable progress bar**

Find:
```tsx
      <div style={cssText("position:fixed;bottom:80px;left:0;right:0;z-index:40;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.07);padding:14px 20px;display:flex;align-items:center;gap:14px;")}>
        <button onClick={togglePlay} style={cssText("width:46px;height:46px;border-radius:50%;border:none;background:#17161B;color:#fff;cursor:pointer;font-size:16px;flex:none;")}>{playing ? "❚❚" : "▶"}</button>
        <div style={cssText("flex:1;")}>
          <div style={cssText("font-size:12px;font-weight:700;color:#17161B;text-transform:capitalize;")}>{transportSec?.label ?? ""}</div>
          <div style={cssText("height:5px;border-radius:3px;background:rgba(0,0,0,.08);margin-top:6px;overflow:hidden;")}>
            <div style={cssText(`height:100%;width:${playing ? Math.round(((playIndex + 1) / Math.max(structure.length, 1)) * 100) : 0}%;background:#B5503C;`)}></div>
          </div>
        </div>
        <span style={cssText("font-family:'Space Mono',monospace;font-size:12px;color:#8a8791;")}>0:00</span>
      </div>
    </div>
  );
}
```

Replace with:
```tsx
      <div style={cssText("position:fixed;bottom:80px;left:0;right:0;z-index:40;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.07);padding:14px 20px;display:flex;align-items:center;gap:14px;")}>
        <button onClick={togglePlay} style={cssText("width:46px;height:46px;border-radius:50%;border:none;background:#17161B;color:#fff;cursor:pointer;font-size:16px;flex:none;")}>{playing ? "❚❚" : "▶"}</button>
        <div style={cssText("flex:1;")}>
          <div style={cssText("font-size:12px;font-weight:700;color:#17161B;text-transform:capitalize;")}>{transportSec?.label ?? ""}</div>
          <div
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              seek((e.clientX - rect.left) / rect.width);
            }}
            style={cssText("height:5px;border-radius:3px;background:rgba(0,0,0,.08);margin-top:6px;overflow:hidden;cursor:pointer;")}
          >
            <div style={cssText(`height:100%;width:${progressPct}%;background:#B5503C;`)}></div>
          </div>
        </div>
        <span style={cssText("font-family:'Space Mono',monospace;font-size:12px;color:#8a8791;")}>{positionLabel(position)} / {positionLabel(duration)}</span>
      </div>
    </div>
  );
}
```

(`position:fixed;bottom:80px` already sits just above the fixed 80px tab
bar — no repositioning needed, this was already correctly placed, just
unwired.)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Note the verification gap**

No live browser available in this build environment. The whole play →
watch structure highlight advance → scrub → stop → leave-the-page-and-
confirm-silence loop needs a live-browser pass before this is considered
fully verified.

- [ ] **Step 7: Commit**

```bash
git add app/routes/songs.\$id.tsx
git commit -m "feat: Song Builder — real position-tracked, scrubbable, stoppable playback"
```

---

## Self-Review

**Spec coverage:**
1. Recent-3 + scoped scrolling → Task 5. ✓
2. Anti-flash cache → Tasks 2–4. ✓
3. Back-button removal → Task 6. ✓
4. Built-in stages removal → Task 6. ✓
5. Playback lifecycle fix (idea + song) → Tasks 9, 10, 11. ✓
6. Real waveform + scrub → Tasks 7, 8, 9. ✓
7. Real transport playback (BPM integer, section-synced bar, scrub, sticky
   position, stop-on-unmount) → Tasks 10, 11. ✓

**Placeholder scan:** none — every step shows complete, real code; no
"TBD"/"add error handling"/"similar to above."

**Type consistency:** `SongPlayback` (Task 10) used identically in Task 11
(`SongPlayback` import, `.stop()`/`.seek()`/`.getPosition()`/`.getDuration()`
all called with matching names). `bucketPeaks`/`realWavePath`/
`chordIndexToRow` (Task 7) signatures match their call sites in Tasks 8, 9,
11 exactly. `useCachedFetch<T>` return shape (`{data, loading}`) used
consistently across Tasks 3–4.

**Ordering:** each task's "Find" blocks assume every prior task in this
document has already been applied in order — Tasks 3–6 all touch
`ideas.tsx`/`ideas.$id.tsx`/`songs.$id.tsx` sequentially, and later tasks'
"Find" snippets reflect the file state *after* earlier tasks, not the
original pre-plan state.
