import { useEffect, useRef } from "react";

/**
 * Task 8.2 spike — openDAW embed.
 *
 * Outcome: honest stub. Real mount/import API for `@opendaw/studio-sdk` was
 * NOT reasonably discoverable within the ~15-20min time box, per the plan's
 * own stop condition. What the investigation found (npm i @opendaw/studio-sdk
 * v0.0.160, inspected node_modules/@opendaw/studio-sdk directly):
 *
 * - `@opendaw/studio-sdk`'s own package.json describes it as "One-line
 *   installer for the complete OpenDAW Studio tool-chain" — it is a
 *   dependency-aggregator, not an API surface. Its entire `dist/index.js`
 *   is one line: `export { OPENDAW_SDK_VERSION } from "./version"`. That's
 *   the whole public API of the package you actually `npm install` — a
 *   version string, nothing else. No `mount`, `Studio`, or `createApp` export.
 * - The real functionality lives in ~15 sibling packages pulled in as
 *   *dependencies* (not re-exported): @opendaw/studio-core,
 *   @opendaw/studio-core-wasm, @opendaw/lib-jsx, @opendaw/lib-box,
 *   @opendaw/lib-dsp, @opendaw/studio-boxes, etc.
 * - `@opendaw/studio-core`'s index.d.ts re-exports ~37 modules (Engine,
 *   EngineFacade, EngineWorklet, Mixer, AudioWorklets, project, midi,
 *   dawproject, ui, ...). The `ui` submodule exports low-level building
 *   blocks (ClipboardManager, ContextMenu, MenuItems, TimeGrid, region
 *   resolvers, canvas renderers) — primitives for building a DAW UI, not a
 *   drop-in "mount this into a div" widget. No top-level Studio/App
 *   constructor is documented or obviously named anywhere.
 * - The UI layer is built on `@opendaw/lib-jsx`, openDAW's own custom JSX
 *   runtime — not React. Bridging that into an RR7/React tree is a real
 *   integration project, not a spike-scope task.
 * - The only documented "mounting" snippet in the bundled README is for
 *   `WasmEngine.install()` from `@opendaw/studio-core-wasm` (the audio
 *   engine, not the UI): it requires serving prebuilt wasm-processor /
 *   wasm-offline-worker / engine.wasm assets from your own host AND a
 *   cross-origin-isolated page (COOP/COEP headers) for SharedArrayBuffer.
 *   That's a real app wiring, not something this spike can smoke-test
 *   without a live browser.
 * - Licensing: openDAW is AGPL v3, with a paid commercial license required
 *   for closed-source/SaaS use (see node_modules/@opendaw/studio-sdk/README.md).
 *   Worth resolving before any real integration, independent of the API
 *   question above.
 *
 * Conclusion: shipping a guessed `sdk.mount(host.current)` call here would
 * silently do nothing (the import has no such export) or throw at runtime.
 * Per the plan, "stop and ship 8.1 [.mid download fallback] only" is the
 * sanctioned outcome for this spike. This route is left as a real, empty
 * route (not deleted) so it's easy to pick back up if openDAW ships a real
 * embeddable widget in a later version.
 *
 * NOT verified (needs a live browser, out of scope here per the plan):
 * COOP/COEP headers, `crossOriginIsolated === true`, whether
 * @opendaw/studio-core-wasm's SharedArrayBuffer requirement is even
 * satisfiable in this app's current Cloudflare Pages/Workers deploy setup.
 */
export default function Produce() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const sdk = await import("@opendaw/studio-sdk");
      if (disposed || !host.current) return;
      // TODO(spike): no real mount API found. `sdk` only exposes
      // `OPENDAW_SDK_VERSION` (see comment above). Once openDAW publishes
      // an actual embeddable mount/import API, wire it up here — e.g.
      // something like `sdk.mount(host.current)` then
      // `studio.importMidi(bytes)`, but that API does not exist in v0.0.160.
      console.info("openDAW SDK version (stub, not mounted):", sdk.OPENDAW_SDK_VERSION);
    })();
    return () => {
      disposed = true;
    };
  }, []);

  return <div ref={host} style={{ width: "100vw", height: "100vh" }} />;
}
