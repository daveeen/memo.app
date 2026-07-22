# Optional Reference Song + Build-Flow Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `docs/superpowers/specs/2026-07-22-optional-reference-and-build-polish-design.md` — make the reference brief optional when building a song, remove the inaccurate "Input" stat and lay the remaining 3 stats out as one row, and fix iTunes artwork/preview playback being silently blocked by this app's COEP header.

**Architecture:** The `arrange` edge function's response schema gains a `structure` field so it always returns a usable structure (echoing the reference one, or inventing one via Gemini when none was given) — the client no longer needs a brief to derive `structure` from. iTunes artwork gets proxied server-side through the existing `track-search` edge function (mirroring its existing `?preview=` audio proxy) with a `Cross-Origin-Resource-Policy` header added; preview-audio *playback* (not the existing analyze-a-reference fetch path, which is already fine) gets proxied client-side in the one shared `usePreviewPlayer` hook.

**Tech Stack:** React Router 7, Supabase Edge Functions (Deno), Gemini Interactions API, `@tonejs/midi` (unchanged in this plan). No test framework — verification is `npm run typecheck` + `npm run build`.

---

## File Structure

**Modified:**
- `supabase/functions/arrange/index.ts` — response schema + prompt gain a required `structure` output
- `app/lib/api/arrange.ts` — `buildSong`'s `brief` param becomes optional; `structure` now comes from the response
- `app/lib/types.ts` — `SongBuild.sourceVibeBriefId` becomes nullable
- `app/routes/songs.new.tsx` — build-ready gate no longer requires a brief; Side B marked optional
- `app/routes/songs.tsx` — brief-derived title/pill render conditionally
- `app/routes/songs.$id.tsx` — same, for the Builder header
- `app/routes/record.tsx` — drop the "Input" stat, 3-column grid
- `supabase/functions/track-search/index.ts` — new `?image=` proxy route, `Cross-Origin-Resource-Policy` header, `artworkUrl` rewritten to the proxy
- `app/lib/usePreviewPlayer.ts` — actual `<audio>` playback routes through the `track-search` preview proxy (the existing `?preview=` route was already COEP-safe once the header above is added, but nothing was pointing playback at it — it was only used by the separate analyze-a-reference fetch path)

---

### Task 1: `arrange` edge function returns a usable structure unconditionally

**Files:**
- Modify: `supabase/functions/arrange/index.ts`

- [ ] **Step 1: Extend the response schema**

Find:
```ts
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    chordChart: {
      type: "array",
      items: {
        type: "object",
        properties: { chord: { type: "string" }, section: { type: "string" } },
        required: ["chord", "section"],
      },
    },
    instrumentation: { type: "array", items: { type: "string" } },
  },
  required: ["chordChart", "instrumentation"],
};
```

Replace with:
```ts
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    chordChart: {
      type: "array",
      items: {
        type: "object",
        properties: { chord: { type: "string" }, section: { type: "string" } },
        required: ["chord", "section"],
      },
    },
    structure: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" } },
        required: ["label"],
      },
    },
    instrumentation: { type: "array", items: { type: "string" } },
  },
  required: ["chordChart", "structure", "instrumentation"],
};
```

- [ ] **Step 2: Update the prompt to always produce a structure, inventing one when none was given**

Find:
```ts
  const sys = "You are a music arranger. Stay strictly in the given key and tempo. " +
    "Use only diatonic chords of that key unless a chord is already in the provided reference progression.";
  const user = `Key: ${key}\nTempo: ${tempo}\nReference progression: ${JSON.stringify(ref_progression)}\n` +
    `Melody contour: ${JSON.stringify(melody_contour)}\nStructure: ${JSON.stringify(structure)}\n` +
    `Generate a chord chart ordered to follow the structure.`;
```

Replace with:
```ts
  const sys = "You are a music arranger. Stay strictly in the given key and tempo. " +
    "Use only diatonic chords of that key unless a chord is already in the provided reference progression. " +
    "Always return a structure array in your output, listing the song's sections in order (e.g. Intro, Verse, " +
    "Chorus, Verse, Chorus, Outro). If a reference structure was given below, echo it back exactly. If none " +
    "was given (it's null), invent a natural one that fits the key, tempo, and melody contour, then generate " +
    "a chord progression to match it.";
  const user = `Key: ${key}\nTempo: ${tempo}\nReference progression: ${JSON.stringify(ref_progression)}\n` +
    `Melody contour: ${JSON.stringify(melody_contour)}\nStructure: ${JSON.stringify(structure)}\n` +
    `Generate a chord chart ordered to follow the structure (inventing one first if none was given above).`;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors. (This file is Deno code, excluded from the app's `tsc` pass — this step confirms nothing else broke.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/arrange/index.ts
git commit -m "feat: arrange fn always returns a structure, invents one when no reference given"
```

Not deployed by this task — `npx supabase functions deploy arrange` (keep JWT verify ON) is a manual step.

---

### Task 2: `arrange.ts` client — optional brief, structure from response

**Files:**
- Modify: `app/lib/api/arrange.ts`
- Modify: `app/lib/types.ts`

- [ ] **Step 1: Make `sourceVibeBriefId` nullable on the type**

Find (in `app/lib/types.ts`):
```ts
export interface SongBuild {
  id: string; sourceIdeaId: string; sourceVibeBriefId: string;
  chordChart: { chord: string; section: string }[];
  structure: { label: string; order: number }[];
  instrumentation: string[]; backingMidiPath?: string;
}
```

Replace with:
```ts
export interface SongBuild {
  id: string; sourceIdeaId: string; sourceVibeBriefId: string | null;
  chordChart: { chord: string; section: string }[];
  structure: { label: string; order: number }[];
  instrumentation: string[]; backingMidiPath?: string;
}
```

- [ ] **Step 2: Rewrite `buildSong`**

Find (in `app/lib/api/arrange.ts`):
```ts
export async function buildSong(idea: any, brief: any): Promise<Omit<SongBuild, "id" | "backingMidiPath">> {
  // `arrange` is deployed with Supabase JWT verification on, so the Authorization header must
  // carry the signed-in user's own access token — the shared anon key is not a user session and
  // either fails verification outright or (worse) authenticates as no one in particular.
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({
      key: idea.key, tempo: idea.bpm,
      chords: [], melody_contour: (idea.notes_json ?? idea.notes)?.map((n: any) => n.pitch),
      ref_progression: brief.progression_json ?? brief.chordProgression,
      structure: (brief.structure_json ?? brief.sections).map((s: any, i: number) => ({ label: s.label, order: i + 1 })),
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error ?? `arrange failed: ${r.status}`);
  }
  const { chordChart, instrumentation } = await r.json();
  const structure = (brief.structure_json ?? brief.sections).map((s: any, i: number) => ({ label: s.label, order: i + 1 }));
  return { sourceIdeaId: idea.id, sourceVibeBriefId: brief.id, chordChart, structure, instrumentation };
}
```

Replace with:
```ts
export async function buildSong(idea: any, brief: any | null): Promise<Omit<SongBuild, "id" | "backingMidiPath">> {
  // `arrange` is deployed with Supabase JWT verification on, so the Authorization header must
  // carry the signed-in user's own access token — the shared anon key is not a user session and
  // either fails verification outright or (worse) authenticates as no one in particular.
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({
      key: idea.key, tempo: idea.bpm,
      chords: [], melody_contour: (idea.notes_json ?? idea.notes)?.map((n: any) => n.pitch),
      ref_progression: brief ? (brief.progression_json ?? brief.chordProgression) : null,
      structure: brief ? (brief.structure_json ?? brief.sections).map((s: any, i: number) => ({ label: s.label, order: i + 1 })) : null,
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error ?? `arrange failed: ${r.status}`);
  }
  // `structure` now comes back from the arrange function itself — either an
  // echo of the reference structure we sent, or (when we sent null because
  // there was no brief) the one Gemini invented from key/tempo/melody alone.
  // Gemini only returns {label} per entry (see arrange/index.ts's schema);
  // `order` is derived from array position here, same as it always was for
  // the brief-supplied case.
  const { chordChart, instrumentation, structure: rawStructure } = await r.json();
  const structure = (rawStructure ?? []).map((s: any, i: number) => ({ label: s.label, order: i + 1 }));
  return { sourceIdeaId: idea.id, sourceVibeBriefId: brief?.id ?? null, chordChart, structure, instrumentation };
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/api/arrange.ts app/lib/types.ts
git commit -m "feat: buildSong accepts a null brief, structure comes from the response"
```

---

### Task 3: Chooser — build from an idea alone

**Files:**
- Modify: `app/routes/songs.new.tsx`

- [ ] **Step 1: Drop the brief requirement from the ready gate**

Find:
```tsx
  const picked = !!ideaId && !!briefId;
  const ready = picked && !busy;
```

Replace with:
```tsx
  const ready = !!ideaId && !busy;
```

- [ ] **Step 2: Update `build()` to tolerate no brief selected**

Find:
```tsx
  async function build() {
    const idea = ideas.find((i) => i.id === ideaId);
    const brief = briefs.find((b) => b.id === briefId);
    if (!idea || !brief) return;
    setBusy(true);
    try {
      const s = await buildSong(idea, brief);
      const midi = buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm);
      const { song } = await saveSong(s, midi);
      nav(`/songs/${song.id}`);
    } catch (e) { console.error("[chooser] build failed:", e); setBusy(false); }
  }
```

Replace with:
```tsx
  async function build() {
    const idea = ideas.find((i) => i.id === ideaId);
    if (!idea) return;
    const brief = briefId ? briefs.find((b) => b.id === briefId) ?? null : null;
    setBusy(true);
    try {
      const s = await buildSong(idea, brief);
      const midi = buildMidi(idea.notes_json ?? idea.notes, s.chordChart, idea.bpm);
      const { song } = await saveSong(s, midi);
      nav(`/songs/${song.id}`);
    } catch (e) { console.error("[chooser] build failed:", e); setBusy(false); }
  }
```

- [ ] **Step 3: Mark Side B as optional in the heading**

Find:
```tsx
      <div style={cssText("flex:none;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C7A3A;")}>
        Side B · reference brief
      </div>
```

Replace with:
```tsx
      <div style={cssText("flex:none;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#7C7A3A;")}>
        Side B · reference brief <span style={cssText("color:#a8a68a;font-weight:600;text-transform:none;letter-spacing:0;")}>· optional</span>
      </div>
```

- [ ] **Step 4: Update the build button's gray-out and label to key off `ideaId`, not the removed `picked`**

Find:
```tsx
      <button
        onClick={build}
        disabled={!ready}
        style={cssText(`flex:none;margin:12px 0 20px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;border-radius:16px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#17161B;color:#fff;opacity:${!picked ? .4 : 1};pointer-events:${ready ? "auto" : "none"};box-shadow:0 10px 24px rgba(20,15,40,.2);`)}
      >
        {busy && (
          <span style={cssText("width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:mSpin .8s linear infinite;display:inline-block;")}></span>
        )}
        {busy ? "Building..." : !picked ? "Pick one of each to build" : "Build song →"}
      </button>
```

Replace with:
```tsx
      <button
        onClick={build}
        disabled={!ready}
        style={cssText(`flex:none;margin:12px 0 20px;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:16px;border-radius:16px;border:none;font-size:15px;font-weight:700;cursor:pointer;background:#17161B;color:#fff;opacity:${!ideaId ? .4 : 1};pointer-events:${ready ? "auto" : "none"};box-shadow:0 10px 24px rgba(20,15,40,.2);`)}
      >
        {busy && (
          <span style={cssText("width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:mSpin .8s linear infinite;display:inline-block;")}></span>
        )}
        {busy ? "Building..." : !ideaId ? "Pick an idea to build" : "Build song →"}
      </button>
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add app/routes/songs.new.tsx
git commit -m "feat: Chooser builds from an idea alone, reference brief now optional"
```

---

### Task 4: Songs list + Builder — render brief-derived UI conditionally

**Files:**
- Modify: `app/routes/songs.tsx`
- Modify: `app/routes/songs.$id.tsx`

- [ ] **Step 1: `songs.tsx` — subcopy, view mapping, conditional B pill**

Find:
```tsx
      <p style={cssText("font-size:14px;color:#57565E;margin:0 0 18px;")}>An idea plus a brief makes a song.</p>
```

Replace with:
```tsx
      <p style={cssText("font-size:14px;color:#57565E;margin:0 0 18px;")}>Built from an idea, with an optional reference.</p>
```

Find:
```tsx
  const view = songs.map((s) => ({
    id: s.id,
    idea: s.ideas?.title ?? "Idea",
    brief: s.vibe_briefs?.source_track_name ?? "Brief",
    title: `${s.ideas?.title ?? "Idea"} × ${s.vibe_briefs?.source_track_name ?? "Brief"}`,
  }));
```

Replace with:
```tsx
  const view = songs.map((s) => ({
    id: s.id,
    idea: s.ideas?.title ?? "Idea",
    brief: s.vibe_briefs?.source_track_name ?? null,
    title: s.vibe_briefs?.source_track_name
      ? `${s.ideas?.title ?? "Idea"} × ${s.vibe_briefs.source_track_name}`
      : (s.ideas?.title ?? "Idea"),
  }));
```

Find:
```tsx
              <span style={cssText("font-size:11px;font-weight:700;color:#B5503C;background:rgba(181,80,60,.14);border-radius:8px;padding:4px 9px;")}>A · {s.idea}</span>
              <span style={cssText("font-size:11px;font-weight:700;color:#7C7A3A;background:rgba(124,122,58,.16);border-radius:8px;padding:4px 9px;")}>B · {s.brief}</span>
```

Replace with:
```tsx
              <span style={cssText("font-size:11px;font-weight:700;color:#B5503C;background:rgba(181,80,60,.14);border-radius:8px;padding:4px 9px;")}>A · {s.idea}</span>
              {s.brief && (
                <span style={cssText("font-size:11px;font-weight:700;color:#7C7A3A;background:rgba(124,122,58,.16);border-radius:8px;padding:4px 9px;")}>B · {s.brief}</span>
              )}
```

- [ ] **Step 2: `songs.$id.tsx` — title suffix and B pill only when a brief exists**

Find:
```tsx
      <h2 style={cssText("margin:5px 0 10px;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#2E2418;")}>{idea.title} × {brief?.source_track_name}</h2>
      <div style={cssText("display:flex;align-items:center;gap:8px;flex-wrap:wrap;")}>
        <span style={cssText("font-size:11px;font-weight:800;letter-spacing:.02em;color:#2E2418;background:#F4EDDB;border:1px solid rgba(46,36,24,.14);border-radius:8px;padding:5px 10px;font-family:'Space Mono',monospace;white-space:nowrap;")}>{idea.key}</span>
        <span style={cssText("font-size:11px;font-weight:800;letter-spacing:.02em;color:#2E2418;background:#F4EDDB;border:1px solid rgba(46,36,24,.14);border-radius:8px;padding:5px 10px;font-family:'Space Mono',monospace;white-space:nowrap;")}>{Math.round(idea.bpm)} BPM</span>
        <span style={cssText("width:1px;height:16px;background:rgba(46,36,24,.14);")}></span>
        <span style={cssText("font-size:11px;font-weight:700;color:#B5503C;background:rgba(181,80,60,.14);border-radius:8px;padding:5px 10px;")}>A · {idea.title}</span>
        <span style={cssText("font-size:11px;font-weight:700;color:#7C7A3A;background:rgba(124,122,58,.16);border-radius:8px;padding:5px 10px;")}>B · {brief?.source_track_name}</span>
      </div>
```

Replace with:
```tsx
      <h2 style={cssText("margin:5px 0 10px;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#2E2418;")}>{idea.title}{brief?.source_track_name ? ` × ${brief.source_track_name}` : ""}</h2>
      <div style={cssText("display:flex;align-items:center;gap:8px;flex-wrap:wrap;")}>
        <span style={cssText("font-size:11px;font-weight:800;letter-spacing:.02em;color:#2E2418;background:#F4EDDB;border:1px solid rgba(46,36,24,.14);border-radius:8px;padding:5px 10px;font-family:'Space Mono',monospace;white-space:nowrap;")}>{idea.key}</span>
        <span style={cssText("font-size:11px;font-weight:800;letter-spacing:.02em;color:#2E2418;background:#F4EDDB;border:1px solid rgba(46,36,24,.14);border-radius:8px;padding:5px 10px;font-family:'Space Mono',monospace;white-space:nowrap;")}>{Math.round(idea.bpm)} BPM</span>
        <span style={cssText("width:1px;height:16px;background:rgba(46,36,24,.14);")}></span>
        <span style={cssText("font-size:11px;font-weight:700;color:#B5503C;background:rgba(181,80,60,.14);border-radius:8px;padding:5px 10px;")}>A · {idea.title}</span>
        {brief?.source_track_name && (
          <span style={cssText("font-size:11px;font-weight:700;color:#7C7A3A;background:rgba(124,122,58,.16);border-radius:8px;padding:5px 10px;")}>B · {brief.source_track_name}</span>
        )}
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/songs.tsx app/routes/songs.\$id.tsx
git commit -m "feat: Songs list + Builder render brief-derived UI conditionally"
```

---

### Task 5: Record — drop "Input" stat, 3-column row

**Files:**
- Modify: `app/routes/record.tsx`

- [ ] **Step 1: Remove the Input entry from `revealStats`**

Find:
```tsx
  const revealStats = analysis ? [
    { label: "Input", value: analysis.inputType, inf: false },
    { label: "Tempo", value: `${Math.round(analysis.bpm)} BPM`, inf: false },
    { label: "Key", value: analysis.detectedKey, inf: false },
    { label: "Mood", value: analysis.moodTag, inf: true },
  ] : [];
```

Replace with:
```tsx
  const revealStats = analysis ? [
    { label: "Tempo", value: `${Math.round(analysis.bpm)} BPM`, inf: false },
    { label: "Key", value: analysis.detectedKey, inf: false },
    { label: "Mood", value: analysis.moodTag, inf: true },
  ] : [];
```

(`analysis.inputType` itself, and the classifier that produces it, are untouched — it's still persisted on the idea via `saveIdea` and still feeds `suggestSimilar`'s prompt. Only this display goes.)

- [ ] **Step 2: Three columns instead of two**

Find:
```tsx
          <div style={cssText("margin-top:16px;display:grid;grid-template-columns:1fr 1fr;background:#F7F1E3;border:1px solid rgba(46,36,24,.12);border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(60,44,32,.07);")}>
```

Replace with:
```tsx
          <div style={cssText("margin-top:16px;display:grid;grid-template-columns:1fr 1fr 1fr;background:#F7F1E3;border:1px solid rgba(46,36,24,.12);border-radius:14px;overflow:hidden;box-shadow:0 4px 14px rgba(60,44,32,.07);")}>
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add app/routes/record.tsx
git commit -m "feat: Record — drop inaccurate Input stat, 3-column single-row grid"
```

---

### Task 6: `track-search` edge function — proxy artwork, add CORP header

**Files:**
- Modify: `supabase/functions/track-search/index.ts`

- [ ] **Step 1: Replace the whole file**

Find (entire current file):
```ts
// GET ?query=... → results; GET ?preview=<url> → streams the mp3 (CORS shim)
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

// iTunes preview clips are served from Apple's own domains. This function has
// no auth and a wide-open CORS policy, so the `preview` param must be
// allowlisted — otherwise anyone could point it at an arbitrary/internal URL
// (e.g. ?preview=http://169.254.169.254/...) and use this deployed Edge
// Function as an open SSRF relay.
//
// Confirmed live (2026-07-21) against a real `itunes.apple.com/search` call:
// every previewUrl host was `audio-ssl.itunes.apple.com` — NOT `*.mzstatic.com`
// as originally (wrongly) assumed here without checking. Keeping mzstatic.com
// too since Apple's own asset CDN does use it for other content types and may
// for previews in some region/catalog case; itunes.apple.com is the confirmed one.
const ALLOWED_PREVIEW_HOST_SUFFIXES = [".itunes.apple.com", ".mzstatic.com"];

function isAllowedPreviewUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      ALLOWED_PREVIEW_HOST_SUFFIXES.some(suffix => u.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const preview = url.searchParams.get("preview");
  if (preview) {
    if (!isAllowedPreviewUrl(preview)) {
      return new Response(JSON.stringify({ error: "preview host not allowed" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const r = await fetch(preview);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `preview fetch failed: ${r.status}` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(r.body, { headers: { ...cors, "Content-Type": "audio/mpeg" } });
  }
  const q = url.searchParams.get("query") ?? "";
  const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`);
  if (!r.ok) {
    return new Response(JSON.stringify({ error: `itunes search failed: ${r.status}` }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const j = await r.json();
  const results = Array.isArray(j?.results) ? j.results : [];
  const out = results.filter((t: any)=>t.previewUrl).map((t: any) => ({
    trackName: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl100, previewUrl: t.previewUrl,
  }));
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
});
```

Replace with:
```ts
// GET ?query=... → results; GET ?preview=<url> → streams the mp3 (CORS shim);
// GET ?image=<url> → streams the artwork image (same shim)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  // This app's COEP `Cross-Origin-Embedder-Policy: require-corp` header (needed
  // for the openDAW WASM worklet, see public/_headers) blocks any cross-origin
  // <img>/<audio> load whose response doesn't carry this header — Apple's CDN
  // doesn't set one, so both proxy routes below need it explicitly or the
  // browser silently drops the image/audio regardless of the CORS headers.
  "Cross-Origin-Resource-Policy": "cross-origin",
};

// iTunes preview clips and artwork are served from Apple's own domains. This
// function has no auth and a wide-open CORS policy, so both proxied-url params
// must be allowlisted — otherwise anyone could point either at an arbitrary/
// internal URL (e.g. ?preview=http://169.254.169.254/...) and use this deployed
// Edge Function as an open SSRF relay.
//
// Confirmed live (2026-07-21) against a real `itunes.apple.com/search` call:
// every previewUrl host was `audio-ssl.itunes.apple.com` — NOT `*.mzstatic.com`
// as originally (wrongly) assumed here without checking. Keeping mzstatic.com
// too since Apple's own asset CDN does use it for other content types, and
// artwork specifically really is served from mzstatic.com.
const ALLOWED_PROXY_HOST_SUFFIXES = [".itunes.apple.com", ".mzstatic.com"];

function isAllowedProxyUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      ALLOWED_PROXY_HOST_SUFFIXES.some(suffix => u.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  const preview = url.searchParams.get("preview");
  if (preview) {
    if (!isAllowedProxyUrl(preview)) {
      return new Response(JSON.stringify({ error: "preview host not allowed" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const r = await fetch(preview);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `preview fetch failed: ${r.status}` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(r.body, { headers: { ...cors, "Content-Type": "audio/mpeg" } });
  }

  const image = url.searchParams.get("image");
  if (image) {
    if (!isAllowedProxyUrl(image)) {
      return new Response(JSON.stringify({ error: "image host not allowed" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const r = await fetch(image);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `image fetch failed: ${r.status}` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(r.body, { headers: { ...cors, "Content-Type": r.headers.get("content-type") ?? "image/jpeg" } });
  }

  const q = url.searchParams.get("query") ?? "";
  const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`);
  if (!r.ok) {
    return new Response(JSON.stringify({ error: `itunes search failed: ${r.status}` }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const j = await r.json();
  const results = Array.isArray(j?.results) ? j.results : [];
  // Rewriting artworkUrl to route through our own ?image= proxy here (rather
  // than in every caller) means every screen that shows iTunes artwork gets
  // a working, COEP-safe image with zero client-side changes.
  const selfBase = `${url.origin}${url.pathname}`;
  const out = results.filter((t: any) => t.previewUrl).map((t: any) => ({
    trackName: t.trackName, artist: t.artistName,
    artworkUrl: `${selfBase}?image=${encodeURIComponent(t.artworkUrl100)}`,
    previewUrl: t.previewUrl,
  }));
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
});
```

(`previewUrl` stays the raw Apple URL — `fetchPreviewBlob` in `app/lib/api/tracks.ts` already wraps it through `?preview=` itself for the analyze-a-reference flow; Task 7 handles the separate *playback* path.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/track-search/index.ts
git commit -m "feat: track-search proxies artwork + adds CORP header, fixing COEP-blocked images"
```

Not deployed by this task — `npx supabase functions deploy track-search --no-verify-jwt` (intentionally public, same as today) is a manual step.

---

### Task 7: `usePreviewPlayer` — route actual playback through the preview proxy

**Files:**
- Modify: `app/lib/usePreviewPlayer.ts`

- [ ] **Step 1: Proxy the url before assigning it to the `<audio>` element**

Find:
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
    if (el.src !== url) {
      el.src = url;
      el.currentTime = 0;
    }
    el.play();
    setPlayingUrl(url);
  }

  return { playingUrl, toggle };
}
```

Replace with:
```ts
// app/lib/usePreviewPlayer.ts
import { useEffect, useRef, useState } from "react";

// One shared <audio> element per hook instance, reused across every preview
// url it's given — not a fresh Audio object per click (same "reuse one
// element" principle as ideas.$id.tsx's idea-audio playback fix). Tapping a
// different url mid-playback switches .src; tapping the SAME url again
// toggles pause/resume instead of restarting from 0.
//
// This app's COEP require-corp header blocks a plain cross-origin <audio src>
// load unless the response carries Cross-Origin-Resource-Policy — Apple's CDN
// doesn't set one, so playback (unlike track-search's `fetchPreviewBlob`,
// which already goes through the proxy for its own reasons) needs routing
// through track-search's `?preview=` proxy too, which now sets that header.
const PREVIEW_PROXY_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-search`;
const proxiedPreviewUrl = (url: string) => `${PREVIEW_PROXY_BASE}?preview=${encodeURIComponent(url)}`;

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
    const proxied = proxiedPreviewUrl(url);
    if (el.src !== proxied) {
      el.src = proxied;
      el.currentTime = 0;
    }
    el.play();
    setPlayingUrl(url);
  }

  return { playingUrl, toggle };
}
```

(`playingUrl` state and the equality check both stay keyed on the *raw* url — every caller compares against `t.previewUrl`, e.g. `previewPlayingUrl === t.previewUrl`; only the `<audio>` element's actual `.src` gets the proxied wrapper.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: Note the verification gap**

No live browser or deployed `track-search` function with the new `?image=`/CORP-header behavior available in this build environment — real playback and artwork loading need a live pass (after `supabase functions deploy track-search --no-verify-jwt`) before this is considered fully verified.

- [ ] **Step 4: Commit**

```bash
git add app/lib/usePreviewPlayer.ts
git commit -m "fix: route preview playback through track-search's CORP-safe proxy"
```

---

## Self-Review

**Spec coverage:**
1. Reference song optional → Tasks 1, 2, 3. ✓
2. Delete "Input" stat, 3-column row → Task 5. ✓
3. iTunes artwork + preview audio fix → Tasks 6, 7. ✓
4. Brief-optional display polish (songs list + Builder) → Task 4. ✓

**Placeholder scan:** none — every step shows complete code.

**Type consistency:** `SongBuild.sourceVibeBriefId: string | null` (Task 2) matches `buildSong`'s `brief?.id ?? null` (Task 2) and `saveSong`'s existing pass-through of `s.sourceVibeBriefId` to the already-nullable `vibe_brief_id` column (no `bank.ts` change needed — verified against `supabase/migrations/0001_init.sql`, no `not null` on that column). `structure: {label, order}[]` shape is identical between `arrange.ts`'s brief-supplied and Gemini-invented paths (Task 2) and matches `SongBuild.structure`'s existing type (unchanged).

**Ordering:** Task 1 → Task 2 → Task 3 is a strict chain (each depends on the previous task's changed shape). Tasks 4, 5, 6, 7 are independent of that chain and of each other — all four can be parallelized once the plan starts, alongside the Task 1→2→3 chain.
