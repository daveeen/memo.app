# Real Reference-Song Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `docs/superpowers/specs/2026-07-22-reference-song-discovery-design.md` — replace Record's fake "sounds like" (vibe_briefs cache + mood-word text search) with Gemini-suggested, iTunes-resolved, playable, saved-to-idea results; add a real search-and-preview flow to Chooser's Side B; fix Chooser's build-button state bug.

**Architecture:** One shared `usePreviewPlayer()` hook drives snippet playback on both screens. A new `suggest-similar` Gemini edge function (same Interactions-API pattern as the existing `/arrange`) proposes real song/artist names; the client resolves each through the *existing* `searchTracks()` iTunes client, dropping anything iTunes can't find — Gemini supplies musical judgment, iTunes supplies ground truth.

**Tech Stack:** React Router 7, Supabase Edge Functions (Deno), Gemini Interactions API, existing `~/lib/api/tracks.ts` iTunes client, `cssText()` inline-style convention. No test framework — verification is `npm run typecheck` + `npm run build`.

---

## File Structure

**New:**
- `supabase/migrations/0007_add_idea_sounds_like.sql` — `ideas.sounds_like_json jsonb`
- `app/lib/usePreviewPlayer.ts` — shared snippet-playback hook
- `supabase/functions/suggest-similar/index.ts` — Gemini edge function
- `app/lib/api/suggestSimilar.ts` — client wrapper

**Modified:**
- `app/lib/types.ts` — new `SoundsLikeEntry` type
- `app/lib/api/bank.ts` — `saveIdea` gains a `soundsLike` param
- `app/routes/record.tsx` — real sounds-like wiring, drop the old fake matching
- `app/lib/memoVisuals.ts` — remove `soundsLike`/`keySimilarity`/`bpmSimilarity`/`SoundsLikeMatch` (dead once record.tsx stops calling them)
- `app/routes/ideas.$id.tsx` — "Sounds like" display section
- `app/routes/songs.new.tsx` — Side B search + build-button state fix

---

### Task 1: Migration + shared type

**Files:**
- Create: `supabase/migrations/0007_add_idea_sounds_like.sql`
- Modify: `app/lib/types.ts`

- [ ] **Step 1: Write the migration**

```sql
alter table ideas add column sounds_like_json jsonb;
```

- [ ] **Step 2: Add the shared type**

Find (in `app/lib/types.ts`):
```ts
export interface BankEntry extends CaptureAnalysis { createdAt: string; title: string; }
```

Replace with:
```ts
export interface SoundsLikeEntry { title: string; artist: string; artworkUrl: string; previewUrl: string; }
export interface BankEntry extends CaptureAnalysis { createdAt: string; title: string; }
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_add_idea_sounds_like.sql app/lib/types.ts
git commit -m "feat(db): add ideas.sounds_like_json + SoundsLikeEntry type"
```

Not applied to the live database by this task — `npx supabase db push` is a manual step.

---

### Task 2: `usePreviewPlayer()` hook

**Files:**
- Create: `app/lib/usePreviewPlayer.ts`

- [ ] **Step 1: Write the hook**

```ts
// app/lib/usePreviewPlayer.ts
import { useEffect, useRef, useState } from "react";

// One shared <audio> element per hook instance, reused across every preview
// url it's given — not a fresh Audio object per click (same "reuse one
// element" principle as ideas.$id.tsx's idea-audio playback fix). Tapping a
// different url mid-playback switches .src; tapping the SAME url again
// toggles pause/resume instead of restarting from 0.
//
// iTunes preview urls (audio-ssl.itunes.apple.com) play directly via a plain
// <audio> element cross-origin — CORS only blocks reading/decoding audio
// DATA (fetch + decodeAudioData), not playback, so no proxy is needed here
// (unlike track-search's ?preview= route, which exists for the analysis
// path in brief.tsx, a different use case).
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

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add app/lib/usePreviewPlayer.ts
git commit -m "feat: add shared snippet-preview playback hook"
```

---

### Task 3: `suggest-similar` Gemini edge function + client

**Files:**
- Create: `supabase/functions/suggest-similar/index.ts`
- Create: `app/lib/api/suggestSimilar.ts`

- [ ] **Step 1: Write the edge function**

Mirrors `supabase/functions/arrange/index.ts` exactly (same Interactions API
call shape, same `extractOutputText` helper, same schema-enforced JSON
output, same 15s abort timeout, same error-response shape) — read that file
first for the pattern, then write:

```ts
// supabase/functions/suggest-similar/index.ts
// POST { key, bpm, mood, inputType } → { suggestions: {title, artist}[] }
// Deployed WITH Supabase JWT verification on, same reasoning as arrange:
// it spends the project's GEMINI_API_KEY budget per call.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

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

// The Interactions API returns a chronological `steps` array (model
// thoughts, tool calls, text blocks, ...), not a single flat text field —
// this mirrors arrange/index.ts's extractOutputText without needing the
// @google/genai SDK for one request.
function extractOutputText(data: any): string {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  let text: string | undefined;
  for (const step of steps) {
    const blocks = Array.isArray(step?.content) ? step.content : [];
    for (const block of blocks) {
      if (block?.type === "text" && typeof block.text === "string") text = block.text;
    }
  }
  if (text === undefined) throw new Error("no text content in interaction response");
  return text;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  const { key, bpm, mood, inputType } = body ?? {};

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const sys = "You suggest real, existing, released songs that share the musical " +
    "character described. Never invent a title or artist — only suggest songs you " +
    "are confident actually exist and were commercially released.";
  const user = `Key: ${key}\nTempo: ${bpm} BPM\nMood: ${mood}\nSource type: ${inputType}\n` +
    `Suggest 5 real songs (title + artist) that share this musical character.`;

  let parsed: any;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let r: Response;
    try {
      r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-lite",
          system_instruction: sys,
          input: user,
          store: false,
          response_format: { type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
    const j = await r.json();
    parsed = JSON.parse(extractOutputText(j));
  } catch (err) {
    return new Response(JSON.stringify({ error: "suggestion generation failed", detail: String(err) }), {
      status: 502,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(parsed), { headers: { ...cors, "content-type": "application/json" } });
});
```

- [ ] **Step 2: Write the client wrapper**

```ts
// app/lib/api/suggestSimilar.ts
import { supabase } from "~/lib/supabase";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-similar`;

export async function suggestSimilar(
  args: { key: string; bpm: number; mood: string; inputType: string },
): Promise<{ title: string; artist: string }[]> {
  // JWT-verified function (spends GEMINI_API_KEY budget) — same reasoning
  // and same header pattern as arrange.ts.
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

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors. (The edge function itself is Deno code, excluded
from the app's `tsc` pass per `tsconfig.json`'s `supabase/functions/**`
exclusion — only the client wrapper is checked here.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/suggest-similar/index.ts app/lib/api/suggestSimilar.ts
git commit -m "feat: add suggest-similar Gemini edge function + client"
```

Not deployed by this task — `npx supabase functions deploy suggest-similar`
(keep JWT verify ON, same as `arrange`) is a manual step, same as every
other edge function in this project.

---

### Task 4: `bank.ts` — thread `soundsLike` through `saveIdea`

**Files:**
- Modify: `app/lib/api/bank.ts`

- [ ] **Step 1: Update `saveIdea`**

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
    waveform_json: a.waveformPeaks,
  }).select().single();
  if (error) throw error;
  return data;
}
```

Replace with:
```ts
export async function saveIdea(
  blob: Blob,
  a: Omit<CaptureAnalysis, "id" | "cleanedAudioPath">,
  title: string,
  soundsLike: SoundsLikeEntry[] = [],
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const path = `${user.id}/${crypto.randomUUID()}.webm`;
  const { error: uploadError } = await supabase.storage.from("raw-audio").upload(path, blob);
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("ideas").insert({
    title, raw_path: path, duration: a.durationSec, key: a.detectedKey,
    bpm: a.bpm, notes_json: a.notes, input_type: a.inputType, mood: a.moodTag,
    waveform_json: a.waveformPeaks, sounds_like_json: soundsLike,
  }).select().single();
  if (error) throw error;
  return data;
}
```

(`soundsLike` defaults to `[]` so any other caller — there isn't one today,
but this keeps the signature backward-compatible — doesn't break.)

- [ ] **Step 2: Add the type import**

Find:
```ts
import type { CaptureAnalysis, BankEntry, VibeBrief } from "~/lib/types";
```

Replace with:
```ts
import type { CaptureAnalysis, BankEntry, VibeBrief, SoundsLikeEntry } from "~/lib/types";
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/api/bank.ts
git commit -m "feat: saveIdea persists the resolved sounds-like list"
```

---

### Task 5: Record — wire real sounds-like, remove the old fake matching

**Files:**
- Modify: `app/routes/record.tsx`
- Modify: `app/lib/memoVisuals.ts`

- [ ] **Step 1: `record.tsx` — imports**

Find:
```tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { analyzeCapture } from "~/lib/audio/analyze";
import { saveIdea, listBriefs } from "~/lib/api/bank";
import { searchTracks } from "~/lib/api/tracks";
import { soundsLike } from "~/lib/memoVisuals";
import { cssText } from "~/lib/cssText";
import type { CaptureAnalysis } from "~/lib/types";
```

Replace with:
```tsx
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { analyzeCapture } from "~/lib/audio/analyze";
import { saveIdea } from "~/lib/api/bank";
import { searchTracks } from "~/lib/api/tracks";
import { suggestSimilar } from "~/lib/api/suggestSimilar";
import { usePreviewPlayer } from "~/lib/usePreviewPlayer";
import { cssText } from "~/lib/cssText";
import type { CaptureAnalysis, SoundsLikeEntry } from "~/lib/types";
```

- [ ] **Step 2: Remove the old cached-briefs/mood-search state, add the new sounds-like state**

Find:
```tsx
export default function Record() {
  const nav = useNavigate();
  const [briefs, setBriefs] = useState<any[]>([]);
  useEffect(() => { listBriefs().then(setBriefs); }, []);
  const [itunesHits, setItunesHits] = useState<{ trackName: string; artist: string; artworkUrl: string }[]>([]);
  const rec = useRef<MediaRecorder>(undefined);
```

Replace with:
```tsx
export default function Record() {
  const nav = useNavigate();
  const [soundsLike, setSoundsLike] = useState<SoundsLikeEntry[]>([]);
  const { playingUrl: previewPlayingUrl, toggle: togglePreview } = usePreviewPlayer();
  const rec = useRef<MediaRecorder>(undefined);
```

- [ ] **Step 3: Replace the mood-tag search effect + fake matching computation**

Find:
```tsx
  const moodTag = analysis?.moodTag;
  useEffect(() => {
    if (!moodTag) return;
    searchTracks(moodTag).then(setItunesHits).catch(() => setItunesHits([]));
  }, [moodTag]);

  const similar = analysis ? soundsLike({ key: analysis.detectedKey, bpm: analysis.bpm }, briefs) : [];
  // Real iTunes search (by mood — the only real signal we have to search text
  // with, since iTunes has no audio-feature endpoint) minus anything already
  // represented above via a cached vibe_brief — no showing the same track twice.
  const cachedTitles = new Set(briefs.map((b) => (b.source_track_name || "").trim().toLowerCase()));
  const seenFresh = new Set<string>();
  const fresh = itunesHits.filter((t) => {
    const key = t.trackName.trim().toLowerCase();
    if (!key || cachedTitles.has(key) || seenFresh.has(key)) return false;
    seenFresh.add(key);
    return true;
  }).slice(0, 4);
```

Replace with:
```tsx
  // Real "sounds like": Gemini suggests actual song/artist names for this
  // capture's key/bpm/mood/type, each gets resolved to a real iTunes hit
  // (artwork + playable preview) via the existing searchTracks() client —
  // any suggestion iTunes can't find is silently dropped rather than shown
  // as a broken/unplayable row. Replaces the old vibe_briefs-cache matching
  // and mood-word iTunes text search, both removed.
  useEffect(() => {
    if (!analysis) return;
    let cancelled = false;
    suggestSimilar({
      key: analysis.detectedKey, bpm: analysis.bpm,
      mood: analysis.moodTag, inputType: analysis.inputType,
    })
      .then(async (suggestions) => {
        const resolved = await Promise.all(suggestions.map(async (s) => {
          const hits = await searchTracks(`${s.title} ${s.artist}`).catch(() => []);
          const hit = hits[0];
          return hit ? { title: hit.trackName, artist: hit.artist, artworkUrl: hit.artworkUrl, previewUrl: hit.previewUrl } : null;
        }));
        if (!cancelled) setSoundsLike(resolved.filter((r): r is SoundsLikeEntry => r !== null));
      })
      .catch(() => { if (!cancelled) setSoundsLike([]); });
    return () => { cancelled = true; };
  }, [analysis]);
```

- [ ] **Step 4: Thread `soundsLike` through `save()`**

Find:
```tsx
  async function save() {
    if (!blobRef.current || !analysis) return;
    await saveIdea(blobRef.current, analysis, pendingTitle);
    nav("/ideas");
  }
```

Replace with:
```tsx
  async function save() {
    if (!blobRef.current || !analysis) return;
    await saveIdea(blobRef.current, analysis, pendingTitle, soundsLike);
    nav("/ideas");
  }
```

- [ ] **Step 5: Replace the "sounds like" render block**

Find:
```tsx
          {/* sounds like — real key+BPM match against the user's own analyzed
              reference tracks (vibe_briefs) first, then real iTunes search hits
              on the mood tag (no fake % — we have no audio-feature score for
              those), skipping anything already shown as a cached match */}
          {(similar.length > 0 || fresh.length > 0) && (
            <>
              <div style={cssText("margin-top:22px;display:flex;align-items:baseline;justify-content:space-between;")}>
                <div style={cssText("font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a7d68;")}>Sounds like</div>
                <div style={cssText("font-size:11.5px;font-weight:600;color:#a89a82;")}>matched on key · tempo</div>
              </div>
              <div style={cssText("margin-top:12px;display:flex;flex-direction:column;gap:9px;")}>
                {similar.map((v) => (
                  <div key={`c-${v.id}`} style={cssText("display:flex;align-items:center;gap:12px;padding:8px;border-radius:12px;background:#F7F1E3;border:1px solid rgba(46,36,24,.1);")}>
                    <div style={cssText(`width:44px;height:44px;border-radius:9px;flex:none;background:${v.art};box-shadow:0 3px 7px rgba(46,36,24,.18);`)}></div>
                    <div style={cssText("flex:1;min-width:0;")}>
                      <div style={cssText("font-size:14px;font-weight:700;color:#2E2418;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{v.title}</div>
                    </div>
                    <span style={cssText("font-size:11px;font-weight:700;color:#0b8a3d;font-family:'Space Mono',monospace;white-space:nowrap;")}>{v.matchPct}</span>
                  </div>
                ))}
                {fresh.map((t, i) => (
                  <div key={`f-${i}`} style={cssText("display:flex;align-items:center;gap:12px;padding:8px;border-radius:12px;background:#F7F1E3;border:1px solid rgba(46,36,24,.1);")}>
                    <div style={cssText(`width:44px;height:44px;border-radius:9px;flex:none;background-color:#e3d8c4;background-image:url(${t.artworkUrl});background-size:cover;background-position:center;box-shadow:0 3px 7px rgba(46,36,24,.18);`)}></div>
                    <div style={cssText("flex:1;min-width:0;")}>
                      <div style={cssText("font-size:14px;font-weight:700;color:#2E2418;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.trackName}</div>
                      <div style={cssText("font-size:11.5px;color:#8a7d68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.artist}</div>
                    </div>
                    <span style={cssText("font-size:9.5px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#8a7d68;white-space:nowrap;")}>iTunes</span>
                  </div>
                ))}
              </div>
            </>
          )}
```

Replace with:
```tsx
          {/* sounds like — Gemini-suggested, iTunes-resolved, playable */}
          {soundsLike.length > 0 && (
            <>
              <div style={cssText("margin-top:22px;display:flex;align-items:baseline;justify-content:space-between;")}>
                <div style={cssText("font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#8a7d68;")}>Sounds like</div>
                <div style={cssText("font-size:11.5px;font-weight:600;color:#a89a82;")}>tap to preview</div>
              </div>
              <div style={cssText("margin-top:12px;display:flex;flex-direction:column;gap:9px;")}>
                {soundsLike.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => togglePreview(t.previewUrl)}
                    style={cssText("display:flex;align-items:center;gap:12px;padding:8px;border-radius:12px;background:#F7F1E3;border:1px solid rgba(46,36,24,.1);cursor:pointer;text-align:left;width:100%;")}
                  >
                    <div style={cssText(`width:44px;height:44px;border-radius:9px;flex:none;background-color:#e3d8c4;background-image:url(${t.artworkUrl});background-size:cover;background-position:center;box-shadow:0 3px 7px rgba(46,36,24,.18);`)}></div>
                    <div style={cssText("flex:1;min-width:0;")}>
                      <div style={cssText("font-size:14px;font-weight:700;color:#2E2418;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.title}</div>
                      <div style={cssText("font-size:11.5px;color:#8a7d68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.artist}</div>
                    </div>
                    <span style={cssText("font-size:16px;color:#B5503C;flex:none;")}>{previewPlayingUrl === t.previewUrl ? "❚❚" : "▶"}</span>
                  </button>
                ))}
              </div>
            </>
          )}
```

- [ ] **Step 6: `memoVisuals.ts` — remove the now-dead exports**

First confirm nothing else calls them:

Run: `grep -rn "soundsLike\|keySimilarity\|bpmSimilarity\|SoundsLikeMatch" app --include=*.tsx --include=*.ts`
Expected: only their own definitions in `memoVisuals.ts` (no other caller — Step 1-3 above removed record.tsx's only usage).

Find (in `app/lib/memoVisuals.ts`):
```ts
// Real "sounds like" matching — scores an idea's key+BPM against a reference
// track's key+BPM (both real analysis output, not fixtures). There is no
// external song-similarity/audio-features API wired into this app (Spotify's
// audio-features endpoint is now access-restricted; no other catalog exists
// here), so matches are only ever drawn from tracks the user has themselves
// analyzed via the Brief screen (`vibe_briefs`) — real numbers, honestly
// small pool, never a fabricated "94% match" against a song we know nothing about.
function keySimilarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const [rootA, modeA] = a.split(' ');
  const [rootB, modeB] = b.split(' ');
  if (rootA === rootB && modeA === modeB) return 1;
  if (rootA === rootB) return 0.7; // same root, different mode (relative major/minor still feels close)
  return 0.2;
}
function bpmSimilarity(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null || b == null) return 0;
  return Math.max(0, 1 - Math.abs(a - b) / 40); // linear falloff, ~0 past a 40bpm gap
}

export interface SoundsLikeMatch { id: string; title: string; matchPct: string; art: string }

// `refs` are raw vibe_briefs rows (need `id`, `source_track_name`, `shared_key`, `shared_bpm`).
export function soundsLike(
  idea: { key?: string | null; bpm?: number | null },
  refs: { id: string; source_track_name: string; shared_key?: string | null; shared_bpm?: number | null }[],
  limit = 4,
): SoundsLikeMatch[] {
  return refs
    .map((r, idx) => ({
      id: r.id,
      title: r.source_track_name,
      score: keySimilarity(idea.key, r.shared_key) * 0.5 + bpmSimilarity(idea.bpm, r.shared_bpm) * 0.5,
      art: PAL[idx % PAL.length].shell,
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((m) => ({ id: m.id, title: m.title, matchPct: `${Math.round(m.score * 100)}%`, art: m.art }));
}
```

Replace with: (delete entirely — nothing, this whole block is removed)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 8: Note the verification gap**

No live browser, no live `GEMINI_API_KEY`/deployed `suggest-similar` function
available in this build environment. Real Gemini suggestion quality, iTunes
resolution hit-rate, and actual snippet playback all need a live pass before
this is considered fully verified.

- [ ] **Step 9: Commit**

```bash
git add app/routes/record.tsx app/lib/memoVisuals.ts
git commit -m "feat: Record — real Gemini-suggested, iTunes-resolved sounds-like"
```

---

### Task 6: Idea Detail — "Sounds like" display

**Files:**
- Modify: `app/routes/ideas.$id.tsx`

- [ ] **Step 1: Import the hook**

Find:
```tsx
import { useEffect, useRef, useState, Fragment } from "react";
```

Replace with:
```tsx
import { useEffect, useRef, useState, Fragment } from "react";
import { usePreviewPlayer } from "~/lib/usePreviewPlayer";
```

- [ ] **Step 2: Instantiate the hook**

Find:
```tsx
  const audioRef = useRef<HTMLAudioElement>(undefined);
  useEffect(() => {
    if (!id) return;
    listSongsForIdea(id).then(setSongs);
  }, [id]);
```

Replace with:
```tsx
  const audioRef = useRef<HTMLAudioElement>(undefined);
  const { playingUrl: previewPlayingUrl, toggle: togglePreview } = usePreviewPlayer();
  useEffect(() => {
    if (!id) return;
    listSongsForIdea(id).then(setSongs);
  }, [id]);
```

- [ ] **Step 3: Add the display section**

Find (the "Songs from this idea" block):
```tsx
      {songs.length > 0 && (
        <>
          <div style={cssText("margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Songs from this idea</div>
          <div style={cssText("display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;")}>
            {songs.map((s, i) => (
              <Fragment key={i}>
                <span style={cssText("font-size:12.5px;font-weight:600;color:#17161B;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:20px;padding:7px 13px;")}>♪ {s.vibe_briefs?.source_track_name}</span>
              </Fragment>
            ))}
          </div>
        </>
      )}
```

Replace with:
```tsx
      {row.sounds_like_json && row.sounds_like_json.length > 0 && (
        <>
          <div style={cssText("margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Sounds like</div>
          <div style={cssText("margin-top:10px;display:flex;flex-direction:column;gap:9px;")}>
            {row.sounds_like_json.map((t: { title: string; artist: string; artworkUrl: string; previewUrl: string }, i: number) => (
              <button
                key={i}
                onClick={() => togglePreview(t.previewUrl)}
                style={cssText("display:flex;align-items:center;gap:12px;padding:8px;border-radius:12px;background:#fff;border:1px solid rgba(0,0,0,.07);cursor:pointer;text-align:left;width:100%;")}
              >
                <div style={cssText(`width:44px;height:44px;border-radius:9px;flex:none;background-color:#e3d8c4;background-image:url(${t.artworkUrl});background-size:cover;background-position:center;box-shadow:0 3px 7px rgba(0,0,0,.12);`)}></div>
                <div style={cssText("flex:1;min-width:0;")}>
                  <div style={cssText("font-size:14px;font-weight:700;color:#17161B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.title}</div>
                  <div style={cssText("font-size:11.5px;color:#8a8791;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.artist}</div>
                </div>
                <span style={cssText("font-size:16px;color:#B5503C;flex:none;")}>{previewPlayingUrl === t.previewUrl ? "❚❚" : "▶"}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {songs.length > 0 && (
        <>
          <div style={cssText("margin-top:20px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#57565E;")}>Songs from this idea</div>
          <div style={cssText("display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;")}>
            {songs.map((s, i) => (
              <Fragment key={i}>
                <span style={cssText("font-size:12.5px;font-weight:600;color:#17161B;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:20px;padding:7px 13px;")}>♪ {s.vibe_briefs?.source_track_name}</span>
              </Fragment>
            ))}
          </div>
        </>
      )}
```

(Ideas saved before this shipped have `sounds_like_json === null` — the
`row.sounds_like_json && ...length > 0` guard means the section simply
doesn't render for them, no empty/broken state.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add app/routes/ideas.\$id.tsx
git commit -m "feat: Idea Detail — show saved Sounds Like list, playable"
```

---

### Task 7: Chooser — Side B search + build-button state fix

**Files:**
- Modify: `app/routes/songs.new.tsx`

- [ ] **Step 1: Imports and new state**

Find:
```tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { listIdeas, listBriefs, saveSong } from "~/lib/api/bank";
import { buildSong } from "~/lib/api/arrange";
import { buildMidi } from "~/lib/audio/midi";
import { decoIdea, PAL } from "~/lib/memoVisuals";
import { Cassette } from "~/components/memo/Cassette";
import { cssText } from "~/lib/cssText";

export default function Chooser() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [ideaId, setIdeaId] = useState<string | null>(sp.get("idea"));
  const [briefId, setBriefId] = useState<string | null>(sp.get("brief"));
  const [busy, setBusy] = useState(false);
  useEffect(() => { listIdeas().then(setIdeas); listBriefs().then(setBriefs); }, []);
  const ready = !!ideaId && !!briefId && !busy;
```

Replace with:
```tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { listIdeas, listBriefs, saveBrief, saveSong } from "~/lib/api/bank";
import { buildSong } from "~/lib/api/arrange";
import { buildMidi } from "~/lib/audio/midi";
import { analyzeReference } from "~/lib/audio/analyze";
import { searchTracks, fetchPreviewBlob } from "~/lib/api/tracks";
import { decoIdea, PAL } from "~/lib/memoVisuals";
import { Cassette } from "~/components/memo/Cassette";
import { usePreviewPlayer } from "~/lib/usePreviewPlayer";
import { cssText } from "~/lib/cssText";

type SearchTrack = { trackName: string; artist: string; artworkUrl: string; previewUrl: string };

export default function Chooser() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [ideas, setIdeas] = useState<any[]>([]);
  const [briefs, setBriefs] = useState<any[]>([]);
  const [ideaId, setIdeaId] = useState<string | null>(sp.get("idea"));
  const [briefId, setBriefId] = useState<string | null>(sp.get("brief"));
  const [busy, setBusy] = useState(false);
  const [briefQuery, setBriefQuery] = useState("");
  const [briefResults, setBriefResults] = useState<SearchTrack[]>([]);
  const [analyzingUrl, setAnalyzingUrl] = useState<string | null>(null);
  const { playingUrl, toggle: togglePreview } = usePreviewPlayer();
  useEffect(() => { listIdeas().then(setIdeas); listBriefs().then(setBriefs); }, []);
  const picked = !!ideaId && !!briefId;
  const ready = picked && !busy;

  async function searchBriefs() {
    const hits = await searchTracks(briefQuery).catch(() => []);
    setBriefResults(hits);
  }

  // Picking a search result runs it through the same analyze -> saveBrief
  // pipeline brief.tsx's pick() already uses (saveBrief already dedupes by
  // track+source, from an earlier fix) — then selects the resulting brief.
  async function pickSearchResult(t: SearchTrack) {
    setAnalyzingUrl(t.previewUrl);
    try {
      const blob = await fetchPreviewBlob(t.previewUrl);
      const a = await analyzeReference(blob, t.trackName, "itunes");
      const saved = await saveBrief({ ...a, previewUrl: t.previewUrl });
      setBriefs((prev) => [saved, ...prev.filter((b) => b.id !== saved.id)]);
      setBriefId(saved.id);
      setBriefQuery("");
      setBriefResults([]);
    } finally {
      setAnalyzingUrl(null);
    }
  }
```

- [ ] **Step 2: Update the Side B heading + add the search bar**

Find:
```tsx
      <div style={cssText("margin-top:22px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C7A3A;")}>
        Side B · reference brief <span style={cssText("color:#8a8791;font-weight:600;text-transform:none;letter-spacing:0;")}>· recents first</span>
      </div>
      <div style={cssText("display:flex;flex-direction:column;gap:9px;margin-top:10px;")}>
        {briefs.map((b, idx) => {
```

Replace with:
```tsx
      <div style={cssText("margin-top:22px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C7A3A;")}>
        Side B · reference brief
      </div>
      <div style={cssText("margin-top:10px;display:flex;align-items:center;gap:10px;padding:0 15px;height:48px;background:#fff;border:1px solid rgba(0,0,0,.07);border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,.04);")}>
        <button onClick={searchBriefs} aria-label="Search" style={cssText("display:flex;align-items:center;border:none;background:none;padding:0;cursor:pointer;")}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#9a99a3" strokeWidth="2" /><path d="M20 20l-3.5-3.5" stroke="#9a99a3" strokeWidth="2" strokeLinecap="round" /></svg>
        </button>
        <input value={briefQuery} onChange={(e) => setBriefQuery(e.target.value)} placeholder="Search a track..." style={cssText("flex:1;border:none;background:none;outline:none;font-size:14.5px;color:#17161B;font-weight:500;")} />
      </div>

      {briefQuery ? (
        <div style={cssText("display:flex;flex-direction:column;gap:9px;margin-top:10px;")}>
          {briefResults.map((t, i) => (
            <div
              key={i}
              style={cssText(`display:flex;align-items:center;gap:12px;padding:10px;border-radius:14px;background:#fff;border:1px solid rgba(0,0,0,.07);`)}
            >
              <div style={cssText(`width:44px;height:44px;border-radius:10px;flex:none;background-color:#e8e6ea;background-image:url(${t.artworkUrl});background-size:cover;background-position:center;`)}></div>
              <div style={cssText("flex:1;text-align:left;min-width:0;")}>
                <div style={cssText("font-size:14px;font-weight:700;color:#17161B;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.trackName}</div>
                <div style={cssText("font-size:12px;color:#8a8791;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{t.artist}</div>
              </div>
              <button onClick={() => togglePreview(t.previewUrl)} style={cssText("flex:none;width:30px;height:30px;border-radius:50%;border:none;background:#F7F1E3;color:#7C7A3A;cursor:pointer;font-size:12px;")}>
                {playingUrl === t.previewUrl ? "❚❚" : "▶"}
              </button>
              <button
                onClick={() => pickSearchResult(t)}
                disabled={analyzingUrl === t.previewUrl}
                style={cssText(`flex:none;padding:8px 14px;border-radius:20px;border:none;background:#17161B;color:#fff;font-size:12px;font-weight:700;cursor:pointer;opacity:${analyzingUrl === t.previewUrl ? .5 : 1};`)}
              >
                {analyzingUrl === t.previewUrl ? "Analyzing..." : "Select"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={cssText("display:flex;flex-direction:column;gap:9px;margin-top:10px;")}>
          {briefs.map((b, idx) => {
```

(Note: this Find/Replace ends mid-JSX-expression on purpose — the existing
`{briefs.map((b, idx) => {` line and everything after it, through the
closing of that map and its wrapping `</div>`, stays exactly as it already
is; only wrap the whole existing recents block in the new `{briefQuery ?
... : ( ...existing... )}` ternary shown above. See Step 3.)

- [ ] **Step 3: Close the new ternary after the existing recents list**

Find (the closing of the existing briefs.map block, right before the build button):
```tsx
              <span style={cssText(cached ? "font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#0b8a3d;background:rgba(11,138,61,.1);border-radius:7px;padding:3px 8px;" : "font-size:11px;color:#c9c8cf;")}>{cached ? "cached" : "›"}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={build}
        disabled={!ready}
        style={cssText(`margin-top:24px;width:100%;padding:16px;border-radius:16px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#17161B;color:#fff;opacity:${ready ? 1 : .4};pointer-events:${ready ? "auto" : "none"};box-shadow:0 10px 24px rgba(20,15,40,.2);`)}
      >
        {ready ? "Build song →" : "Pick one of each to build"}
      </button>
```

Replace with:
```tsx
              <span style={cssText(cached ? "font-size:9.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#0b8a3d;background:rgba(11,138,61,.1);border-radius:7px;padding:3px 8px;" : "font-size:11px;color:#c9c8cf;")}>{cached ? "cached" : "›"}</span>
            </button>
          );
        })}
        </div>
      )}

      <button
        onClick={build}
        disabled={!ready}
        style={cssText(`margin-top:24px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;border-radius:16px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#17161B;color:#fff;opacity:${!picked ? .4 : 1};pointer-events:${ready ? "auto" : "none"};box-shadow:0 10px 24px rgba(20,15,40,.2);`)}
      >
        {busy && (
          <span style={cssText("width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:mSpin .8s linear infinite;display:inline-block;")}></span>
        )}
        {busy ? "Building..." : !picked ? "Pick one of each to build" : "Build song →"}
      </button>
```

(This closes the `{briefQuery ? (...) : (` ternary opened in Step 2 —
`</div>)}` right after the existing `.map()`'s closing, before the build
button. The build button's own `opacity`/label logic changes from the
single collapsed `ready` check to `!picked` for graying and separate
`busy`/`!picked`/ready-implied branches for the label, fixing the bug
where mid-build it fell back to "Pick one of each to build" even though
both were already picked.)

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 5: Note the verification gap**

No live browser available in this build environment. Search-then-pick,
snippet playback, and the build-button's visual states all need a live
pass before this is considered fully verified.

- [ ] **Step 6: Commit**

```bash
git add app/routes/songs.new.tsx
git commit -m "feat: Chooser — Side B iTunes search + fix build-button state bug"
```

---

## Self-Review

**Spec coverage:**
1. `usePreviewPlayer()` → Task 2. ✓
2. `suggest-similar` edge fn + client → Task 3. ✓
3. Record real sounds-like, saved to idea → Tasks 1, 4, 5. ✓
4. Idea Detail displays saved list → Task 6. ✓
5. Chooser Side B search → Task 7. ✓
6. Build-button bug fix → Task 7. ✓

**Placeholder scan:** none — every step shows complete code.

**Type consistency:** `SoundsLikeEntry` (Task 1) used identically in
`bank.ts` (Task 4), `record.tsx` (Task 5), and inline in `ideas.$id.tsx`
(Task 6 — inlined rather than imported since that file doesn't otherwise
import from `~/lib/types`; same shape either way). `usePreviewPlayer()`'s
`{playingUrl, toggle}` return shape used identically by all three consumers
(Tasks 5, 6, 7).

**Ordering:** Task 5 depends on Tasks 2, 3, 4 (imports `usePreviewPlayer`,
`suggestSimilar`, and the updated `saveIdea` signature). Task 6 depends only
on Task 1 (the column) and Task 2 (the hook) — does not depend on Task 5
being done first, since it only reads `sounds_like_json` with an
already-fixed shape. Task 7 depends only on Task 2. Tasks 4, 6, 7 are
mutually independent (disjoint files) once Tasks 1-3 land, and can be
parallelized; Task 5 must wait for Task 4.
