# Real reference-song discovery — Design

## Purpose

Two screens both do a weak version of the same job — find a real, playable
reference track for an idea:

- Record's "Sounds like" matches against `vibe_briefs` (the user's own
  previously-analyzed tracks — a small, arbitrary pool) plus a raw iTunes
  text search on the idea's single mood-tag word ("warm", "upbeat"), which
  returns whatever iTunes' catalog search happens to associate with that
  word — not a real similarity match.
- Chooser's Side B only shows already-cached `vibe_briefs` ("recents
  first") — there's no way to find a NEW reference track without going to
  the separate `/brief` screen first.

This spec replaces both with one shared iTunes-search-and-preview
foundation, and upgrades Record's matching quality with a Gemini-suggested
song list (the same "spend a small LLM budget for real judgment" pattern
`/arrange` already uses) instead of a bag-of-words text search.

## Scope

**In scope:**
1. `usePreviewPlayer()` — shared snippet-playback hook.
2. `suggest-similar` Gemini edge function + client wrapper.
3. Record: real Gemini-suggested + iTunes-resolved "sounds like", playable,
   saved to the idea (`ideas.sounds_like_json`) for Idea Detail to redisplay.
4. Chooser Side B: iTunes search (search-then-pick, not live-as-you-type,
   matching Brief screen's existing pattern), playable results, pick →
   analyze → becomes the selected brief. Recents list stays, hidden while
   searching (mirrors Ideas' existing Recent-hides-while-searching pattern).
5. Chooser build-button bug fix: `busy` and `not-ready` currently collapse
   into the same visual/label state, misleadingly telling the user to
   "pick one of each" mid-build when they already did.

**Out of scope:** analyzing every search result eagerly (confirmed:
analyze-on-pick only); a dedicated full-screen "Arranging your song…"
transition (confirmed: in-place button state is enough — matches this
app's existing minimal-chrome convention, no new screen/route needed);
removing `vibe_briefs`-based Chooser recents (still useful, just hidden
while actively searching).

## 1. Shared: `usePreviewPlayer()`

New file `app/lib/usePreviewPlayer.ts`:

```ts
import { useEffect, useRef, useState } from "react";

// One shared <audio> element per hook instance — reused across every
// preview in the list it's driving (not one Audio object per row), same
// "reuse one element, don't create-and-abandon a new one per click"
// principle as ideas.$id.tsx's own playback fix. Switching to a different
// url mid-playback just changes .src; tapping the SAME url again toggles
// pause/resume instead of restarting.
export function usePreviewPlayer() {
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(undefined);

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  function toggle(url: string) {
    if (!audioRef.current) {
      const el = new Audio();
      el.addEventListener("ended", () => setPlayingUrl(null));
      audioRef.current = el;
    }
    const el = audioRef.current;
    if (playingUrl === url) {
      el.pause();
      setPlayingUrl(null);
      return;
    }
    if (el.src !== url) el.src = url;
    el.currentTime = 0;
    el.play();
    setPlayingUrl(url);
  }

  return { playingUrl, toggle };
}
```

iTunes preview URLs (`audio-ssl.itunes.apple.com`) play directly via a
plain `<audio>`/`Audio()` element cross-origin — no CORS issue for
*playback* (CORS only blocks reading/decoding audio *data*, e.g.
`fetch`+`decodeAudioData`, which is why `track-search`'s `?preview=` proxy
exists — that's for `brief.tsx`'s analysis path, not for simple playback,
and this hook doesn't need it).

## 2. `suggest-similar` Gemini edge function

New file `supabase/functions/suggest-similar/index.ts`, mirroring
`supabase/functions/arrange/index.ts`'s structure exactly (same Interactions
API call shape, same `extractOutputText` helper, same schema-enforced JSON
output, same 15s abort timeout, same error-shape). JWT-verified (spends the
project's `GEMINI_API_KEY` budget per call, same reasoning as `/arrange`).

```ts
// POST { key, bpm, mood, inputType } → { suggestions: {title, artist}[] }
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, artist: { type: "string" } },
        required: ["title", "artist"],
      },
    },
  },
  required: ["suggestions"],
};
```

Prompt: system instruction establishes the task ("suggest real, existing
songs — never invent a title — that share the musical character described");
user message gives key/bpm/mood/inputType and asks for 5 suggestions.
Suggestions are NOT trusted to exist — see step 3's resolve-and-drop step,
which is the actual defense against a hallucinated title, not the prompt
wording alone.

New client file `app/lib/api/suggestSimilar.ts`, mirroring `arrange.ts`:

```ts
import { supabase } from "~/lib/supabase";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-similar`;

export async function suggestSimilar(
  args: { key: string; bpm: number; mood: string; inputType: string },
): Promise<{ title: string; artist: string }[]> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`suggest-similar failed: ${r.status}`);
  const { suggestions } = await r.json();
  return suggestions ?? [];
}
```

## 3. Record — real "sounds like"

**Data model** — new migration `supabase/migrations/0007_add_idea_sounds_like.sql`:

```sql
alter table ideas add column sounds_like_json jsonb;
```

No RLS change (`ideas_owner` already covers all columns).

**`app/lib/memoVisuals.ts`:** remove `soundsLike`, `keySimilarity`,
`bpmSimilarity`, and the `SoundsLikeMatch` interface — all become dead code
once `record.tsx` stops calling `soundsLike()` (verify no other caller
exists before deleting — a plan-execution step, not assumed here).

**`app/routes/record.tsx`:** replace the `similar` (vibe_briefs-matched)
and `fresh` (mood-tag iTunes search) computations and their `useEffect`
with one: once `analysis` is available, call `suggestSimilar({key:
analysis.detectedKey, bpm: analysis.bpm, mood: analysis.moodTag, inputType:
analysis.inputType})`, then `Promise.all` a `searchTracks(\`${title}
${artist}\`)` for each suggestion, take each result's first hit, drop
suggestions with no hit. Render via `usePreviewPlayer()` instead of the
mockup's non-functional `similar`/`fresh` list markup — tapping a row plays
its snippet.

On `save()`, thread the resolved list through to `saveIdea` (which already
accepts the full analysis object plus extras) so it lands in
`ideas.sounds_like_json` — only `{title, artist, artworkUrl, previewUrl}`
per entry (previewUrl is a stable iTunes CDN URL, not a Supabase signed URL,
so it doesn't expire the way `raw-audio`'s signed URLs do — safe to persist
long-term).

**`app/routes/ideas.$id.tsx`:** new "Sounds like" section (below the
existing "Songs from this idea" block), reading `row.sounds_like_json`,
rendered the same way as Record's list (shared `usePreviewPlayer()`
instance). Hidden entirely if the array is empty/null (ideas saved before
this shipped won't have it).

## 4. Chooser Side B — search

**`app/routes/songs.new.tsx`:**

- New state: `briefQuery`, `briefResults: Track[]`, `briefSearching: boolean`
  (mirrors `brief.tsx`'s own state shape) plus `usePreviewPlayer()`.
- Search bar (visually matching Ideas'/Brief's existing search-input
  style) above the Side B heading; a search icon button click (not
  live-as-you-type, matching `brief.tsx`'s existing click-to-search
  pattern) calls `searchTracks(briefQuery)`.
- While `briefQuery` is non-empty, render `briefResults` instead of the
  cached `briefs` list (same hide-while-searching pattern as Ideas' Recent
  section) — each result: artwork, title, artist, a snippet play button
  (`usePreviewPlayer().toggle(previewUrl)`), and a "select" action.
- Selecting a search result: per-row `analyzing` state, runs
  `analyzeReference(blob, ...)` (fetched via the existing
  `fetchPreviewBlob`, same as `brief.tsx`'s `pick()`) → `saveBrief(...)`
  (already deduped by track+source from the earlier session's fix) → sets
  `briefId` to the new row's id and lets it fall through to the normal
  `briefs` list rendering (which already shows key/bpm once
  `listBriefs()` picks it up — cache-invalidation-free since `saveBrief`
  returning a fresh row plus a manual `setBriefs` prepend keeps the UI
  in sync without waiting for a refetch).

## 5. Build-button state fix

**`app/routes/songs.new.tsx`:** replace the single collapsed `ready`
boolean-driven label with three explicit states:

```tsx
const picked = !!ideaId && !!briefId;
const ready = picked && !busy;
```

Button label/content: `busy` → spinner + "Building…"; `!picked` → "Pick one
of each to build"; `ready` → "Build song →". `disabled={!ready}` unchanged
(busy already correctly disables it — the bug was purely the label/visual
falsely implying the selection was lost, not the disabled-state logic
itself, which was already correct).

## Error handling

Matches this codebase's established minimal style. `suggest-similar`
failures (Gemini down, rate-limited, bad key) are caught client-side and
the "sounds like" section simply renders empty/omitted — same
fail-quiet-not-fail-loud treatment `soundsLike()`'s old vibe_briefs
matching already had (never surfaced an error state), not a new pattern.
iTunes resolution misses (a Gemini-suggested title iTunes can't find) are
silently dropped, not shown as partial/error rows.

## Testing / verification

No live browser available in this build environment (project-wide
constraint). `npm run typecheck` + `npm run build` must pass with zero
errors. Real Gemini output quality, iTunes resolution hit-rate, and actual
snippet playback all need a live-browser + live-Gemini-key pass before
being considered fully verified — noting that gap explicitly.

## Self-review

- No placeholders/TBDs.
- Internal consistency: `usePreviewPlayer` is used identically by both
  consuming screens (section 3 and section 4 both just call
  `.toggle(previewUrl)`); `suggest-similar`'s request/response shape is
  used identically by its one caller.
- Scope: one cohesive theme (real, playable reference-track discovery)
  spanning two screens that already shared conceptual overlap — not
  decomposed further, since the shared hook/edge-function only make sense
  designed together.
- Ambiguity: "just save the title or something" resolved explicitly to
  `{title, artist, artworkUrl, previewUrl}` (enough to redisplay
  playably without a re-search), not literally title-only.
