// Copies @opendaw/studio-core-wasm's prebuilt engine assets from node_modules into
// public/opendaw-wasm/ so they're served same-origin — required because this project's
// COEP `require-corp` header (public/_headers) would block cross-origin WASM/worker
// fetches. Runs via the "predev"/"prebuild" npm hooks (see package.json), same spirit as
// node_modules itself: the output is a mechanical mirror of an installed package, not
// hand-authored, so it's regenerated on every install/build rather than committed
// (see .gitignore).
//
// Exact source file list confirmed by Task 1's spike (see "## Task 1 findings" ->
// "WASM asset file list" in docs/superpowers/plans/2026-07-21-opendaw-integration.md),
// PLUS workers-main.js — found live, post-launch, after a real browser session hit
// "Workers are not installed" (SoundfontService's constructor calls Workers.get Opfs,
// which panics unless Workers.install(url) ran first; see app/lib/opendaw/engine.ts).
// Task 1's spike covered AudioWorklets + WasmEngine but missed this third, separate
// Worker entirely — it lives in @opendaw/studio-core, not studio-core-wasm, so it wasn't
// in the studio-core-wasm/dist file list Task 1 was looking at.
//   dist/wasm-processor.js        -> processorUrl (also the AudioWorklets.install() url —
//                                     see the comment in app/lib/opendaw/engine.ts)
//   dist/wasm-offline-worker.js   -> offlineWorkerUrl
//   dist/wasm/**                  -> engine.wasm + wasm/plugins/*.wasm (26 files total),
//                                     fetched by @opendaw/studio-core-wasm's loadEngineModules()
//                                     relative to the wasmUrl BASE (the dir containing "wasm/",
//                                     not "wasm/" itself — confirmed by reading engine-modules.js:
//                                     `${base}/wasm/engine.wasm`).
//   (from @opendaw/studio-core, not studio-core-wasm:)
//   dist/workers-main.js          -> Workers.install() url. Self-contained bundle (zero
//                                     top-level import/export statements, confirmed by
//                                     grepping the built file) — same "serve as-is" shape
//                                     as the two wasm-* files above.
import { cpSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const wasmSrcDir = path.join(projectRoot, "node_modules", "@opendaw", "studio-core-wasm", "dist");
const coreSrcDir = path.join(projectRoot, "node_modules", "@opendaw", "studio-core", "dist");
const destDir = path.join(projectRoot, "public", "opendaw-wasm");

if (!existsSync(wasmSrcDir)) {
  console.error(
    `[copy-opendaw-wasm] source not found at ${wasmSrcDir} — is @opendaw/studio-core-wasm installed?`,
  );
  process.exit(1);
}
if (!existsSync(coreSrcDir)) {
  console.error(
    `[copy-opendaw-wasm] source not found at ${coreSrcDir} — is @opendaw/studio-core installed?`,
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

copyFileSync(path.join(wasmSrcDir, "wasm-processor.js"), path.join(destDir, "wasm-processor.js"));
copyFileSync(
  path.join(wasmSrcDir, "wasm-offline-worker.js"),
  path.join(destDir, "wasm-offline-worker.js"),
);
cpSync(path.join(wasmSrcDir, "wasm"), path.join(destDir, "wasm"), { recursive: true });
copyFileSync(path.join(coreSrcDir, "workers-main.js"), path.join(destDir, "workers-main.js"));

console.log(
  `[copy-opendaw-wasm] copied wasm-processor.js, wasm-offline-worker.js, wasm/, workers-main.js -> ${destDir}`,
);
