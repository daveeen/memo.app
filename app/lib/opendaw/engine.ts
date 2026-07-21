// Lazy singleton loader for openDAW's WASM audio engine — same pattern as
// app/lib/audio/essentia.ts (one memoized init, exposed via a single function; the
// difference is this one is genuinely async, since ensureReady() actually fetches +
// compiles WASM modules over the network instead of essentia's synchronous
// `new WebAssembly.Instance`).
//
// The calls below are the REAL confirmed API from Task 1's spike (see "## Task 1
// findings" in docs/superpowers/plans/2026-07-21-opendaw-integration.md) PLUS one more
// step Task 1's spike missed entirely and only surfaced live, in a real browser (see
// the Workers.install() comment below) — four steps, not three:
//   1. AudioWorklets.install(url) + AudioWorklets.createFor(audioContext) — registers
//      the worklet module for this AudioContext (`context.audioWorklet.addModule(url)`
//      under the hood, confirmed by reading AudioWorklets.js) and instantiates the
//      per-context AudioWorklets host.
//   2. WasmEngine.install({ processorUrl, offlineWorkerUrl, wasmUrl }) — synchronous,
//      just records the host-served asset URLs (confirmed by reading WasmEngine.js's
//      own header comment: "`install` takes the host-served URLs ... `ensureReady`
//      compiles the modules + registers the processor module once").
//   3. WasmEngine.ensureReady(audioContext) — actually fetches + compiles the wasm
//      modules; resolves a boolean, checked below rather than discarded.
//   4. Workers.install(url) — a separate plain Web Worker (OPFS storage / peak-generation
//      / transient-detection background tasks), required before SoundfontService can be
//      constructed. See the WORKERS_MAIN_URL comment below for how this was found.
import {
  AudioWorklets,
  GlobalSampleLoaderManager,
  GlobalSoundfontLoaderManager,
  Project,
  SampleService,
  SoundfontService,
  Workers,
  type ProjectEnv,
  type SampleProvider,
  type SoundfontProvider,
} from "@opendaw/studio-core";
import { WasmEngine } from "@opendaw/studio-core-wasm";

// Same-origin base the assets are copied into by scripts/copy-opendaw-wasm.mjs
// (predev/prebuild hook) — required by this project's COEP `require-corp` header
// (public/_headers), which would block cross-origin WASM/worker fetches.
const ASSET_BASE = "/opendaw-wasm";

// wasmUrl is the BASE dir containing "wasm/", not "wasm/" itself: confirmed by reading
// @opendaw/studio-core-wasm's engine-modules.js, whose loadEngineModules(base) fetches
// `${base}/wasm/engine.wasm` and `${base}${device.url}` (device.url already starts with
// "/wasm/plugins/..."). Task 1's findings note phrased this the same way but didn't spell
// out the exact string shape, so this was re-verified directly against the source.
const PROCESSOR_URL = `${ASSET_BASE}/wasm-processor.js`;
const OFFLINE_WORKER_URL = `${ASSET_BASE}/wasm-offline-worker.js`;
const WASM_BASE_URL = ASSET_BASE;

// UNCONFIRMED — Task 1's biggest flagged boot-time risk, carried forward as-is rather
// than guessed away: the AudioWorklet processor module registered via
// `AudioWorklets.install(url)` (which resolves to `context.audioWorklet.addModule(url)`).
// `@opendaw/studio-core-processors` — the package studio-core-wasm's own devDependencies
// list as the thing that builds worklet-processor bundles — is NOT installed in this
// project (dev-only dependency of a sub-package), so there is no separately shipped
// worklet-processor asset to point at.
//
// `wasm-processor.js` is the best on-disk candidate, and there is real supporting
// evidence beyond Task 1's original "most likely" guess: it contains a `registerProcessor(...)`
// call (grepped directly out of the built file), and studio-core-wasm's own boot.js
// describes itself as shared boot plumbing "for BOTH studio hosts: the realtime worklet
// processor and the offline render worker" — consistent with wasm-processor.js being the
// realtime worklet host and wasm-offline-worker.js being the offline one. But
// `context.audioWorklet.addModule(...)` actually succeeding — and the registered processor
// actually being usable by studio-core's EngineWorklet — has NOT been confirmed by booting
// a real, cross-origin-isolated browser page (not possible in this build environment: no
// SharedArrayBuffer/real AudioWorklet under Node). If engine boot fails, this is the first
// thing to check.
const WORKLET_URL = PROCESSOR_URL;

// Found live, post-launch: a real browser session threw "Workers are not installed" —
// `new SoundfontService()` (see createOpenDawProject below) calls `Workers.get Opfs`,
// which panics unless `Workers.install(url)` ran first. This is a SEPARATE, plain Web
// Worker (`new Worker(url, {type:"module"})`, confirmed by reading
// @opendaw/studio-core/dist/Workers.js) — not the AudioWorklet and not the WasmEngine
// worker above. Task 1's spike covered AudioWorklets + WasmEngine and never surfaced
// this third one, since it lives in @opendaw/studio-core (not studio-core-wasm) and
// nothing in the ProjectEnv-assembly code path Task 1/6 traced calls it directly — it's
// reached indirectly via SoundfontService's constructor. `workers-main.js` is the
// self-contained bundle (confirmed zero top-level import/export statements) copied
// alongside the wasm assets by scripts/copy-opendaw-wasm.mjs.
const WORKERS_MAIN_URL = `${ASSET_BASE}/workers-main.js`;

let _engineReady: Promise<void> | null = null;

export function ensureOpenDawEngine(audioContext: AudioContext): Promise<void> {
  if (!_engineReady) {
    _engineReady = (async () => {
      AudioWorklets.install(WORKLET_URL);
      await AudioWorklets.createFor(audioContext);

      WasmEngine.install({
        processorUrl: PROCESSOR_URL,
        offlineWorkerUrl: OFFLINE_WORKER_URL,
        wasmUrl: WASM_BASE_URL,
      });
      const ready = await WasmEngine.ensureReady(audioContext);
      if (!ready) {
        throw new Error("WasmEngine.ensureReady() reported the engine was not ready");
      }

      // Must resolve before createOpenDawProject constructs SoundfontService.
      await Workers.install(WORKERS_MAIN_URL);
    })();
  }
  return _engineReady;
}

// ---------------------------------------------------------------------------
// Headless Project assembly (Task 6)
//
// This closes the item Task 1's findings flagged as "the most under-scoped": there
// is NO turnkey `createProjectEnv()` / `Project.create()` in the shipped SDK — a
// ProjectEnv (studio-core/dist/project/ProjectEnv.d.ts) is hand-assembled from six
// required fields (only `createEditing` is optional). Every constructor in the chain
// was read out of the shipped studio-core `dist/*.js` and confirmed to do NO throwing
// I/O at construction time (verified against source, not assumed):
//
//   new SampleService(ctx)              AssetService's `super()` only sets
//                                       `notifier = new Notifier()` (a pure observer
//                                       registry); the body is just `this.audioContext = ctx`.
//                                       No I/O. (samples/SampleService.js, AssetService.js)
//   new SoundfontService()              CORRECTION (found live, in a real browser, not from
//                                       source reading alone): this was originally documented
//                                       as never throwing — WRONG. `SoundfontStorage.get().list()`
//                                       calls `Workers.get Opfs`, which SYNCHRONOUSLY panics
//                                       ("Workers are not installed") if `Workers.install()`
//                                       hasn't resolved yet — the throw happens while
//                                       constructing the `Promise.all([...])` array argument,
//                                       before any `.then()`/`console.warn` rejection handler
//                                       even attaches, so it propagates straight out of the
//                                       constructor instead of warning in the background.
//                                       Fixed by awaiting `Workers.install(...)` in
//                                       ensureOpenDawEngine() before this constructor ever runs
//                                       (see above). (soundfont/SoundfontService.js, Workers.js)
//   new GlobalSampleLoaderManager(p)    stores provider + four empty UUID sets. Pure.
//   new GlobalSoundfontLoaderManager(p) stores provider + one empty UUID set. Pure.
//   AudioWorklets.get(ctx)              returns the instance `createFor(ctx)` stored in a
//                                       WeakMap; ensureOpenDawEngine() awaits createFor(ctx)
//                                       above, so it is always present here. (AudioWorklets.js)
//   Project.new(env)                    static + synchronous; builds the box graph. Does NOT
//                                       require the engine worklet to be booted — that is only
//                                       needed for playback and is wired in a later task.
//
// SampleProvider / SoundfontProvider are single-method (`fetch`) interfaces. openDAW's real
// providers fetch from its cloud servers, which this app has none of, so we pass minimal
// stub providers that reject. They are NEVER invoked by the melody/chords import path:
// importMidiIntoProject creates only `Vaporisateur` instruments (a pure synth needing no
// sample/soundfont attachment, per Task 1's findings), so no loader ever calls
// `provider.fetch`. If a sample/soundfont-backed instrument were ever added, the rejection
// surfaces as an honest load error rather than a fabricated success or a silent hang.
//
// NOT live-verified (needs a real cross-origin-isolated browser, impossible under Node here):
// that `Project.new(env)` and the subsequent box-graph mutations genuinely run without a
// booted worklet. The plan's own Task 6 change note treats worklet boot as a separate later
// step, so this is expected to hold — but it is asserted from the types/source, not observed.
const rejectingSampleProvider: SampleProvider = {
  fetch: () => Promise.reject(new Error("headless openDAW editor has no sample provider")),
};
const rejectingSoundfontProvider: SoundfontProvider = {
  fetch: () => Promise.reject(new Error("headless openDAW editor has no soundfont provider")),
};

// Boots the engine for `audioContext` (idempotent via ensureOpenDawEngine's singleton),
// assembles the full ProjectEnv, and returns a fresh empty Project ready to import MIDI into.
export async function createOpenDawProject(audioContext: AudioContext): Promise<Project> {
  await ensureOpenDawEngine(audioContext);
  const env: ProjectEnv = {
    audioContext,
    audioWorklets: AudioWorklets.get(audioContext),
    sampleManager: new GlobalSampleLoaderManager(rejectingSampleProvider),
    soundfontManager: new GlobalSoundfontLoaderManager(rejectingSoundfontProvider),
    sampleService: new SampleService(audioContext),
    soundfontService: new SoundfontService(),
  };
  return Project.new(env);
}
