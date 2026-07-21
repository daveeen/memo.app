# Memo Frontend Port + Backend Wiring (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port all 11 screens of the approved mockup `docs/design/Memo.html` into real React Router 7 route components — identical markup, CSS, copy, and animation — and wire each to the Supabase / Essentia / Gemini / openDAW backend that already exists.

**Architecture:** The mockup is a single Claude-Artifact `DCLogic` component that switches screens via one `state.route` field and computes every screen's props in one `renderVals()`. We decompose that into per-route RR7 components under a shared layout (`_shell.tsx`) that carries the session guard and tab bar. Markup transcription is mechanical (a fixed rule table, below); the real work per screen is replacing fixture data with real API calls and replacing the mockup's fake `setTimeout`/`setInterval` state simulations with real async flows. No redesign. No Tailwind (the mockup uses computed inline-style strings — we port those verbatim through a tiny `cssText()` parser).

**Tech Stack:** React Router 7.18.1 (`ssr:false` SPA), TypeScript, Vite 8, `@supabase/supabase-js`, Essentia.js (existing), Tone.js (existing), `@opendaw/studio-*` (existing), Google Fonts (Caveat / Plus Jakarta Sans / Space Mono).

**Spec:** `docs/superpowers/specs/2026-07-21-frontend-port-backend-wiring-design.md`

---

## Shared reference (read once before Task 5 onward)

### R1 — Transcription protocol (mockup DCLogic → JSX)

Every screen's markup lives in `docs/design/Memo.html` (a compressed Artifact bundle). Task 1 produces a decoded, per-screen source tree at `.memo-design/` so you can open each screen's raw HTML side by side. Transcribe each screen's HTML into JSX by applying these rules mechanically — the markup, classes, inline styles, SVGs, and copy are copied **verbatim**; only the binding syntax changes:

| Mockup syntax | JSX equivalent |
|---|---|
| `<sc-if value="{{ cond }}">…</sc-if>` | `{cond && (<>…</>)}` |
| `<sc-for list="{{ arr }}" as="x">…</sc-for>` | `{arr.map((x, i) => (<React.Fragment key={i}>…</React.Fragment>))}` |
| `sc-camel-on-click="{{ handler }}"` | `onClick={handler}` |
| `sc-camel-on-input="{{ handler }}"` | `onChange={handler}` (React uses `onChange` for live input) |
| `sc-camel-view-box="…"` | `viewBox="…"` |
| `sc-camel-preserve-aspect-ratio="none"` | `preserveAspectRatio="none"` |
| `style="{{ styleStr }}"` | `style={cssText(styleStr)}` — `styleStr` is a computed string; `cssText` (Task 1) parses it to a React style object |
| `style="fixed:literal;color:{{ x }};"` | `style={cssText(\`fixed:literal;color:${x};\`)}` — inline interpolation |
| `{{ expr }}` in text | `{expr}` |
| `<dc-import name="Cassette" idea="{{ d }}">` | `<Cassette idea={d} />` (Task 3) |
| `class="m-scroll"` | `className="m-scroll"` |
| `value="{{ x }}"` on input | `value={x}` |
| static `<img>`, `<svg>`, `<polygon>` etc. | unchanged, but self-close void elements and camelCase attrs (`stroke-width`→`strokeWidth`, `stroke-linecap`→`strokeLinecap`, `fill-rule`→`fillRule`, `xmlns` stays) |

**SVG attribute camelCasing is required** — React warns on `stroke-width`. The mockup's SVGs use `stroke-width`, `stroke-linecap`, `stroke-linejoin`, `stop-color`. Convert all of them.

**Do not** invent state or restructure DOM. If a value is bound (`{{ x }}`), it comes from that screen's props object — the exact computation is given per-task in the "Props" block, lifted from the mockup's `renderVals()`.

### R2 — The mockup's `renderVals()` is the source of truth for computed props

Each task's **Props** block is copied from the mockup's single `renderVals()` (in `docs/design/Memo.html`, the `Component extends DCLogic` script). Fixture arrays (`baseIdeas`, `tracksBase`, `songsBase`, `structBase`, `prodTracks`…) are replaced with real data per the **Wiring** block. Pure-presentation helpers (`wavePoints`, `spineOf`, `playBtn`, `deco`, palette `pal`, style-string builders) are copied **verbatim** — they are deterministic and backend-independent.

### R3 — Palette + waveform helpers (shared, copied verbatim)

These appear in `renderVals()` and are used by Ideas, Idea Detail, Chooser, Record. Put them in `app/lib/memoVisuals.ts` (Task 3) so every screen imports one copy:

```ts
// app/lib/memoVisuals.ts — deterministic presentation helpers copied verbatim
// from the mockup's renderVals(). Backend-independent. ponytail: synthetic
// waveform is intentional for Phase A — real decoded peaks are Phase B.
export const PAL = [
  {shell:'linear-gradient(150deg,#C4593E,#9A3B2A)',glow:'radial-gradient(circle,rgba(196,89,62,.45),transparent 70%)',stripe:'#B34A34',ink:'#F3E6CF'},
  {shell:'linear-gradient(150deg,#D08A44,#A85E24)',glow:'radial-gradient(circle,rgba(208,138,68,.45),transparent 70%)',stripe:'#B76C2C',ink:'#F5EAD3'},
  {shell:'linear-gradient(150deg,#C9A84C,#9C7C2C)',glow:'radial-gradient(circle,rgba(201,168,76,.42),transparent 70%)',stripe:'#A98A32',ink:'#3A2E16'},
  {shell:'linear-gradient(150deg,#7E7E3E,#575A24)',glow:'radial-gradient(circle,rgba(126,126,62,.42),transparent 70%)',stripe:'#6A6C2E',ink:'#F1EAD2'},
  {shell:'linear-gradient(150deg,#5E8577,#3E5F53)',glow:'radial-gradient(circle,rgba(94,133,119,.42),transparent 70%)',stripe:'#4E7364',ink:'#EFE7D2'},
  {shell:'linear-gradient(150deg,#B9A987,#8E7C57)',glow:'radial-gradient(circle,rgba(185,169,135,.42),transparent 70%)',stripe:'#8E7C57',ink:'#3A2E1A'},
  {shell:'linear-gradient(150deg,#6E8490,#4C616C)',glow:'radial-gradient(circle,rgba(110,132,144,.42),transparent 70%)',stripe:'#5B727D',ink:'#EFEAD8'},
  {shell:'linear-gradient(150deg,#9A5A3C,#6E3B23)',glow:'radial-gradient(circle,rgba(154,90,60,.42),transparent 70%)',stripe:'#82492E',ink:'#F3E4CE'},
  {shell:'linear-gradient(150deg,#A85463,#7A3946)',glow:'radial-gradient(circle,rgba(168,84,99,.42),transparent 70%)',stripe:'#8E4351',ink:'#F3E2D6'},
];
export const SEC_COLORS = ['#C4593E','#7E7E3E','#D08A44','#C9A84C','#5E8577'];

// Angular fingerprint polygon — seed derived from a stable per-idea number so
// each recording gets a unique but deterministic waveform.
export function wavePoints(seed: number): string {
  const N=22,W=100,H=24,mid=H/2,amp=mid-1,top:string[]=[],bot:string[]=[];
  for(let i=0;i<N;i++){ const env=1-Math.abs(i-(N-1)/2)/((N-1)/2); const r=Math.abs(Math.sin(seed*12.9898*(i+1)))%1;
    const p=Math.max(0.06,(0.35+0.65*r)*(0.35+0.65*env)); const x=(i*W/(N-1)).toFixed(1);
    top.push(`${x},${(mid-p*amp).toFixed(1)}`); bot.push(`${x},${(mid+p*amp).toFixed(1)}`);}
  return top.concat(bot.reverse()).join(' ');
}

// Stable seed from a uuid string (mockup used numeric ids; real ids are uuids).
export function seedFromId(id: string): number {
  let h=0; for(let i=0;i<id.length;i++){ h=(h*31 + id.charCodeAt(i)) % 100000; } return (h % 900)/100 + 1;
}

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
    duration: d.duration != null ? `0:${String(Math.round(d.duration)).padStart(2,'0')}` : '0:00',
    wavePoints: wavePoints(seedFromId(d.id)),
    keyLow: !!d.keyLow,
    spineMeta: `${keyShort} · ${bpmShort}`,
  };
}
```

### R4 — Screen → route → file map

| Screen | Route path | Component file | Backing calls |
|---|---|---|---|
| Splash | `/` (index) | `routes/splash.tsx` | `supabase.auth.getSession()` |
| Auth | `/auth` | `routes/auth.tsx` | `signInWithOtp` |
| Ideas | `/ideas` | `routes/ideas.tsx` | `listIdeas()` + client filter |
| Idea Detail | `/ideas/:id` | `routes/ideas.$id.tsx` | `getIdea`,`renameIdea`,`updateIdeaNote`,`updateIdeaLyrics`,`ideaAudioUrl`,`listSongsForIdea` |
| Record | `/record` | `routes/record.tsx` | `analyzeCapture`,`saveIdea` |
| Brief | `/brief` | `routes/brief.tsx` | `searchTracks`,`fetchPreviewBlob`,`analyzeReference`,`saveBrief` |
| Songs | `/songs` | `routes/songs.tsx` | `listSongs()` |
| Chooser | `/songs/new` | `routes/songs.new.tsx` | `listIdeas`,`listBriefs` |
| Builder | `/songs/:id` | `routes/songs.$id.tsx` | `getSong`,`buildSong`,`buildMidi`,`saveSong`,`playSong` |
| Produce | `/produce/:songId` | `routes/produce.tsx` (existing, restyle only) | unchanged |
| Tab bar | in `_shell.tsx` | `routes/_shell.tsx` | route-derived |

---

## Task 0: Branch + commit design assets

**Files:**
- Modify: git state only

- [ ] **Step 1: Create a work branch**

Run:
```bash
cd "C:/Users/Yeriel Putra Harsono/Documents/Claude/projects/Lyra/memo"
git checkout -b feat/frontend-port
```
Expected: `Switched to a new branch 'feat/frontend-port'`

- [ ] **Step 2: Commit the untracked design + ux docs so the plan's source-of-truth is versioned**

The mockup `docs/design/Memo.html` and `docs/ux/` are currently untracked (`?? docs/design/`, `?? docs/ux/`). Every later task reads from them. Commit them first.

Run:
```bash
git add docs/design/ docs/ux/
git commit -m "docs: add approved Memo.html mockup + UX flow as port source-of-truth"
```
Expected: 2+ files committed.

---

## Task 1: Extraction tooling — decode mockup into per-screen source

**Files:**
- Create: `scripts/extract-memo-screens.mjs`
- Modify: `.gitignore` (add `.memo-design/`)

The mockup screens are inside a gzip+base64 Artifact bundle. This script decodes the template and the `Cassette.dc.html` sub-component and splits the template into one HTML file per screen, so transcription tasks have clean side-by-side source. Output is a gitignored work dir (regenerable, never committed).

- [ ] **Step 1: Write the extraction script**

Create `scripts/extract-memo-screens.mjs`:
```js
// Decodes docs/design/Memo.html (Claude Artifact bundle) into per-screen HTML
// under .memo-design/. Regenerable; gitignored. Run: node scripts/extract-memo-screens.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const raw = fs.readFileSync('docs/design/Memo.html', 'utf8');
const grab = (type) => {
  const m = raw.match(new RegExp(`<script type="${type}"[^>]*>([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`missing ${type}`);
  return m[1];
};
const template = JSON.parse(grab('__bundler/template'));          // the app template HTML
const manifest = JSON.parse(grab('__bundler/manifest'));          // uuid -> asset

const out = '.memo-design';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// full template + the renderVals component script
fs.writeFileSync(`${out}/_template.html`, template, 'utf8');
const comp = [...template.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).filter(s => s.includes('renderVals'))[0] || '';
fs.writeFileSync(`${out}/_renderVals.js`, comp, 'utf8');

// Cassette sub-component (gzip+base64 in manifest)
const cas = manifest['21b4702d-e7a2-4fe1-ab89-d70eb581a64a'];
if (cas && cas.data) {
  const casHtml = zlib.gunzipSync(Buffer.from(cas.data, 'base64')).toString('utf8');
  fs.writeFileSync(`${out}/Cassette.dc.html`, casHtml, 'utf8');
}

// split template by the SCREEN comment banners
const markers = [...template.matchAll(/<!--\s*={4,}\s*(.+?)\s*={4,}\s*-->/g)].map(m => ({ i: m.index, name: m[1] }));
for (let k = 0; k < markers.length; k++) {
  const start = markers[k].i;
  const end = k + 1 < markers.length ? markers[k + 1].i : template.length;
  const slug = markers[k].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  fs.writeFileSync(`${out}/screen-${String(k).padStart(2, '0')}-${slug}.html`, template.slice(start, end), 'utf8');
}
console.log(`Extracted ${markers.length} screens + Cassette + renderVals to ${out}/`);
```

- [ ] **Step 2: Gitignore the work dir**

Add to `.gitignore`:
```
.memo-design/
```

- [ ] **Step 3: Run it**

Run:
```bash
node scripts/extract-memo-screens.mjs
ls .memo-design
```
Expected: `Extracted 11 screens + Cassette + renderVals to .memo-design/` and a listing including `screen-00-splash.html` … `screen-10-tab-bar.html`, `Cassette.dc.html`, `_renderVals.js`, `_template.html`.

- [ ] **Step 4: Commit**

```bash
git add scripts/extract-memo-screens.mjs .gitignore
git commit -m "chore: add Memo mockup extraction script for screen port"
```

---

## Task 2: Style foundation — `cssText()`, `memo.css`, fonts

**Files:**
- Create: `app/lib/cssText.ts`
- Create: `app/lib/cssText.test.mjs`
- Create: `app/memo.css`
- Modify: `app/root.tsx` (add font links + import memo.css)

- [ ] **Step 1: Write the failing self-check for `cssText`**

Create `app/lib/cssText.test.mjs`:
```js
// Runnable self-check: node app/lib/cssText.test.mjs  (ponytail: one assert file, no framework)
import assert from 'node:assert';
import { cssText } from './cssText.ts';

// kebab -> camel, trims, drops empties
assert.deepStrictEqual(cssText('flex:1;border-radius:8px;'), { flex: '1', borderRadius: '8px' });
// values containing colons (gradients, url) survive — split on FIRST colon only
assert.deepStrictEqual(
  cssText('background:linear-gradient(150deg,#C4593E,#9A3B2A);color:#fff'),
  { background: 'linear-gradient(150deg,#C4593E,#9A3B2A)', color: '#fff' }
);
// vendor prefix -> React expects WebkitFontSmoothing (leading cap)
assert.deepStrictEqual(cssText('-webkit-font-smoothing:antialiased'), { WebkitFontSmoothing: 'antialiased' });
// empty / whitespace input
assert.deepStrictEqual(cssText(''), {});
assert.deepStrictEqual(cssText('  ;;  '), {});
console.log('cssText ok');
```

- [ ] **Step 2: Run it to confirm it fails**

Run:
```bash
node app/lib/cssText.test.mjs
```
Expected: FAIL — `Cannot find module './cssText.ts'` (or import error).

- [ ] **Step 3: Implement `cssText`**

Create `app/lib/cssText.ts`:
```ts
// Parses a CSS declaration string (as used verbatim in the Memo mockup's inline
// styles) into a React style object. Splits each declaration on its FIRST colon
// so gradient/url values with internal colons survive. kebab-case -> camelCase;
// a leading vendor dash (-webkit-) becomes a leading capital (Webkit...).
export type StyleObj = Record<string, string>;

export function cssText(s: string): StyleObj {
  const out: StyleObj = {};
  if (!s) return out;
  for (const decl of s.split(';')) {
    const t = decl.trim();
    if (!t) continue;
    const c = t.indexOf(':');
    if (c < 0) continue;
    const rawProp = t.slice(0, c).trim();
    const val = t.slice(c + 1).trim();
    if (!rawProp || !val) continue;
    const prop = rawProp.replace(/^-(webkit|moz|ms|o)-/i, (_m, v) => v.charAt(0).toUpperCase() + v.slice(1) + '-')
      .replace(/-([a-z])/g, (_m, ch) => ch.toUpperCase());
    out[prop] = val;
  }
  return out;
}
```

- [ ] **Step 4: Run the self-check — expect pass**

Run:
```bash
node app/lib/cssText.test.mjs
```
Expected: `cssText ok`

- [ ] **Step 5: Create `app/memo.css` (reset + keyframes, copied verbatim from the mockup's second `<style>` block)**

Create `app/memo.css`:
```css
* { box-sizing: border-box; }
.m-spine { transition: transform .42s cubic-bezier(.22,1,.36,1), box-shadow .42s ease, filter .42s ease; }
body { margin: 0; font-family: 'Caveat', 'Plus Jakarta Sans', system-ui, sans-serif; font-weight: 700; -webkit-font-smoothing: antialiased; background: #E4D8C2; }
a { color: #B5503C; text-decoration: none; }
a:hover { color: #8f3d2c; }
input, textarea, button { font-family: inherit; }
textarea { resize: none; }
@keyframes mSpin { to { transform: rotate(360deg); } }
@keyframes mSpinHalf { from { transform: translate(-50%,48%) rotate(0); } to { transform: translate(-50%,48%) rotate(360deg); } }
@keyframes mWave { 0%,100% { transform: scaleY(0.5); } 50% { transform: scaleY(1); } }
@keyframes mGlow { 0%,100% { opacity:.55; transform: scale(1); } 50% { opacity:.95; transform: scale(1.08); } }
@keyframes mFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
@keyframes mUp { from { opacity:0; transform: translateY(10px); } to { opacity:1; transform: translateY(0); } }
@keyframes mReel { to { transform: rotate(360deg); } }
@keyframes casReel { to { transform: rotate(360deg); } }
::-webkit-scrollbar { width: 0; }
.m-scroll { overflow-y: auto; }
```

- [ ] **Step 6: Add fonts + import memo.css in `root.tsx`**

In `app/root.tsx`, add `import "./memo.css";` after the existing `import "./app.css";`, and add these three entries to the array returned by `links`, after the existing Inter stylesheet entry:
```ts
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap",
  },
```

- [ ] **Step 7: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add app/lib/cssText.ts app/lib/cssText.test.mjs app/memo.css app/root.tsx
git commit -m "feat(style): cssText inline-style parser, memo.css reset+keyframes, mockup fonts"
```

---

## Task 3: Cassette component + shared visuals

**Files:**
- Create: `app/lib/memoVisuals.ts` (from R3)
- Create: `app/components/memo/Cassette.tsx`

Source: `.memo-design/Cassette.dc.html`. Takes one `idea` prop `{name,key,bpm,type,mood,duration,shell,glow,stripe,wavePoints,keyLow}` — exactly the shape `decoIdea()` (R3) returns.

- [ ] **Step 1: Create `app/lib/memoVisuals.ts`**

Copy the full contents of block **R3** above into `app/lib/memoVisuals.ts`.

- [ ] **Step 2: Transcribe `Cassette.dc.html` → `app/components/memo/Cassette.tsx`**

Apply the R1 protocol to `.memo-design/Cassette.dc.html`. The full component:
```tsx
import { cssText } from "~/lib/cssText";

export interface CassetteIdea {
  name: string; key: string; bpm: string; type: string; mood: string; duration: string;
  shell: string; glow: string; stripe: string; wavePoints: string; keyLow: boolean;
}

export function Cassette({ idea }: { idea: CassetteIdea }) {
  return (
    <div style={cssText("display:flex;flex-direction:column;cursor:grab;")}>
      <div style={cssText("position:relative;width:100%;aspect-ratio:8/5;")}>
        <div style={cssText(`position:absolute;inset:9%;border-radius:22px;background:${idea.glow};filter:blur(17px);opacity:.95;`)}></div>
        <div style={cssText(`position:absolute;inset:0;border-radius:13px;background:${idea.shell};box-shadow:0 15px 32px rgba(20,12,50,.34),inset 0 2px 3px rgba(255,255,255,.4),inset 0 -7px 15px rgba(0,0,0,.24);overflow:hidden;`)}>
          <div style={cssText("position:absolute;inset:0;background:linear-gradient(122deg,rgba(255,255,255,.46) 0%,transparent 32%,transparent 66%,rgba(0,0,0,.16) 100%);")}></div>
          <div style={cssText("position:absolute;top:0;left:13%;width:15%;height:100%;background:rgba(255,255,255,.18);transform:skewX(-12deg);")}></div>
          <div style={cssText("position:absolute;top:7px;left:7px;width:5px;height:5px;border-radius:50%;background:rgba(0,0,0,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);")}></div>
          <div style={cssText("position:absolute;top:7px;right:7px;width:5px;height:5px;border-radius:50%;background:rgba(0,0,0,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);")}></div>
          <div style={cssText("position:absolute;bottom:7px;left:7px;width:5px;height:5px;border-radius:50%;background:rgba(0,0,0,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);")}></div>
          <div style={cssText("position:absolute;bottom:7px;right:7px;width:5px;height:5px;border-radius:50%;background:rgba(0,0,0,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);")}></div>
          <div style={cssText("position:absolute;top:8%;left:8.5%;right:8.5%;height:37%;border-radius:5px;background:linear-gradient(180deg,#fcfbff,#efedf8);box-shadow:0 1px 2px rgba(0,0,0,.16);overflow:hidden;display:flex;flex-direction:column;")}>
            <div style={cssText(`height:4px;background:${idea.stripe};flex:none;`)}></div>
            <div style={cssText("flex:1;display:flex;align-items:center;padding:2px 8px;")}>
              <svg viewBox="0 0 100 24" preserveAspectRatio="none" style={cssText("width:100%;height:78%;display:block;")}><polygon points={idea.wavePoints} fill={idea.stripe}></polygon></svg>
            </div>
            <div style={cssText("flex:none;display:flex;align-items:center;gap:5px;padding:0 8px 4px;font-size:8px;font-weight:700;letter-spacing:.02em;color:#5b57a0;")}>{idea.key}<span style={cssText("opacity:.5;")}>·</span>{idea.bpm}</div>
          </div>
          <div style={cssText("position:absolute;bottom:10%;left:16%;right:16%;height:33%;border-radius:8px;background:radial-gradient(circle at 50% 40%,#2a2836,#0c0b14);box-shadow:inset 0 2px 5px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:space-between;padding:0 13%;")}>
            <div style={cssText("width:32%;aspect-ratio:1;border-radius:50%;background:conic-gradient(from 0deg,#e8dcc4 0 30deg,#c4b291 30deg 60deg,#e8dcc4 60deg 90deg,#c4b291 90deg 120deg,#e8dcc4 120deg 150deg,#c4b291 150deg 180deg,#e8dcc4 180deg 210deg,#c4b291 210deg 240deg,#e8dcc4 240deg 270deg,#c4b291 270deg 300deg,#e8dcc4 300deg 330deg,#c4b291 330deg 360deg);display:flex;align-items:center;justify-content:center;animation:casReel 5s linear infinite;")}><div style={cssText("width:34%;aspect-ratio:1;border-radius:50%;background:#0c0b14;")}></div></div>
            <div style={cssText("width:32%;aspect-ratio:1;border-radius:50%;background:conic-gradient(from 0deg,#e8dcc4 0 30deg,#c4b291 30deg 60deg,#e8dcc4 60deg 90deg,#c4b291 90deg 120deg,#e8dcc4 120deg 150deg,#c4b291 150deg 180deg,#e8dcc4 180deg 210deg,#c4b291 210deg 240deg,#e8dcc4 240deg 270deg,#c4b291 270deg 300deg,#e8dcc4 300deg 330deg,#c4b291 330deg 360deg);display:flex;align-items:center;justify-content:center;animation:casReel 3.4s linear infinite;")}><div style={cssText("width:52%;aspect-ratio:1;border-radius:50%;background:#0c0b14;")}></div></div>
          </div>
          <div style={cssText("position:absolute;bottom:8.5%;left:50%;transform:translateX(-50%);padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.94);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#4a4488;box-shadow:0 2px 5px rgba(0,0,0,.2);")}>{idea.type}</div>
        </div>
      </div>
      <div style={cssText("margin-top:11px;")}>
        <div style={cssText("display:flex;align-items:center;gap:6px;")}>
          <div style={cssText("font-size:14px;font-weight:700;letter-spacing:-.01em;color:#1c1c28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{idea.name}</div>
          {idea.keyLow && (
            <span title="key confidence low" style={cssText("flex:none;font-size:9px;font-weight:700;color:#b45309;background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.4);border-radius:6px;padding:1px 5px;")}>key?</span>
          )}
        </div>
        <div style={cssText("display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:6px;")}>
          <span style={cssText("font-size:10.5px;font-weight:700;color:#2c2c33;background:rgba(20,20,25,.07);border-radius:7px;padding:2px 7px;text-transform:capitalize;")}>{idea.type}</span>
          <span title="mood is inferred, not measured" style={cssText("font-size:10.5px;font-weight:600;font-style:italic;color:#8a8791;border:1px dashed rgba(120,118,128,.5);border-radius:7px;padding:2px 7px;")}>~ {idea.mood}</span>
          <span style={cssText("font-size:10.5px;font-weight:500;color:#8a8791;")}>{idea.duration}</span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/memoVisuals.ts app/components/memo/Cassette.tsx
git commit -m "feat(memo): Cassette component + shared palette/waveform visuals"
```

---

## Task 4: Backend additive functions + lyrics migration

**Files:**
- Create: `supabase/migrations/0003_add_idea_lyrics.sql`
- Modify: `app/lib/api/bank.ts`

All additive; rides existing owner-only RLS. No RLS changes.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0003_add_idea_lyrics.sql`:
```sql
alter table ideas add column lyrics text;
```

- [ ] **Step 2: Add read/update functions + thread title through `saveIdea`**

In `app/lib/api/bank.ts`:

Change `saveIdea`'s signature so the title is required and passed by the caller (it already is — the Record screen will pass the edited pending title; no default needed). It already accepts `title: string`. **No change needed to saveIdea** beyond confirming the caller passes a real title (done in Task 8). Add these new exports at the end of the file:
```ts
export async function getIdea(id: string) {
  const { data, error } = await supabase.from("ideas").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function updateIdeaLyrics(id: string, lyrics: string) {
  await supabase.from("ideas").update({ lyrics }).eq("id", id);
}

export async function getBrief(id: string) {
  const { data, error } = await supabase.from("vibe_briefs").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// Songs list with parent titles joined in one query (no new column). Supabase
// embeds related rows via the FK relationships declared in 0001_init.sql.
export async function listSongs() {
  const { data } = await supabase
    .from("songs")
    .select("*, ideas(title), vibe_briefs(source_track_name)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listSongsForIdea(ideaId: string) {
  const { data } = await supabase
    .from("songs")
    .select("*, vibe_briefs(source_track_name)")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getSong(id: string) {
  const { data, error } = await supabase
    .from("songs")
    .select("*, ideas(*), vibe_briefs(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_add_idea_lyrics.sql app/lib/api/bank.ts
git commit -m "feat(api): getIdea/getBrief/getSong/listSongs(+forIdea)/updateIdeaLyrics + lyrics column"
```

Note: the migration is applied to the live DB by the user via `npx supabase db push` (a manual step, per checkpoint.md). The code tolerates the column being absent only for reads that don't select it; Idea Detail's lyrics write needs it present, so remind the user to push before live-testing Task 7.

---

## Task 5: Routing shell + tab bar + Splash + Auth

**Files:**
- Rewrite: `app/routes.ts`
- Create: `app/routes/_shell.tsx`
- Create: `app/routes/splash.tsx`
- Create: `app/routes/auth.tsx`
- Delete (later, Task 14): `app/routes/_index.tsx`, `app/routes/login.tsx`

Source: `.memo-design/screen-00-splash.html`, `screen-09-auth.html`, `screen-10-tab-bar.html`, and the shared wrapper (top of `.memo-design/_template.html`, the status bar + desk/phone divs — **drop** the desk/phone/jumper chrome per spec Decision 2; keep only the status bar as an in-app element? No — the status bar is also phone-preview chrome. Drop it too. Each real screen renders directly into the viewport).

**Props (from `renderVals()` — the shell-level values):**
```
statusColor: darkRec ? '#e7e3ff' : '#17161B'   // only relevant to Record; compute locally there
showTabs: ['ideas','detail','songs','chooser','brief','builder','produce'].includes(route)
tabIdeas: tab(route==='ideas'||route==='detail')
tabSongs: tab(route==='songs'||route==='chooser'||route==='brief'||route==='builder')
tab = (on) => `display:flex;flex-direction:column;align-items:center;border:none;background:none;cursor:pointer;color:${on?'#17161B':'#a3a2ab'};font-size:17px;`
```
In RR7, `route` is derived from the current pathname (`useLocation().pathname`) instead of `state.route`.

- [ ] **Step 1: Rewrite `app/routes.ts`**

Replace `app/routes.ts` with:
```ts
import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  layout("routes/_shell.tsx", [
    index("routes/splash.tsx"),
    route("auth", "routes/auth.tsx"),
    route("ideas", "routes/ideas.tsx"),
    route("ideas/:id", "routes/ideas.$id.tsx"),
    route("record", "routes/record.tsx"),
    route("brief", "routes/brief.tsx"),
    route("songs", "routes/songs.tsx"),
    route("songs/new", "routes/songs.new.tsx"),
    route("songs/:id", "routes/songs.$id.tsx"),
  ]),
  route("produce/:songId", "routes/produce.tsx"),
] satisfies RouteConfig;
```
(Produce stays outside the shell — it is full-screen and manages its own chrome.)

- [ ] **Step 2: Create the shell with session guard + tab bar**

Create `app/routes/_shell.tsx`. The session guard carries `_index.tsx`'s existing pattern (redirect to `/auth` when no session), but the splash route (`/`) and `/auth` must render without a session, so the guard only redirects on the protected child routes.
```tsx
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";

const PUBLIC = new Set(["/", "/auth"]);

export default function Shell() {
  const loc = useLocation();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const isPublic = PUBLIC.has(loc.pathname); // produce lives outside this shell, so no /produce case needed here

  useEffect(() => {
    if (isPublic) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { nav("/auth", { replace: true }); return; }
      setReady(true);
    });
  }, [loc.pathname, isPublic, nav]);

  if (!ready) return null;

  const p = loc.pathname;
  const showTabs = p.startsWith("/ideas") || p.startsWith("/songs") || p.startsWith("/brief");
  const tab = (on: boolean) => cssText(`display:flex;flex-direction:column;align-items:center;border:none;background:none;cursor:pointer;color:${on ? "#17161B" : "#a3a2ab"};font-size:17px;`);
  const ideasOn = p === "/ideas" || p.startsWith("/ideas/");
  const songsOn = p.startsWith("/songs") || p.startsWith("/brief");

  return (
    <div style={cssText("position:relative;min-height:100vh;background:#EFE6D4;display:flex;flex-direction:column;")}>
      <Outlet />
      {showTabs && (
        <div style={cssText("position:fixed;bottom:0;left:0;right:0;height:80px;background:rgba(239,230,212,.92);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.06);display:flex;align-items:center;justify-content:space-around;padding-bottom:14px;z-index:50;")}>
          <button onClick={() => nav("/ideas")} style={tab(ideasOn)}>
            <span style={cssText("font-size:20px;")}>▚</span>
            <span style={cssText("font-size:11px;font-weight:700;margin-top:3px;")}>Ideas</span>
          </button>
          <button onClick={() => nav("/record")} style={cssText("display:flex;flex-direction:column;align-items:center;border:none;cursor:pointer;background:none;")}>
            <span style={cssText("width:52px;height:52px;border-radius:50%;background:#17161B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 6px 16px rgba(20,15,40,.25);")}>●</span>
          </button>
          <button onClick={() => nav("/songs")} style={tab(songsOn)}>
            <span style={cssText("font-size:20px;")}>♪</span>
            <span style={cssText("font-size:11px;font-weight:700;margin-top:3px;")}>Songs</span>
          </button>
        </div>
      )}
    </div>
  );
}
```
**Transcription note:** open `.memo-design/screen-10-tab-bar.html` and match the exact tab markup (icons `▚`/`●`/`♪`, labels `Ideas`/`Record`/`Songs`, sizes, the raised center record button). The block above reproduces the tab structure; adjust any pixel value that differs from the source file so it matches the mockup exactly.

- [ ] **Step 3: Create Splash**

Transcribe `.memo-design/screen-00-splash.html` into `app/routes/splash.tsx`. The mockup's splash auto-advances to auth after ~2.1s if still on splash, and `enterApp` (tap) goes to auth. Real behavior: on tap or after the beat, check session — go to `/ideas` if signed in, else `/auth`.
```tsx
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";

export default function Splash() {
  const nav = useNavigate();
  async function enter() {
    const { data } = await supabase.auth.getSession();
    nav(data.session ? "/ideas" : "/auth", { replace: true });
  }
  useEffect(() => {
    const t = setTimeout(enter, 2100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button onClick={enter} style={cssText("flex:1;min-height:100vh;width:100%;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:0;background:radial-gradient(120% 70% at 50% 36%,#F0E7D6 0%,#E4D8C2 60%,#DCCFB6 100%);")}>
      {/* Transcribe the logo tile + "Memo" + tagline + "tap to begin" from screen-00-splash.html here, verbatim */}
    </button>
  );
}
```
Fill the button's children by transcribing the mockup's splash inner markup (logo tile with the angular-M SVG, `Memo` wordmark, `Rescue the tune stuck in your head.`, `tap to begin`).

- [ ] **Step 4: Create Auth**

Transcribe `.memo-design/screen-09-auth.html` into `app/routes/auth.tsx`. Two states: `authForm` (email input + "Send magic link") and `authSent` ("Check your email" + "I clicked the link" → re-check session, and "Use a different email" → back to form). Wire to the existing `login.tsx` logic (`signInWithOtp`).

**Props (from renderVals):** `authForm: authStage==='form'`, `authSent: authStage==='sent'`, `sendLink`, `signIn` (→ go to ideas), `resetAuth`.
```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";

export default function Auth() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  async function sendLink() {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (!error) setSent(true);
  }
  async function signIn() {
    const { data } = await supabase.auth.getSession();
    if (data.session) nav("/ideas", { replace: true });
  }
  const resetAuth = () => setSent(false);
  return (
    <div style={cssText("flex:1;min-height:100vh;display:flex;flex-direction:column;")}>
      {/* Transcribe screen-09-auth.html: render the authForm block when !sent, the authSent block when sent.
          authForm: email <input value={email} onChange={e=>setEmail(e.target.value)}> + <button onClick={sendLink}>Send magic link</button>
          authSent: "Check your email." + <button onClick={signIn}>I clicked the link</button> + <button onClick={resetAuth}>Use a different email</button> */}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + build**

Run:
```bash
npm run typecheck && npm run build
```
Expected: build succeeds. (`_index.tsx`/`login.tsx` still exist and still compile; they are removed in Task 14. `routes.ts` no longer references them, so they are dead but harmless until then.)

- [ ] **Step 6: Commit**

```bash
git add app/routes.ts app/routes/_shell.tsx app/routes/splash.tsx app/routes/auth.tsx
git commit -m "feat(routes): shell (session guard + tab bar), splash, auth"
```

---

## Task 6: Ideas list

**Files:**
- Create: `app/routes/ideas.tsx`

Source: `.memo-design/screen-01-ideas.html`. Renders header, search input, filter chips, the "All ideas" rack of cassette spines, and the no-results state. **Omit the "crate" block** (`showCrate` → always `false`): it represents a folders/collections feature with no backend, and rendering fixture recordings as if they were the user's own would be a fake feature (spec: Phase B). Delete the `sc-if value="{{ showCrate }}"` block during transcription.

**Props (from renderVals, real-data adapted):**
```
ideas   = listIdeas()  ->  each row decorated via decoIdea(row, index)   // R3
query, onQuery         = local useState("")
filters = ['All','Vocal','Guitar','Bright','Warm'] each -> {label,onClick,style}
  active style: `flex:none;padding:9px 15px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid ${active?'transparent':'rgba(0,0,0,.1)'};background:${active?'#17161B':'#fff'};color:${active?'#fff':'#57565E'};`
match(d) = (!q || [name,key,bpm,type,mood].join(' ').toLowerCase().includes(q)) && (f==='All' || d.type===f.toLowerCase() || d.mood===f.toLowerCase())
shownSpines = matched ideas -> spineOf(d)
noResults = shown.length===0
ideaCount = ideas.length
```
`spineOf` (copied verbatim from renderVals, minus the `pullingId` animation state which becomes local):
```
spineStyle base = `position:relative;display:flex;align-items:center;width:100%;height:38px;border:none;padding:0;cursor:pointer;text-align:left;border-radius:3px;background:${d.shell};box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -2px 4px rgba(0,0,0,.25),0 2px 5px rgba(0,0,0,.35);`
pull-animation add-on when pulling: 'transform:translateX(54px) scale(1.04);box-shadow:-16px 14px 32px rgba(0,0,0,.5);z-index:9;filter:brightness(1.07);' else 'transform:translateX(0);'
```
Tapping a spine (`d.pull`) navigates to `/ideas/:id` (after the mockup's 440ms pull animation — keep the animation via a local `pullingId` state + `setTimeout`, then `navigate`).

- [ ] **Step 1: Transcribe + wire `ideas.tsx`**

Create `app/routes/ideas.tsx`. Load ideas in `useEffect` via `listIdeas()`. Decorate each row with `decoIdea(row, index)`. Implement `query`/filter client-side (identical `match` logic). Render the spine rack by transcribing `screen-01-ideas.html`'s `shownSpines` `sc-for` block. Wire the profile/settings button (top-right) to `navigate("/auth")` and each spine's tap to the pull-then-navigate handler.

Skeleton (fill the JSX from the source file):
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

  const ideas = rows.map((r, i) => decoIdea(r, i));
  const q = query.trim().toLowerCase();
  const match = (d: any) =>
    (!q || [d.name, d.key, d.bpm, d.type, d.mood].join(" ").toLowerCase().includes(q)) &&
    (filter === "All" || d.type === filter.toLowerCase() || d.mood === filter.toLowerCase());
  const shown = ideas.filter(match);

  const pull = (id: string) => { setPullingId(id); setTimeout(() => nav(`/ideas/${id}`), 440); };
  const spineStyle = (d: any) => cssText(
    `position:relative;display:flex;align-items:center;width:100%;height:38px;border:none;padding:0;cursor:pointer;text-align:left;border-radius:3px;background:${d.shell};box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -2px 4px rgba(0,0,0,.25),0 2px 5px rgba(0,0,0,.35);` +
    (pullingId === d.id ? "transform:translateX(54px) scale(1.04);box-shadow:-16px 14px 32px rgba(0,0,0,.5);z-index:9;filter:brightness(1.07);" : "transform:translateX(0);")
  );
  const filters = ["All", "Vocal", "Guitar", "Bright", "Warm"];
  const chip = (label: string) => { const active = filter === label; return cssText(`flex:none;padding:9px 15px;border-radius:20px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;border:1px solid ${active ? "transparent" : "rgba(0,0,0,.1)"};background:${active ? "#17161B" : "#fff"};color:${active ? "#fff" : "#57565E"};`); };

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      {/* Transcribe screen-01-ideas.html body here: header row, "Your ideas, on tape." h1, {ideaCount} sentence,
          search input (value={query} onChange), filter chips (filters.map), "All ideas" rack (shown.map spine),
          no-results block when shown.length===0. OMIT the showCrate block. Replace {{ }} per R1. */}
    </div>
  );
}
```
Note: the mockup's top padding was `56px` to clear the fake status bar; since we dropped the status bar, `24px` is used. Keep the rest of the padding/spacing identical to the source.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/routes/ideas.tsx
git commit -m "feat(ideas): cassette-rack library, live filter chips + search"
```

---

## Task 7: Idea Detail

**Files:**
- Create: `app/routes/ideas.$id.tsx`

Source: `.memo-design/screen-02-idea-detail.html`. Big Cassette, editable title, play take, full-width waveform, measured/inferred grid (Key/Tempo/Input + Mood, with `keyLow` badge), **notes + lyrics textareas**, derived songs list, "Build a song with this idea →".

**Props (renderVals `detail` block, real-data adapted):**
```
detail = getIdea(id) -> decoIdea(row) merged with:
  notes  = row.note   ?? ''      // DB column is singular `note`
  lyrics = row.lyrics ?? ''      // new column (Task 4)
  playIcon/playLabel = local play state
  songs  = listSongsForIdea(id) -> [{title from vibe_briefs.source_track_name}]
  hasSongs = songs.length>0
onTitle  -> renameIdea(id, value)      (onBlur / debounced onChange)
onNotes  -> updateIdeaNote(id, value)  (onBlur)
onLyrics -> updateIdeaLyrics(id, value)(onBlur)
detail.play -> ideaAudioUrl(row.raw_path) then new Audio(url).play()
detail.build -> navigate(`/songs/new?idea=${id}`)
goIdeas -> navigate('/ideas')
```

- [ ] **Step 1: Transcribe + wire `ideas.$id.tsx`**

Create `app/routes/ideas.$id.tsx`. Use `useParams()` for `id`. Load the idea via `getIdea(id)` + `listSongsForIdea(id)`. Render `<Cassette idea={decorated} />` (150px column). Title/notes/lyrics are `<input>`/`<textarea>` with `defaultValue` + `onBlur` writing through the API (mirrors the existing `BankList` pattern). The waveform `<polygon points={detail.wavePoints}>` uses the same decorated `wavePoints`. Transcribe the measured grid + mood dashed-box + notes/lyrics fields + derived-songs `sc-for` + build button from the source file.

Skeleton:
```tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { getIdea, ideaAudioUrl, renameIdea, updateIdeaNote, updateIdeaLyrics, listSongsForIdea } from "~/lib/api/bank";
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
  const d = decoIdea(row, 0);
  async function play() {
    const u = await ideaAudioUrl(row.raw_path);
    if (u) { new Audio(u).play(); setPlaying(true); }
  }
  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      {/* Transcribe screen-02-idea-detail.html:
          back button -> onClick={()=>nav('/ideas')}
          <Cassette idea={d} /> in the 150px column
          title <input defaultValue={d.name} onBlur={e=>renameIdea(id, e.target.value)}>
          play button -> onClick={play}, icon {playing?'❚❚':'▶'}, label {playing?'Playing':'Play take'}
          waveform <polygon points={d.wavePoints} fill={d.stripe}>
          grid Key/{d.keyLow && low-confidence badge}/Tempo/Input, mood dashed box "~ {d.mood}"
          notes <textarea defaultValue={row.note ?? ''} onBlur={e=>updateIdeaNote(id, e.target.value)}>
          lyrics <textarea defaultValue={row.lyrics ?? ''} onBlur={e=>updateIdeaLyrics(id, e.target.value)}>
          derived songs: songs.map(s => s.vibe_briefs?.source_track_name) rendered per the sc-for block, shown only when songs.length>0
          build button -> onClick={()=>nav(`/songs/new?idea=${id}`)} */}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/routes/ideas.$id.tsx
git commit -m "feat(ideas): idea detail — cassette, measured grid, notes+lyrics, derived songs"
```

---

## Task 8: Record + staged reveal

**Files:**
- Create: `app/routes/record.tsx`

Source: `.memo-design/screen-03-record.html` (the largest screen — idle cassette, live recording reels + waveform bars, analysing state, and the staged reveal sheet). This is the one screen where the mockup's fake state simulation (`startRec` fakes a timer with `setInterval`; `stopRec` fakes analysis with `setTimeout` then hardcodes `Restless idea`/`Vocal`/`96 BPM`/`C Major`/`hopeful`) must be replaced with the real MediaRecorder + `analyzeCapture` flow from the existing `RecordPanel.tsx`.

**State model (real):**
```
phase: 'idle' | 'recording' | 'analysing' | 'reveal'
recTime: live mm:ss.d from a real interval started on record()
On idle -> tap REC (cassette): getUserMedia, connect to shared analyser (optional), MediaRecorder.start, phase='recording', start timer
On stop: MediaRecorder.stop -> onstop: phase='analysing'; blob=new Blob(chunks); a=await analyzeCapture(blob); phase='reveal'
Reveal values come from the REAL analysis `a` (CaptureAnalysis): Input=a.inputType, Tempo=`${a.bpm} BPM`, Key=a.detectedKey, Mood=a.moodTag(inf)
Staged reveal: after phase='reveal', reveal rows appear one at a time (revealStep 1..4, 380ms apart) — pure presentation over already-resolved real values
pendingTitle: editable <input>, default a.moodTag-derived or 'Untitled idea'
Save -> saveIdea(blob, a, pendingTitle) -> navigate('/ideas')
saveAndEdit -> saveIdea(...) -> navigate(`/ideas/${saved.id}`)
Discard -> reset to idle (blob dropped)
```
**Props (renderVals record block, verbatim presentation helpers):**
```
recBg (dark gradient during recording/analysing) — copied verbatim
reelAnim / reelAnimB — 'animation:mReel 2.4s/3.6s linear infinite;' while recording/analysing
waveBars = Array.from({length:46}, ...) — copied verbatim (live bar meter decoration)
revealStats = [{Input,value},{Tempo,value},{Key,value},{Mood,value,inf:true}] with staged cell style
  cellBase + `opacity:${show?1:0};transform:translateY(${show?0:6}px);transition:all .4s ease;`
  valStyle: measured = 'font-size:17px;font-weight:800;color:#2E2418;...', inferred = italic '#9A5A3C'
similar = 4 static reference tracks — ponytail: static placeholder, no similarity backend exists (Phase B). Keep the markup, keep the fixture list.
saveBtnStyle: enabled once revealStep>=4
```

Reuse `RecordPanel.tsx`'s exact MediaRecorder wiring (getUserMedia try/catch, tap into `analyser.context` source, `ondataavailable`/`onstop`, `audio/webm` blob). The analyser comes from a module-level lazily-created Tone analyser (mirror `_index.tsx`'s `ensureAudio`), so the Visualizer bars can react — but per the mockup the live bars are CSS-animated decoration, so a real analyser is optional; if omitted, the bars still animate via `waveBars`.

- [ ] **Step 1: Transcribe + wire `record.tsx`**

Create `app/routes/record.tsx` with the real state machine above and transcribe the four visual phases from `screen-03-record.html`. Skeleton:
```tsx
import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { analyzeCapture } from "~/lib/audio/analyze";
import { saveIdea } from "~/lib/api/bank";
import { cssText } from "~/lib/cssText";
import type { CaptureAnalysis } from "~/lib/types";

export default function Record() {
  const nav = useNavigate();
  const rec = useRef<MediaRecorder>(undefined);
  const stream = useRef<MediaStream>(undefined);
  const chunks = useRef<Blob[]>([]);
  const blobRef = useRef<Blob>(undefined);
  const timer = useRef<number>(0);
  const [phase, setPhase] = useState<"idle" | "recording" | "analysing" | "reveal">("idle");
  const [recTime, setRecTime] = useState("00:00.0");
  const [analysis, setAnalysis] = useState<Omit<CaptureAnalysis, "id" | "cleanedAudioPath">>();
  const [revealStep, setRevealStep] = useState(0);
  const [pendingTitle, setPendingTitle] = useState("Untitled idea");

  async function start() {
    try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return; }
    chunks.current = [];
    rec.current = new MediaRecorder(stream.current);
    rec.current.ondataavailable = (e) => chunks.current.push(e.data);
    rec.current.onstop = async () => {
      stream.current?.getTracks().forEach((t) => t.stop());
      clearInterval(timer.current);
      setPhase("analysing");
      const blob = new Blob(chunks.current, { type: "audio/webm" });
      blobRef.current = blob;
      const a = await analyzeCapture(blob);
      setAnalysis(a);
      setPendingTitle(a.moodTag ? `${a.moodTag} idea` : "Untitled idea");
      setPhase("reveal");
      setRevealStep(0);
      [1, 2, 3, 4].forEach((n) => setTimeout(() => setRevealStep(n), n * 380));
    };
    rec.current.start();
    setPhase("recording");
    let ms = 0;
    timer.current = window.setInterval(() => {
      ms += 100; const s = Math.floor(ms / 1000), t = Math.floor((ms % 1000) / 100);
      setRecTime(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}.${t}`);
    }, 100);
  }
  const stop = () => rec.current?.stop();
  const discard = () => { blobRef.current = undefined; setPhase("idle"); setRecTime("00:00.0"); };
  async function save(edit: boolean) {
    if (!blobRef.current || !analysis) return;
    const saved = await saveIdea(blobRef.current, analysis, pendingTitle);
    nav(edit ? `/ideas/${saved.id}` : "/ideas");
  }

  const revealStats = analysis ? [
    { label: "Input", value: analysis.inputType, inf: false },
    { label: "Tempo", value: `${Math.round(analysis.bpm)} BPM`, inf: false },
    { label: "Key", value: analysis.detectedKey, inf: false },
    { label: "Mood", value: analysis.moodTag, inf: true },
  ] : [];

  return (
    <div style={cssText(`flex:1;min-height:100vh;display:flex;flex-direction:column;` + (phase === "recording" || phase === "analysing" ? "background:radial-gradient(120% 80% at 20% 0%,#3a2416 0,transparent 55%),radial-gradient(120% 80% at 85% 8%,#2c2013 0,transparent 52%),radial-gradient(130% 90% at 50% 110%,#3a1e12 0,transparent 55%),#161009;" : "background:#EFE6D4;"))}>
      {/* Transcribe screen-03-record.html:
          phase idle  -> cassette + REC button (onClick={start}), Cancel(onClick={()=>nav(-1)})
          phase recording/analysing -> spinning reels (reelAnim), live waveBars, recTime, status text, Stop(onClick={stop})
          phase reveal -> the reveal sheet: revealStats.map with staged cell opacity by revealStep,
            measured vs inferred value style, editable title <input value={pendingTitle} onChange>,
            play-take toggle, similar-vibes static list, Save(onClick={()=>save(false)}) enabled when revealStep>=4,
            "✎ Edit" (onClick={()=>save(true)}), Discard(onClick={discard}) */}
    </div>
  );
}
```
**Honesty note (spec):** the mockup has no analysis-failed / too-short / permission-denied visual, so those states are Phase B. Here, a `getUserMedia` rejection returns silently (as in the current `RecordPanel`) and an `analyzeCapture` throw will surface as an unhandled rejection — acceptable for Phase A parity with the mockup, flagged for Phase B (never-lose-audio fix).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/routes/record.tsx
git commit -m "feat(record): real MediaRecorder capture + staged analysis reveal, save/edit/discard"
```

---

## Task 9: Brief

**Files:**
- Create: `app/routes/brief.tsx`

Source: `.memo-design/screen-04-brief.html`. Three states: `briefResults` (search input + track results grid), `briefAnalysing` (picked track + "Finding the beat…"), `briefRecipe` (picked track + chord chips + section map + "Build a song with this brief →"). Wire to existing `VibeBriefPanel.tsx` logic (`searchTracks`, `fetchPreviewBlob`, `analyzeReference`, `saveBrief`).

**Props (renderVals brief block, real-data adapted):**
```
briefResults/briefAnalysing/briefRecipe = local phase state
tracks = searchTracks(q) results -> [{title:trackName, artist, art:artworkUrl, pick}]
pickTrack(t): phase='analysing'; blob=fetchPreviewBlob(t.previewUrl); a=analyzeReference(blob, t.trackName, 'itunes'); saved=saveBrief({...a, previewUrl}); phase='recipe'; keep saved.id
pickedTrack = the chosen track (art/title/artist)
briefChords = a.chordProgression.map(c=>c.chord)  (mockup fixture ['Bm','G','D','A'] -> real chords)
briefSections = a.sections.map((s,i)=>({label:s.label, flex: (weight), color: SEC_COLORS[i%5]}))
buildFromBrief -> navigate(`/songs/new?brief=${savedBriefId}`)
goSongs -> navigate('/songs')
```
Also support upload (existing `VibeBriefPanel.upload`): a file input that calls `analyzeReference(f, f.name, 'upload')` then `saveBrief(a)`.

- [ ] **Step 1: Transcribe + wire `brief.tsx`**

Create `app/routes/brief.tsx`. Skeleton:
```tsx
import { useState } from "react";
import { useNavigate } from "react-router";
import { searchTracks, fetchPreviewBlob } from "~/lib/api/tracks";
import { analyzeReference } from "~/lib/audio/analyze";
import { saveBrief } from "~/lib/api/bank";
import { SEC_COLORS } from "~/lib/memoVisuals";
import { cssText } from "~/lib/cssText";

type Track = { trackName: string; artist: string; artworkUrl: string; previewUrl: string };

export default function Brief() {
  const nav = useNavigate();
  const [phase, setPhase] = useState<"search" | "analysing" | "recipe">("search");
  const [q, setQ] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [picked, setPicked] = useState<Track>();
  const [recipe, setRecipe] = useState<any>();
  const [briefId, setBriefId] = useState<string>();

  async function search() { setTracks(await searchTracks(q)); }
  async function pick(t: Track) {
    setPicked(t); setPhase("analysing");
    const blob = await fetchPreviewBlob(t.previewUrl);
    const a = await analyzeReference(blob, t.trackName, "itunes");
    const saved = await saveBrief({ ...a, previewUrl: t.previewUrl });
    setRecipe(a); setBriefId(saved.id); setPhase("recipe");
  }
  async function upload(f: File) {
    setPhase("analysing");
    const a = await analyzeReference(f, f.name, "upload");
    const saved = await saveBrief(a);
    setPicked({ trackName: f.name, artist: "uploaded", artworkUrl: "", previewUrl: "" });
    setRecipe(a); setBriefId(saved.id); setPhase("recipe");
  }
  const chords = recipe ? recipe.chordProgression.map((c: any) => c.chord) : [];
  const sections = recipe ? recipe.sections.map((s: any, i: number) => ({ label: s.label, color: SEC_COLORS[i % SEC_COLORS.length] })) : [];

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      {/* Transcribe screen-04-brief.html:
          back -> nav('/songs'); "Reverse-engineer a song you love." heading
          search state: input value={q} onChange + Search onClick={search} + file input onChange -> upload; tracks.map results with pick
          analysing state: picked art/title/artist + "Finding the beat…"
          recipe state: picked identity + chords.map chips + sections.map colored bars + Build onClick={()=>nav(`/songs/new?brief=${briefId}`)} */}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/routes/brief.tsx
git commit -m "feat(brief): track search/upload -> analyse -> recipe, save vibe brief"
```

---

## Task 10: Songs list

**Files:**
- Create: `app/routes/songs.tsx`

Source: `.memo-design/screen-05-songs.html`. Header "What you've built.", "+ New song" → `/songs/new`, and a list of song cards each showing composed title + `A · {idea}` / `B · {brief}` parents, tapping → `/songs/:id`.

**Props (renderVals songs block, real-data adapted):**
```
songs = listSongs() -> each: {
  id, title: `${ideas.title} × ${vibe_briefs.source_track_name}`,
  idea: ideas.title, brief: vibe_briefs.source_track_name,
  open: () => navigate(`/songs/${id}`)
}
goChooser -> navigate('/songs/new')
```

- [ ] **Step 1: Transcribe + wire `songs.tsx`**

Create `app/routes/songs.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { listSongs } from "~/lib/api/bank";
import { cssText } from "~/lib/cssText";

export default function Songs() {
  const nav = useNavigate();
  const [songs, setSongs] = useState<any[]>([]);
  useEffect(() => { listSongs().then(setSongs); }, []);
  const view = songs.map((s) => ({
    id: s.id,
    idea: s.ideas?.title ?? "Idea",
    brief: s.vibe_briefs?.source_track_name ?? "Brief",
    title: `${s.ideas?.title ?? "Idea"} × ${s.vibe_briefs?.source_track_name ?? "Brief"}`,
  }));
  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      {/* Transcribe screen-05-songs.html: "What you've built." heading + "+ New song"(onClick={()=>nav('/songs/new')})
          + view.map(s => card with s.title, "A · "+s.idea, "B · "+s.brief, onClick={()=>nav(`/songs/${s.id}`)}) */}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/routes/songs.tsx
git commit -m "feat(songs): built-songs list with parent idea/brief"
```

---

## Task 11: Chooser

**Files:**
- Create: `app/routes/songs.new.tsx`

Source: `.memo-design/screen-06-chooser.html`. "Pick an idea and a brief." — a horizontal row of idea cassettes (`chooserIdeas`, each a `<Cassette>`), a list of briefs (`chooserBriefs`, with a `cached`/`›` badge), and a build button enabled once one of each is picked. Honors query-param preselection (`?idea=`, `?brief=`) from Idea Detail / Brief.

**Props (renderVals chooser block, real-data adapted):**
```
chooserIdeas = listIdeas() -> decoIdea, wrap style with 3px outline when selected
chooserBriefs = listBriefs() -> {id, title:source_track_name, artist? , art?, badge/badgeText}  // no artwork stored -> use a gradient placeholder or omit art
selected idea/brief in local state; preselect from useSearchParams (?idea, ?brief)
ready = idea!=null && brief!=null
buildBtnLabel = ready ? 'Build song →' : 'Pick one of each to build'
buildFromChooser -> startBuild: navigate to `/songs/:id` AFTER creating the song? No — the song doesn't exist yet.
  Instead: navigate(`/songs/new-build?idea=..&brief=..`)? Simpler: pass the picked ids to the Builder via
  navigate(`/songs/build?idea=${ideaId}&brief=${briefId}`). But routes.ts has /songs/:id only.
  DECISION: Chooser performs the build itself (buildSong -> saveSong) and then navigate(`/songs/${savedId}`).
```
**Build-on-chooser detail:** the Chooser's build button runs the real arrangement (needs both `idea` row and `brief` row), then navigates to the Builder with the real song id. This keeps the Builder a pure viewer of an existing song. Load the full idea/brief rows (not just decorated) for `buildSong`.

- [ ] **Step 1: Transcribe + wire `songs.new.tsx`**

Create `app/routes/songs.new.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { listIdeas, listBriefs, saveSong } from "~/lib/api/bank";
import { buildSong } from "~/lib/api/arrange";
import { buildMidi } from "~/lib/audio/midi";
import { decoIdea } from "~/lib/memoVisuals";
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

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      {/* Transcribe screen-06-chooser.html:
          back -> nav('/songs'); "Pick an idea and a brief." heading
          idea row: ideas.map(i => decoIdea) -> <Cassette idea={..}/> wrapped in a button with selected-outline when i.id===ideaId, onClick sets ideaId
          brief list: briefs.map(b => row with source_track_name, badge, onClick sets briefId, selected border when b.id===briefId)
          build button: label {ready?'Build song →':'Pick one of each to build'}, disabled unless ready, onClick={build} */}
    </div>
  );
}
```
**Note:** briefs have no stored artwork; where the mockup shows a track `art` gradient, use a neutral gradient placeholder (e.g. the idea palette) — do not fetch external artwork. This is a faithful-enough port (the mockup's brief art is itself fixture).

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/routes/songs.new.tsx
git commit -m "feat(chooser): pick idea+brief (preselect via query), run arrangement, open builder"
```

---

## Task 12: Builder

**Files:**
- Create: `app/routes/songs.$id.tsx`

Source: `.memo-design/screen-07-builder.html`. `builderComplete` state (the song exists): title `{idea} × {brief}`, key/bpm, the **structure map** (sections in order, each opening to its chords — structure leads per UX §3.5), instrumentation chips, a transport with play/pause + section indicator + stage-breakdown timings, "Export .mid", "Open in openDAW". The mockup's `builderBuilding` state does not occur here (the build already happened in the Chooser); this route always loads a complete song. (If you navigate here for a song id that exists, show complete; there is no in-Builder build step.)

**Props (renderVals builder block, real-data adapted):**
```
song = getSong(id) with embedded ideas(*), vibe_briefs(*)
builtIdea = ideas.title; builtBrief = vibe_briefs.source_track_name; builtTitle = `${builtIdea} × ${builtBrief}`
songKey = ideas.key; songBpm = `${ideas.bpm} BPM`
structure = song.structure_json -> [{label, order, chords: chordChart chords for that section}] with SEC_COLORS[i%5]
  chords per section: group song.chordchart_json by section label/order
instrumentation = song.instrumentation_json
stages = derived timings: [
  {label:'captured', time:'0:00'},
  {label:'analysed', time:'0:00'},   // collapses into captured (spec) — no separate stamp
  {label:'brief',    time: fmt(vibe_briefs.created_at - ideas.created_at)},
  {label:'built',    time: fmt(songs.created_at - ideas.created_at)},
]  // fmt -> m:ss, clamp negatives to 0:00
songPlaying toggles playSong(chordChart, ideas.bpm, analyser); section highlight = mockup's curSec (index 2 while playing).
  ponytail: real playback position->section tracking is Phase B; keep the mockup's simple highlight-while-playing.
exportSong -> ProducePanel's existing signed-URL download: createSignedUrl('midi', song.midi_path) -> window.open
goProduce -> navigate(`/produce/${id}`)
goSongs -> navigate('/songs')
```
`fmt(msDiff)`:
```ts
const fmt = (a: string, b: string) => {
  const d = Math.max(0, (new Date(a).getTime() - new Date(b).getTime()) / 1000);
  return `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, "0")}`;
};
```

- [ ] **Step 1: Transcribe + wire `songs.$id.tsx`**

Create `app/routes/songs.$id.tsx`:
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
  useEffect(() => { if (id) getSong(id).then(setSong); }, [id]);
  if (!song || !id) return null;

  const idea = song.ideas, brief = song.vibe_briefs;
  const chart: any[] = song.chordchart_json ?? [];
  const structure = (song.structure_json ?? []).map((s: any, i: number) => ({
    label: s.label, order: s.order, color: SEC_COLORS[i % SEC_COLORS.length],
    chords: chart.filter((c) => c.section === s.label).map((c) => c.chord),
  }));
  const instrumentation: string[] = song.instrumentation_json ?? [];
  const fmt = (a: string, b: string) => { const d = Math.max(0, (new Date(a).getTime() - new Date(b).getTime()) / 1000); return `${Math.floor(d / 60)}:${String(Math.floor(d % 60)).padStart(2, "0")}`; };
  const stages = [
    { label: "captured", time: "0:00" },
    { label: "analysed", time: "0:00" },
    { label: "brief", time: brief ? fmt(brief.created_at, idea.created_at) : "—" },
    { label: "built", time: fmt(song.created_at, idea.created_at) },
  ];
  async function exportMidi() {
    if (!song.midi_path) return;
    const { data } = await supabase.storage.from("midi").createSignedUrl(song.midi_path, 3600);
    if (data) window.open(data.signedUrl);
  }
  const togglePlay = () => { if (!playing) playSong(chart, idea.bpm); setPlaying((p) => !p); };

  return (
    <div className="m-scroll" style={cssText("flex:1;padding:24px 22px 120px;")}>
      {/* Transcribe screen-07-builder.html (builderComplete branch only):
          back -> nav('/songs'); title `${idea.title} × ${brief?.source_track_name}`; key {idea.key} / bpm
          structure.map(sec => section row colored SEC_COLORS, sec.label, sec.chords.map chips, highlight when playing && index===2)
          instrumentation.map chips
          transport: play/pause onClick={togglePlay} icon {playing?'❚❚':'▶'}, section indicator, stages breakdown "vs ~3–4 hrs by hand"
          Export .mid onClick={exportMidi}; Open in openDAW onClick={()=>nav(`/produce/${id}`)} */}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/routes/songs.$id.tsx
git commit -m "feat(builder): structure-led song view, playback, stage breakdown, export + openDAW handoff"
```

---

## Task 13: Produce (openDAW) restyle

**Files:**
- Modify: `app/routes/produce.tsx` (JSX/CSS layer only — the SDK/engine/import/export logic is untouched)

Source: `.memo-design/screen-08-produce-opendaw.html`. The existing `produce.tsx` (472 lines) already drives the real headless openDAW SDK (transport, piano roll, instrument picker, export). This task **only** wraps its existing controls in the mockup's PRODUCE markup — matching the transport bar, the two-lane piano-roll frame, the instrument-picker chips, the export button, and the graceful-fallback note. Do **not** alter any engine/box-graph/import/export logic, event handlers, or the WASM lifecycle — only the surrounding presentational JSX and inline styles.

**Mapping (mockup → existing produce.tsx):**
```
prodTracks (Melody/Chords lanes with notes)  -> the existing PianoRoll render (keep real note data; adopt the mockup's lane frame/coloring)
prodInstruments (chips per track)            -> the existing InstrumentPicker (keep real factory-swap handler; restyle to chips)
toggleProd / prodPlayIcon                    -> the existing TransportControls play/stop
Export .mid                                  -> the existing export/signed-URL action
backToBuilder -> navigate(`/songs/${songId}`) (or back)
graceful fallback note -> keep the mockup's copy verbatim
```

- [ ] **Step 1: Restyle produce.tsx to the mockup PRODUCE markup**

Wrap the existing components/handlers in the transcribed markup from `screen-08-produce-opendaw.html`. Keep every existing hook, ref, engine call, and effect exactly as-is; change only the JSX structure and `style`/`className` around them. Where the mockup shows decorative note blocks (`prodTracks[].notes` via `seedNotes`), render the **real** piano-roll from the existing code inside that frame rather than the seeded decoration.

- [ ] **Step 2: Typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: success.

- [ ] **Step 3: Commit**

```bash
git add app/routes/produce.tsx
git commit -m "style(produce): wrap existing openDAW editor in mockup PRODUCE chrome (logic unchanged)"
```

---

## Task 14: Retire old panels + final verification

**Files:**
- Delete: `app/routes/_index.tsx`, `app/routes/login.tsx`
- Delete: `app/components/RecordPanel.tsx`, `app/components/BankList.tsx`, `app/components/VibeBriefPanel.tsx`, `app/components/SongBuilderPanel.tsx`, `app/components/ProducePanel.tsx`, `app/components/Timer.tsx`, `app/components/Visualizer.tsx`
- Keep: everything in `app/lib/**`, `app/components/opendaw/**`, `app/components/memo/**`

- [ ] **Step 1: Confirm nothing still imports the retired files**

Run:
```bash
cd "C:/Users/Yeriel Putra Harsono/Documents/Claude/projects/Lyra/memo"
grep -rEl "RecordPanel|BankList|VibeBriefPanel|SongBuilderPanel|ProducePanel|components/Timer|components/Visualizer|routes/_index|routes/login" app --include=*.tsx --include=*.ts
```
Expected: no output (the new routes don't import them; `produce.tsx` uses `components/opendaw/*`, not these). If any file is listed, fix that import before deleting.

- [ ] **Step 2: Delete the retired files**

Run:
```bash
git rm app/routes/_index.tsx app/routes/login.tsx \
  app/components/RecordPanel.tsx app/components/BankList.tsx app/components/VibeBriefPanel.tsx \
  app/components/SongBuilderPanel.tsx app/components/ProducePanel.tsx app/components/Timer.tsx app/components/Visualizer.tsx
```

- [ ] **Step 3: Final typecheck + build + midi check**

Run:
```bash
npm run typecheck && npm run build && npm run check-midi
```
Expected: all three pass (`check-midi` confirms the MIDI pipeline the Builder/Produce screens depend on is still intact).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: retire pre-port unstyled panels; core loop now fully on ported screens"
```

- [ ] **Step 5: Update CLAUDE.md file map**

In `CLAUDE.md`, replace the `app/components/*` and `routes/*` sections of the file map to reflect the new route-per-screen structure (splash, auth, ideas, ideas.$id, record, brief, songs, songs.new, songs.$id, produce; `_shell.tsx`; `components/memo/Cassette.tsx`; `lib/memoVisuals.ts`, `lib/cssText.ts`). Add a Decisions entry dated 2026-07-21 noting the Memo.html port (Phase A) and that the crate, similar-vibes, analysis-failure/too-short/permission states, real waveform peaks, and offline/install/delete features are deferred to Phase B.

Run:
```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md file map + decisions for frontend port"
```

---

## Manual live-verification checklist (user, after deploy)

Not blocking code completion, but the port is only *proven* in a real cross-origin-isolated browser (checkpoint.md's standing caveat). After `npx supabase db push` (for `0003`) and `npx wrangler pages deploy build/client`:

1. Splash → Auth → magic link → Ideas (session persists on reload — J2).
2. Record: mic permission, live reels/timer, staged reveal shows **real** key/tempo/input + inferred mood, save → appears in Ideas.
3. Idea Detail: title/notes/lyrics edits persist (reload to confirm); lyrics needs `0003` pushed.
4. Brief: search a track → recipe with real chords/sections; upload path.
5. Chooser (from Idea Detail's build) → build runs → Builder opens with real structure/chords/stages.
6. Builder: play, export .mid downloads, "Open in openDAW".
7. Produce: engine/worklet boot (the single biggest unconfirmed risk — CLAUDE.md gotchas), piano-roll edit, export round-trip.
8. PWA install to home screen, launches standalone.

---

## Self-review notes (author)

- **Spec coverage:** every screen in the spec's screen→route map has a task (Tasks 5–13); backend additions (Task 4) match the spec's "new/changed backend surface"; lyrics migration (Decision 5) is Task 4; `listSongs`/`getSong` (Decision 4) is Task 4; fonts (Decision 3) is Task 2; preview chrome dropped (Decision 2) is enforced in Tasks 5–6 padding notes; transcribe-to-JSX (Decision 1) is the R1 protocol.
- **Deferred-with-reason (spec scope rule):** crate (Task 6), similar-vibes static (Task 8), analysis-failure/too-short/permission states (Task 8 note), real peaks (R3 comment), section-position tracking (Task 12 note), analysed-stage collapse (Task 12) — all match the spec's Phase B list.
- **Type consistency:** `decoIdea`/`wavePoints`/`seedFromId`/`PAL`/`SEC_COLORS` defined once (R3/Task 3), imported everywhere; `cssText` defined Task 2, used everywhere; new `bank.ts` functions defined Task 4, consumed Tasks 6–12 with matching names (`getIdea`, `getBrief`, `getSong`, `listSongs`, `listSongsForIdea`, `updateIdeaLyrics`).
