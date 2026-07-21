import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { supabase } from "~/lib/supabase";
import { createOpenDawProject } from "~/lib/opendaw/engine";
import { importMidiIntoProject } from "~/lib/opendaw/importMidi";
import type { Project } from "@opendaw/studio-core";

// One AudioContext for the whole page lifetime, reused across mounts/route re-entries.
//
// ensureOpenDawEngine (Task 3) memoizes engine boot in a module-level singleton keyed to the
// FIRST AudioContext it sees: AudioWorklets.createFor(ctx) records its result per-context in a
// WeakMap and WasmEngine.ensureReady(ctx) compiles against that context. A fresh
// `new AudioContext()` on every mount would, on the SECOND visit, hit the already-resolved
// singleton WITHOUT re-running createFor for the new context — so AudioWorklets.get(newCtx)
// (called while assembling the ProjectEnv) would throw "Worklets not installed". Holding a
// single context sidesteps that, and mirrors how the dashboard keeps one shared audio context.
// Created lazily (not at module load) so it isn't constructed before the navigation gesture
// that reaches this route.
let sharedAudioContext: AudioContext | undefined;
function getAudioContext(): AudioContext {
  return (sharedAudioContext ??= new AudioContext());
}

export default function Produce() {
  const { songId } = useParams();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [midiPath, setMidiPath] = useState<string>();
  // Held for Tasks 7-9 (TransportControls / PianoRoll / InstrumentPicker are fed from it).
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    if (!songId) {
      setState("error");
      setErrorMessage("no song specified");
      return;
    }
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        // RLS-scoped lookup: the `songs_owner` policy (user_id = auth.uid()) means a song that
        // isn't the caller's simply returns no row — the same implicit scoping bank.ts relies on.
        const { data: song, error } = await supabase
          .from("songs")
          .select("*")
          .eq("id", songId)
          .single();
        if (error || !song) throw error ?? new Error("song not found");
        if (cancelled) return;
        setMidiPath(song.midi_path);

        const { data: signed, error: signError } = await supabase.storage
          .from("midi")
          .createSignedUrl(song.midi_path, 3600);
        if (signError || !signed) throw signError ?? new Error("could not get signed URL for MIDI file");

        // COEP risk point (spec-flagged). This app serves `Cross-Origin-Embedder-Policy:
        // require-corp` (public/_headers) so it can use SharedArrayBuffer for the WASM engine.
        // That header blocks any cross-origin subresource that doesn't opt in with CORP/CORS,
        // and the Supabase Storage signed URL is cross-origin. This fetch is written defensively
        // (explicit mode:"cors", checked res.ok), but whether it actually passes COEP can only be
        // confirmed in a live cross-origin-isolated browser page. A failure here is fixed on the
        // Supabase Storage/bucket CORS config side, NOT in this code.
        const res = await fetch(signed.signedUrl, { mode: "cors", credentials: "omit" });
        if (!res.ok) throw new Error(`MIDI fetch failed: ${res.status}`);
        const midiBytes = await res.arrayBuffer();
        if (cancelled) return;

        // Real Project construction (closes Task 6's two TODOs). createOpenDawProject
        // (engine.ts) boots the engine + hand-assembles the full ProjectEnv and returns a fresh
        // Project; importMidiIntoProject (Task 4) decodes the .mid and lays it onto Vaporisateur
        // note tracks inside project.editing.modify().
        const built = await createOpenDawProject(getAudioContext());
        if (cancelled) return;
        importMidiIntoProject(built, midiBytes);
        if (cancelled) return;

        setProject(built);
        setState("ready");
      } catch (err) {
        if (!cancelled) {
          setState("error");
          setErrorMessage(String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [songId]);

  if (state === "error") {
    return (
      <div>
        <p>Couldn't open the editor: {errorMessage}</p>
        {midiPath && (
          <p>
            <a
              href="#"
              onClick={async (e) => {
                e.preventDefault();
                const { data } = await supabase.storage.from("midi").createSignedUrl(midiPath, 3600);
                if (data) window.open(data.signedUrl);
              }}
            >
              Download .mid instead
            </a>
          </p>
        )}
      </div>
    );
  }

  if (state === "ready" && project) {
    return (
      <div>
        {/* Minimal ready state. Tasks 7-9 render TransportControls, the PianoRoll (fed from
            project's regions), and one InstrumentPicker per track from `project` here. */}
        <p>openDAW engine initialized and MIDI imported. Editor coming online…</p>
      </div>
    );
  }

  return <p>Loading…</p>;
}
