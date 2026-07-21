// Lazy singleton loader for openDAW's WASM audio engine — same pattern as
// app/lib/audio/essentia.ts (one memoized init, exposed via a single function; the
// difference is this one is genuinely async, since ensureReady() actually fetches +
// compiles WASM modules over the network instead of essentia's synchronous
// `new WebAssembly.Instance`).
//
// The calls below are the REAL confirmed API from Task 1's spike (see "## Task 1
// findings" in docs/superpowers/plans/2026-07-21-opendaw-integration.md), not the
// plan's pre-spike guess — three steps, not two:
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
import { AudioWorklets } from "@opendaw/studio-core";
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
    })();
  }
  return _engineReady;
}
