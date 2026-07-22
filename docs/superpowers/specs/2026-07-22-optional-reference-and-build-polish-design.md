# Optional Reference Song + Build-Flow Polish — Design

**Why:** Reference brief is currently required to build a song, but the user should be able to build from a hummed idea alone. Along the way: the "Input" stat display is inaccurate and gets removed, its 2×2 stat grid becomes a cleaner 3-column single row, and iTunes artwork/preview audio are silently broken by this app's COEP header.

## 1. Reference song becomes optional

**`supabase/functions/arrange/index.ts`:**
- `RESPONSE_SCHEMA` gains a required `structure` field in the *output* (array of `{label: string}`) — previously `structure` only existed as client-supplied input, never echoed back.
- System prompt: when `ref_progression`/`structure` are present in the request, use them as grounding (unchanged behavior — "stay strictly in the given key/tempo, use only diatonic chords unless already in the reference progression"). When absent (`null`), instruct Gemini to invent both a natural song structure (e.g. Intro/Verse/Chorus/Verse/Chorus/Outro) and a chord progression that fits the given key/tempo/melody contour, with no reference to lean on.
- User prompt: `Reference progression: ${JSON.stringify(ref_progression)}` and `Structure: ${JSON.stringify(structure)}` already interpolate cleanly as `"null"` when absent — no special-casing needed there, only the system instruction changes behavior.

**`app/lib/api/arrange.ts`:**
- `buildSong(idea: any, brief: any | null)` — `brief` becomes optional.
- Request body: `ref_progression: brief?.progression_json ?? brief?.chordProgression ?? null`, `structure: brief ? (brief.structure_json ?? brief.sections).map((s, i) => ({label: s.label, order: i+1})) : null`.
- Response destructure gains `structure`: `const { chordChart, instrumentation, structure } = await r.json();` — this is now the single source of truth for the returned `SongBuild.structure`, replacing the old client-side re-derivation from `brief.structure_json` (which no longer exists when there's no brief).
- Return: `sourceVibeBriefId: brief?.id ?? null`.

**DB:** No migration needed — `songs.vibe_brief_id` is already nullable (`references vibe_briefs(id) on delete set null`, no `not null`). `bank.ts`'s `saveSong` passes `s.sourceVibeBriefId` through as-is; inserting `null` is already valid.

**`app/routes/songs.new.tsx` (Chooser):**
- `ready = !!ideaId && !busy` (brief no longer part of the gate). Button label logic: `busy ? "Building..." : !ideaId ? "Pick an idea to build" : "Build song →"`.
- Side B heading gets a small "optional" marker so the UI communicates the new rule (e.g. `Side B · reference brief <span>· optional</span>`, mirroring the removed-in-Task-7 "· recents first" pattern's styling).
- `build()`: `const brief = briefId ? briefs.find((b) => b.id === briefId) ?? null : null;` — passed to `buildSong(idea, brief)`.

**Polish in `songs.tsx` and `songs.$id.tsx`:** both currently render a brief-derived label unconditionally-ish (`s.vibe_briefs?.source_track_name ?? "Brief"` in the list, bare `brief?.source_track_name` — no fallback — in the Builder header/pill). Without a brief this renders an empty/awkward "B · " pill and a trailing " × " in the title. Fix: only render the brief pill and the " × {name}" title suffix when a brief actually exists.

## 2. Delete "Input" stat, 3-column row

`app/routes/record.tsx`: `revealStats` drops the `{label: "Input", ...}` entry (keeps Tempo, Key, Mood — the classifier heuristic and `inputType` field themselves are untouched, since `inputType` is still persisted on the idea and still feeds the "sounds like" Gemini prompt; only this display goes). Stat grid: `grid-template-columns:1fr 1fr` → `1fr 1fr 1fr`. Three items now render as exactly one row — incidentally closes out the earlier "Mood cut off / covered by Sounds Like" issue for good, since there's no longer a second row to clip.

## 3. iTunes artwork + preview audio fix

**Root cause (confirmed via MDN):** this app's COEP `Cross-Origin-Embedder-Policy: require-corp` header (`public/_headers`, needed for the openDAW WASM worklet) blocks any cross-origin `<img>` or `<audio>` load that doesn't carry a `Cross-Origin-Resource-Policy` response header. Apple's CDN (`mzstatic.com`/`itunes.apple.com`) doesn't set one, so both artwork images and preview audio are silently blocked by the browser — not a fetch failure, not a broken URL, a policy block.

**`supabase/functions/track-search/index.ts`:**
- Add `"Cross-Origin-Resource-Policy": "cross-origin"` to the shared `cors` headers object — fixes the already-proxied `?preview=` audio route (it was proxied for CORS reasons but never carried this header, so it was *still* blocked by COEP).
- Add a new `?image=<url>` route, mirroring `?preview=`'s SSRF-safe allowlist (`isAllowedPreviewUrl`, same host suffixes), streaming the image bytes through with the correct `Content-Type` and the new CORP header.
- Search response: rewrite `artworkUrl` server-side to `${new URL(req.url).origin}${new URL(req.url).pathname}?image=${encodeURIComponent(t.artworkUrl100)}` instead of the raw Apple CDN URL. Single point of fix — every caller (Chooser search, `brief.tsx` search, Record's sounds-like resolution) gets working artwork automatically, no client-side changes needed anywhere.

## Self-review

- No placeholders/TBDs.
- No contradiction between sections — the `structure`-from-response change (§1) and the display-only sections (§2, §3) touch disjoint files.
- Scope: 7 files (`arrange/index.ts`, `arrange.ts`, `songs.new.tsx`, `songs.tsx`, `songs.$id.tsx`, `record.tsx`, `track-search/index.ts`) — small enough for one implementation plan, no further decomposition needed.
- Ambiguity check: "optional" only ever means "brief may be `null`" throughout — consistent.
