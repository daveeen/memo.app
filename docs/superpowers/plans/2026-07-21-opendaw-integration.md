# openDAW Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/produce` stub with a real editor: load a song's `.mid` into openDAW's headless audio engine, play it, do basic note editing (move/resize/delete regions, swap instrumentation), export back to `.mid` overwriting the same storage path.

**Architecture:** Headless SDK (`@opendaw/studio-core`'s `ProjectApi` + `EngineFacade`, `@opendaw/studio-core-wasm`'s prebuilt WASM engine, `@opendaw/lib-midi`'s decoder) driving a custom lightweight React editor — not a mounted openDAW UI (none exists in the published packages; see spec for why). MIDI stays the interchange format; no native `.dawproject` work.

**Tech Stack:** `@opendaw/studio-sdk` (already installed, pulls in `studio-core`, `studio-core-wasm`, `lib-midi`, `lib-box`), React Router 7, Supabase Storage.

**Reference spec:** `docs/superpowers/specs/2026-07-21-opendaw-integration-design.md`

**Adaptation note:** openDAW's published API is pre-1.0 (`0.0.16x`) and its exact call signatures were confirmed only by method/type NAMES existing in `.d.ts` files during research, not by reading full signatures or executing them (no live browser in this build environment, and the WASM engine cannot run in plain Node the way essentia.js's could — it needs `SharedArrayBuffer`/cross-origin-isolation that only a real browser page provides). **Task 1 is a spike that must read the actual `.d.ts` files and confirm/adjust every signature below before later tasks build on it** — this mirrors exactly how the original build's Essentia and Tone.js integrations found and fixed wrong API assumptions from their own draft code. Do not skip Task 1's verification step.

**No live browser in this build environment** — every task's verification is `npm run typecheck` / `npm run build` plus, where the code is pure/pluggable, a Node-level logic check. Anything requiring the actual WASM engine to boot, real audio playback, drag interactions, or the Supabase Storage COEP fetch needs a live-browser pass the user runs themselves. Say so explicitly in each task's report rather than claiming success that wasn't observed.

---

### Task 1: Confirm the real openDAW API (spike)

**Files:**
- None created/modified — this is a read-only investigation task. Its output is a short findings note appended to the bottom of this plan file (Step 5) that later tasks must be read against, since their draft code may need adjusting to match what's actually found.

- [ ] **Step 1: Read the real type declarations**

In `c:\Users\Yeriel Putra Harsono\Documents\Claude\projects\Lyra\memo\node_modules\@opendaw\`, read (in full, not just grep):
- `studio-core/dist/project/ProjectApi.d.ts` — exact method signatures for creating note tracks, note regions/events, instruments, setting tempo.
- `studio-core/dist/**/EngineFacade.d.ts` (path may differ slightly — find it) — exact `play`/`stop`/`setPosition` signatures and how you obtain an `EngineFacade` instance from a project.
- `studio-core-wasm`'s package — how `WasmEngine.install(...)` is actually called (what config object it expects, where the prebuilt wasm/js assets live inside the package's own `dist/`), and confirm the exact exported name (`WasmEngine` or something else).
- `lib-midi/dist/MidiFileDecoder.d.ts` — exact `decode()` input/output shape (does it take an `ArrayBuffer`? a `Uint8Array`? what does the returned `MidiFileFormat` look like — track list, note event shape with pitch/start/duration/velocity fields?).
- `lib-box` — skim for whatever underlying data-model types `ProjectApi` methods return/expect (e.g. box handles/ids you need to hold onto to later mutate or delete a region).

- [ ] **Step 2: Confirm how a fresh project is created**

Find the actual entry point for constructing a new/empty project that `ProjectApi` methods operate on (likely something in `studio-core`'s project module — a `Project.create()`-style static or a class you instantiate). This is the one piece the research summary didn't pin down precisely.

- [ ] **Step 3: Confirm the WASM asset paths**

Find the actual file list under `node_modules/@opendaw/studio-core-wasm/dist/` (or wherever its build output lives) — the exact filenames (`wasm-processor.js`, `wasm-offline-worker.js`, `engine.wasm`, plugin `.wasm` files, etc.) that Task 3 will need to copy into this project's `public/` directory.

- [ ] **Step 4: Try a Node-level sanity import**

Confirm which of these packages can even be `import`-ed under plain Node without throwing (some, like the WASM engine itself, will almost certainly need a real browser — `SharedArrayBuffer`/AudioWorklet don't exist in Node — but `ProjectApi`/`lib-midi`/`lib-box`'s pure data-model code might import cleanly). Use the same umd-build-under-Node approach that worked for essentia.js in the original build if the `.d.ts`-only inspection leaves real ambiguity about a signature — don't force it if it genuinely needs a browser, just note what you could and couldn't execute.

- [ ] **Step 5: Write the findings note**

Append a `## Task 1 findings` section to the bottom of this plan file (`docs/superpowers/plans/2026-07-21-opendaw-integration.md`) with: the exact confirmed signatures for everything in Steps 1-3, and explicitly call out anywhere a later task's draft code (Tasks 4, 5, 7, 8, 9 below) needs to change because the real API differs from what's drafted. Commit this findings note on its own.

```bash
git add docs/superpowers/plans/2026-07-21-opendaw-integration.md
git commit -m "docs: openDAW API spike findings"
```

- [ ] **Step 6: If the API is genuinely undiscoverable**

If after real effort (not a token gesture) the core pieces (project creation, note region creation, engine install) are NOT findable from types/docs/dist inspection — e.g. minified with no `.d.ts`, or the shapes are too deeply generic to use without a live REPL — STOP and report BLOCKED rather than guessing. This would mean falling back to the `.mid`-download-only path (already shipped, Task 8.1 of the original build) and this feature needs to be re-scoped with the user. This is a real, sanctioned possible outcome per the spec's own risk section — don't force through it.

---

### Task 2: Routing — `/produce/:songId`

**Files:**
- Modify: `app/routes.ts`
- Modify: `app/components/SongBuilderPanel.tsx`
- Modify: `app/components/ProducePanel.tsx`
- Modify: `app/routes/_index.tsx`

- [ ] **Step 1: Read all four files in full first**

They've each evolved since their original tasks (SongBuilderPanel gained an `onBuilt` callback in a follow-up fix; ProducePanel was wired into the dashboard in a follow-up fix; `_index.tsx` has accumulated several rounds of prop wiring). Confirm current exact state before editing any of them.

- [ ] **Step 2: Update the route registration**

In `app/routes.ts`, change the produce route registration from `route("produce", "routes/produce.tsx")` to:

```ts
route("produce/:songId", "routes/produce.tsx")
```

- [ ] **Step 3: `SongBuilderPanel` passes `songId` through `onBuilt`**

Find the current `onBuilt?.(midiPath)` call (added in the dashboard-wiring follow-up task) and its prop type `onBuilt?: (midiPath: string) => void`. Change both to pass the song id too — `saveSong`'s return already includes `{ song, midiPath }` where `song.id` is the new song's id:

```ts
onBuilt?: (songId: string, midiPath: string) => void;
// ...
onBuilt?.(song.id, midiPath);
```

(Use the real local variable names from `saveSong`'s destructured return in the current file — don't assume `song`/`midiPath` are exactly how they're currently named without checking.)

- [ ] **Step 4: `ProducePanel` takes a `songId` prop and links correctly**

Current props are `{ midiPath?: string }`. Change to `{ songId?: string; midiPath?: string }`, and change the existing `<a href="/produce">` to:

```tsx
{songId && <a href={`/produce/${songId}`}>Open in openDAW →</a>}
```

(Only render the link when a real `songId` exists — no more dead link to a page with nothing to load.)

- [ ] **Step 5: Dashboard threads `songId` through**

In `app/routes/_index.tsx`, add `const [songId, setSongId] = useState<string>();` alongside the existing `midiPath` state, update the `SongBuilderPanel`'s `onBuilt` handler to `(id, path) => { setSongId(id); setMidiPath(path); }`, and pass `songId={songId}` to `ProducePanel` alongside its existing `midiPath={midiPath}`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 7: Commit**

```bash
git add app/routes.ts app/components/SongBuilderPanel.tsx app/components/ProducePanel.tsx app/routes/_index.tsx
git commit -m "feat(produce): route + wire songId through to openDAW link"
```

---

### Task 3: WASM engine asset pipeline + singleton loader

**Files:**
- Create: `app/lib/opendaw/engine.ts`
- Modify: `vite.config.ts` (only if Task 1's findings show the WASM/worker files need the same `optimizeDeps`/`worker` treatment essentia.js needed — check, don't assume)
- Possibly create a `scripts/copy-opendaw-wasm.mjs` or a `postinstall`/`prebuild` npm script, depending on what Task 1 found about the real asset file list — decide the exact mechanism against Task 1's findings, not against a guess written before that task ran.

- [ ] **Step 1: Re-read Task 1's findings note** (bottom of this plan file) for the exact WASM asset file list and `WasmEngine.install()` config shape before writing anything.

- [ ] **Step 2: Write the copy mechanism**

Based on Task 1's findings, add whatever copies `@opendaw/studio-core-wasm`'s prebuilt assets into `public/opendaw-wasm/` so they're served same-origin (required — cross-origin WASM/worker assets would fight the project's COEP `require-corp` header set in `public/_headers`). Prefer the simplest mechanism that fits the codebase's existing conventions (check how `public/icon-512.png` was generated/placed in the original build for the project's general "keep it simple" bar) — a plain Node copy script run via an npm `predev`/`prebuild` hook is likely sufficient; don't reach for a Vite plugin unless the files need transformation, not just copying.

- [ ] **Step 3: Write the engine singleton loader**, following the exact lazy-singleton pattern already established in `app/lib/audio/essentia.ts` (read that file first for the pattern) — adjusted for whatever Task 1 found about `WasmEngine.install()`/`ensureReady()`'s real signature:

```ts
// app/lib/opendaw/engine.ts
// Adjust import path/names and the install()/ensureReady() call shape to match
// Task 1's findings note at the bottom of docs/superpowers/plans/2026-07-21-opendaw-integration.md
let _engineReady: Promise<void> | null = null;

export function ensureOpenDawEngine(audioContext: AudioContext): Promise<void> {
  if (!_engineReady) {
    _engineReady = (async () => {
      // TODO(Task 1 findings): real WasmEngine.install(...) call + asset base path
      // TODO(Task 1 findings): real ensureReady(audioContext) call
    })();
  }
  return _engineReady;
}
```

Fill in the two `TODO` bodies with the real calls from Task 1's findings — do not leave them as TODOs in the committed code; they're written as placeholders here only because this plan step is written before Task 1 runs. If Task 1's findings aren't available yet when this task executes, re-run Task 1 first.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0. This cannot verify the engine actually boots (needs a live browser + real cross-origin-isolated page) — say so.

- [ ] **Step 5: Commit**

```bash
git add app/lib/opendaw/engine.ts vite.config.ts public/
git commit -m "feat(opendaw): WASM engine asset pipeline + singleton loader"
```

---

### Task 4: MIDI import — decode `.mid` into a project

**Files:**
- Create: `app/lib/opendaw/importMidi.ts`

- [ ] **Step 1: Re-read Task 1's findings** for `MidiFileDecoder`'s real decode signature and `ProjectApi`'s real note-track/note-region creation signatures.

- [ ] **Step 2: Write the import function**

```ts
// app/lib/opendaw/importMidi.ts
// Signatures below are drafts pending Task 1's findings — adjust decode() input
// type, MidiFileFormat shape, and ProjectApi method signatures to match exactly.
export async function importMidiIntoProject(project: /* real Project type */ any, midiBytes: ArrayBuffer) {
  // decode midiBytes via @opendaw/lib-midi's MidiFileDecoder
  // for each track in the decoded file (melody, chords — mirrors app/lib/audio/midi.ts's
  // two-track output): create a note track via ProjectApi, then create a note region/event
  // per decoded note (pitch, start time, duration)
}
```

Base the two-track expectation (melody + chords) on `app/lib/audio/midi.ts`'s `buildMidi()` — read that file first to confirm it still produces exactly two tracks named `"melody"` and `"chords"` (or whatever its current track names are) before assuming that structure here.

- [ ] **Step 3: Node-level logic check where possible**

If Task 1 confirmed `lib-midi`'s decoder can run under plain Node (per Task 1 Step 4), write a small scratch script (not committed) that decodes a `.mid` file built by the EXISTING `scripts/check-midi.mjs`'s `buildMidi()` call and confirms the decoded note count/pitches match what was encoded — a real roundtrip check, same spirit as `check-midi.mjs` itself. If the decoder needs a browser, skip this and say so.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/lib/opendaw/importMidi.ts
git commit -m "feat(opendaw): MIDI import into project"
```

---

### Task 5: MIDI export — read edited project back to `.mid`

**Files:**
- Create: `app/lib/opendaw/exportMidi.ts`

- [ ] **Step 1: Read `app/lib/audio/midi.ts` in full** — this task reuses its note-to-MIDI-byte building logic rather than duplicating it. Decide, based on how close the shapes actually are once Task 1's findings are known, whether to (a) extract a small shared helper both files call, or (b) write a parallel function here that constructs the same `{pitch, startSec, durSec}`-shaped intermediate array from the project's current note events and then calls `buildMidi`'s existing note-building code directly. Prefer (b) if it avoids touching the already-working, already-tested `midi.ts` — only do (a) if the duplication would otherwise be substantial.

- [ ] **Step 2: Write the export function**

```ts
// app/lib/opendaw/exportMidi.ts
// Reads the current project's note events (real accessor confirmed in Task 1's
// findings) and converts them into the {pitch, startSec, durSec}[] + chordChart
// shapes app/lib/audio/midi.ts's buildMidi() already knows how to turn into bytes.
import { buildMidi } from "~/lib/audio/midi";

export function exportProjectToMidi(project: /* real Project type */ any, bpm: number): Uint8Array {
  // walk project's tracks/regions/note events (real API from Task 1 findings)
  // reconstruct notes[] and chordChart[] in the shapes buildMidi() expects
  // return buildMidi(notes, chordChart, bpm)
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/lib/opendaw/exportMidi.ts
git commit -m "feat(opendaw): MIDI export from edited project"
```

---

### Task 6: `produce.tsx` route — load, init, error states

**Files:**
- Modify: `app/routes/produce.tsx` (currently the Task 8.2 stub — replace its body)

- [ ] **Step 1: Read the current stub file in full**, plus `app/lib/api/bank.ts` (for the RLS-scoped song-lookup pattern to follow) and `app/lib/supabase.ts`.

- [ ] **Step 2: Write the route**, wiring together Tasks 2-5's pieces. Real behavior, not a sketch:

```tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { supabase } from "~/lib/supabase";
import { ensureOpenDawEngine } from "~/lib/opendaw/engine";
import { importMidiIntoProject } from "~/lib/opendaw/importMidi";

export default function Produce() {
  const { songId } = useParams();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [midiPath, setMidiPath] = useState<string>();

  useEffect(() => {
    if (!songId) { setState("error"); setErrorMessage("no song specified"); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: song, error } = await supabase.from("songs").select("*").eq("id", songId).single();
        if (error || !song) throw error ?? new Error("song not found");
        if (cancelled) return;
        setMidiPath(song.midi_path);
        const { data: signed } = await supabase.storage.from("midi").createSignedUrl(song.midi_path, 3600);
        if (!signed) throw new Error("could not get signed URL for MIDI file");
        const res = await fetch(signed.signedUrl, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error(`MIDI fetch failed: ${res.status}`);
        const midiBytes = await res.arrayBuffer();
        const ctx = new AudioContext();
        await ensureOpenDawEngine(ctx);
        // TODO(Task 1 findings): construct the real Project instance here
        // await importMidiIntoProject(project, midiBytes);
        if (!cancelled) setState("ready");
      } catch (err) {
        if (!cancelled) { setState("error"); setErrorMessage(String(err)); }
      }
    })();
    return () => { cancelled = true; };
  }, [songId]);

  if (state === "error") {
    return (
      <div>
        <p>Couldn't open the editor: {errorMessage}</p>
        {midiPath && <p><a href="#" onClick={async e => {
          e.preventDefault();
          const { data } = await supabase.storage.from("midi").createSignedUrl(midiPath, 3600);
          if (data) window.open(data.signedUrl);
        }}>Download .mid instead</a></p>}
      </div>
    );
  }
  if (state === "loading") return <p>Loading…</p>;
  return <div>{/* Tasks 7-9 render here */}</div>;
}
```

The `fetch(signed.signedUrl, { mode: "cors", ... })` call is the spec's flagged COEP risk point — this is written defensively (explicit `mode:"cors"`, checked `res.ok`) but **cannot be confirmed to actually pass COEP without a live browser**. If it fails there, the fix is on the Supabase Storage/bucket CORS config side, not this code — note that in the task report rather than guessing at a code change to paper over an unverified failure.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/routes/produce.tsx
git commit -m "feat(produce): load song, init engine, error/fallback states"
```

---

### Task 7: Transport controls

**Files:**
- Create: `app/components/opendaw/TransportControls.tsx`

- [ ] **Step 1: Re-read Task 1's findings** for `EngineFacade`'s real play/stop/position API.

- [ ] **Step 2: Write the component** — play/stop buttons and a position readout, calling the engine facade obtained from the project constructed in Task 6:

```tsx
// app/components/opendaw/TransportControls.tsx
// play()/stop()/position accessor names/signatures per Task 1 findings.
export function TransportControls({ engine }: { engine: /* real EngineFacade type */ any }) {
  return (
    <div>
      <button onClick={() => engine.play()}>▶ Play</button>
      <button onClick={() => engine.stop()}>■ Stop</button>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0. Actual playback needs a live browser — say so.

- [ ] **Step 4: Commit**

```bash
git add app/components/opendaw/TransportControls.tsx
git commit -m "feat(opendaw): transport controls"
```

---

### Task 8: Piano roll — render, move, resize, delete

**Files:**
- Create: `app/components/opendaw/PianoRoll.tsx`

- [ ] **Step 1: Re-read Task 1's findings** for how note regions are represented/mutated/deleted via `ProjectApi` (the exact handle/id type you get back from region creation, and the real mutate/delete method names).

- [ ] **Step 2: Write the component**

A DOM-based (not canvas — simpler drag/resize via native pointer events on positioned `<div>`s, matches this codebase's low-tooling style everywhere else) grid rendering each track's regions as horizontal bars positioned by `startSec`/`durSec`, with:
- pointer-down-drag on a region body to move it (update its start time via the real `ProjectApi` mutate call)
- pointer-down-drag on a region's right edge to resize (update duration)
- a delete button/keypress removing a region via the real `ProjectApi` delete call

Write the actual component against Task 1's confirmed API — this is the task where "no placeholders" matters most for the interaction code itself (drag/resize/delete handlers), since that logic doesn't depend on openDAW's uncertain API and can be fully specified now:

```tsx
// app/components/opendaw/PianoRoll.tsx
import { useRef, useState } from "react";

type Region = { id: string; trackId: string; pitch: number; startSec: number; durSec: number };

export function PianoRoll({ regions, pxPerSec, onMove, onResize, onDelete }: {
  regions: Region[];
  pxPerSec: number;
  onMove: (id: string, newStartSec: number) => void;
  onResize: (id: string, newDurSec: number) => void;
  onDelete: (id: string) => void;
}) {
  const drag = useRef<{ id: string; mode: "move" | "resize"; startX: number; origStart: number; origDur: number } | null>(null);

  function onPointerDown(e: React.PointerEvent, region: Region, mode: "move" | "resize") {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: region.id, mode, startX: e.clientX, origStart: region.startSec, origDur: region.durSec };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const deltaSec = (e.clientX - drag.current.startX) / pxPerSec;
    if (drag.current.mode === "move") onMove(drag.current.id, Math.max(0, drag.current.origStart + deltaSec));
    else onResize(drag.current.id, Math.max(0.05, drag.current.origDur + deltaSec));
  }
  function onPointerUp() { drag.current = null; }

  return (
    <div onPointerMove={onPointerMove} onPointerUp={onPointerUp} style={{ position: "relative", height: 300, overflowX: "auto" }}>
      {regions.map(r => (
        <div
          key={r.id}
          onPointerDown={e => onPointerDown(e, r, "move")}
          style={{ position: "absolute", left: r.startSec * pxPerSec, width: r.durSec * pxPerSec, top: (127 - r.pitch) * 4, height: 4, background: "#6cf" }}
        >
          <div
            onPointerDown={e => { e.stopPropagation(); onPointerDown(e, r, "resize"); }}
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, cursor: "ew-resize" }}
          />
          <button onClick={() => onDelete(r.id)} style={{ position: "absolute", right: -16, fontSize: 10 }}>×</button>
        </div>
      ))}
    </div>
  );
}
```

The `onMove`/`onResize`/`onDelete` callbacks are the ones `produce.tsx` wires to the real `ProjectApi` mutate/delete calls confirmed in Task 1 — this component itself has no direct openDAW dependency, which keeps it fully specifiable now and testable in isolation from the SDK's version churn.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0. Actual drag/resize/delete interaction needs a live browser — say so.

- [ ] **Step 4: Commit**

```bash
git add app/components/opendaw/PianoRoll.tsx
git commit -m "feat(opendaw): piano roll — render, move, resize, delete regions"
```

---

### Task 9: Instrument picker + export button, final wiring

**Files:**
- Create: `app/components/opendaw/InstrumentPicker.tsx`
- Modify: `app/routes/produce.tsx` (fill in the Task 6 TODOs, render Tasks 7-9's components, add the export button)

- [ ] **Step 1: Re-read Task 1's findings** for `ProjectApi.createInstrument`/instrument-assignment's real signature and what instrument choices are actually available (a fixed list from the SDK, or free-form).

- [ ] **Step 2: Write `InstrumentPicker`**

```tsx
// app/components/opendaw/InstrumentPicker.tsx
// Options list per Task 1 findings — replace the placeholder list below with
// whatever instruments the installed @opendaw packages actually expose.
const INSTRUMENT_OPTIONS = ["piano", "synth"]; // TODO(Task 1 findings): real options

export function InstrumentPicker({ trackId, current, onChange }: {
  trackId: string; current: string; onChange: (trackId: string, instrument: string) => void;
}) {
  return (
    <select value={current} onChange={e => onChange(trackId, e.target.value)}>
      {INSTRUMENT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
}
```

- [ ] **Step 3: Wire everything into `produce.tsx`**

Fill in Task 6's two `TODO` comments with the real `Project` construction + `importMidiIntoProject` call from Task 1's findings. Render `TransportControls`, `PianoRoll` (fed from the project's current regions — read them via whatever real accessor Task 1 found), and one `InstrumentPicker` per track, in the `state === "ready"` branch. Add an "Export .mid" button calling `exportProjectToMidi` (Task 5) then uploading the result:

```tsx
async function handleExport() {
  const bytes = exportProjectToMidi(project, bpm); // project/bpm from component state
  const { error } = await supabase.storage.from("midi").upload(midiPath!, new Blob([bytes as BlobPart], { type: "audio/midi" }), { upsert: true });
  if (error) setExportError(String(error));
  else setExportError(undefined);
}
```

Note the `{ upsert: true }` option — `saveSong`'s original upload call (in `app/lib/api/bank.ts`) did NOT set this, since it always uploads to a brand-new path. This is the first upload in the codebase that intentionally overwrites an existing path, so `upsert: true` is required here specifically (don't add it to `saveSong` — that would be an unrelated, unrequested change to a different, already-working code path). Surface `exportError` visibly in the UI (per the spec's explicit deviation from this codebase's usual silent-fail convention for this one flow) — don't let export failures pass silently.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/components/opendaw/InstrumentPicker.tsx app/routes/produce.tsx
git commit -m "feat(opendaw): instrument picker + export-with-overwrite, full wiring"
```

---

### Task 10: Final self-check

- [ ] **Step 1: Full project check**

Run: `npm run typecheck && npm run build && npm run check-midi`
Expected: all exit 0.

- [ ] **Step 2: Update `CLAUDE.md`**

Add a `## Decisions` entry (or update the existing openDAW stub entry) noting the real API findings from Task 1 and the switch from stub to real integration, so a future session doesn't re-litigate the same research. Add any new gotchas actually hit during Tasks 1-9 that weren't already known.

- [ ] **Step 3: State the live-verification gap plainly**

List explicitly, in the final task report, everything this plan could NOT verify without a live browser: engine boot, MIDI import producing correct-sounding playback, drag/resize/delete interaction, the Storage/COEP fetch actually succeeding, export round-trip actually producing a valid re-importable `.mid`. This is expected given the environment — the point is naming the gap, not pretending it's closed.
