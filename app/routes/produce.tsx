import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { supabase } from "~/lib/supabase";
import { createOpenDawProject } from "~/lib/opendaw/engine";
import { importMidiIntoProject } from "~/lib/opendaw/importMidi";
import { exportProjectToMidi } from "~/lib/opendaw/exportMidi";
import { TransportControls } from "~/components/opendaw/TransportControls";
import { PianoRoll, type Region } from "~/components/opendaw/PianoRoll";
import { InstrumentPicker, type InstrumentName } from "~/components/opendaw/InstrumentPicker";
import { UUID } from "@opendaw/lib-std";
import {
  InstrumentFactories,
  type AudioUnitBoxAdapter,
  type InstrumentBox,
  type InstrumentFactory,
} from "@opendaw/studio-adapters";
import type { Project } from "@opendaw/studio-core";
import type { NoteEventBox, NoteRegionBox } from "@opendaw/studio-boxes";

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

// Horizontal scale for the piano roll: pixels per ppqn. PPQN.Quarter === 960, so 0.05 px/ppqn
// renders one quarter note ~48px wide. PianoRoll works in ppqn (see its header) — no sec↔ppqn
// conversion happens anywhere in this route.
const PX_PER_PPQN = 0.05;

// Instrument NAME (from InstrumentPicker, SDK-free) -> real SDK factory. Both are
// InstrumentFactory<void, …> (attachment-free synths per Task 1 findings), so typing the map
// values as InstrumentFactory<void> collapses `INSTRUMENT_FACTORIES[name]` to a single
// (non-union) factory type that replaceMIDIInstrument<A> infers A=void from cleanly.
const INSTRUMENT_FACTORIES: Record<InstrumentName, InstrumentFactory<void>> = {
  Vaporisateur: InstrumentFactories.Vaporisateur,
  Apparat: InstrumentFactories.Apparat,
};

// One PianoRoll `Region` (== one note EVENT — see PianoRoll's header) plus the SDK-side handles
// needed to mutate it. Kept in produce.tsx, NOT on PianoRoll's Region type, so that component
// stays SDK-free (Task 8's deliberate boundary).
type EventHandles = { eventBox: NoteEventBox; regionBox: NoteRegionBox };
type TrackInfo = { trackId: string; label: string };
type RegionModel = {
  regions: Region[];
  // keyed by Region.id (the note event's UUID string) so onMove/onResize/onDelete can find the
  // right NoteEventBox + its parent NoteRegionBox to mutate.
  eventHandles: Map<string, EventHandles>;
  tracks: TrackInfo[];
  // keyed by TrackInfo.trackId so the instrument picker can reach the audio unit's current
  // instrument box (via inputAdapter) at swap time.
  audioUnits: Map<string, AudioUnitBoxAdapter>;
};

// Walks the project's adapters (the exact chain exportMidi.ts's collectNoteTracks established:
// rootBoxAdapter.audioUnits.adapters() -> tracks.values() -> regions.adapters.values() ->
// isNoteRegion() -> optCollection -> events.asArray()) and flattens every note EVENT into a
// PianoRoll Region, building the side lookups produce.tsx needs to write edits back.
//
// Region.position is ABSOLUTE timeline ppqn (region.position + event.position), matching both
// PianoRoll's contract and exportMidi.ts. NoteEventBoxAdapter exposes no position/duration
// setters — only getters + `.box` — so all mutation goes through the underlying boxes' Int32Fields
// (Task 1: "no ProjectApi.deleteRegion / mutate-region method; region/note edits are box-graph
// field setters/deletions inside editing.modify").
function buildRegionModel(project: Project): RegionModel {
  const regions: Region[] = [];
  const eventHandles = new Map<string, EventHandles>();
  const tracks: TrackInfo[] = [];
  const audioUnits = new Map<string, AudioUnitBoxAdapter>();

  let audioUnitIndex = 0;
  for (const audioUnit of project.rootBoxAdapter.audioUnits.adapters()) {
    // Positional trackId: audio units are created once per source MIDI track at import and are
    // never added/removed/reordered by note edits or instrument swaps, so the index is a stable
    // key across refreshes (and doesn't depend on an adapter uuid getter). Note ids, which DO
    // shift on delete, use the event's own UUID instead (below).
    const trackId = `au-${audioUnitIndex}`;
    let trackHasNotes = false;

    for (const track of audioUnit.tracks.values()) {
      for (const region of track.regions.adapters.values()) {
        if (!region.isNoteRegion()) continue;
        const collection = region.optCollection.unwrapOrNull();
        if (!collection) continue;
        for (const event of collection.events.asArray()) {
          const id = UUID.toString(event.uuid);
          regions.push({
            id,
            trackId,
            pitch: event.pitch,
            position: region.position + event.position, // region-local -> absolute
            duration: event.duration,
          });
          eventHandles.set(id, { eventBox: event.box, regionBox: region.box });
          trackHasNotes = true;
        }
      }
    }

    // Only surface tracks that actually carry notes (skips Project.new's default empty audio
    // unit) — same "filter by content, not identity" rule import/exportMidi use.
    if (trackHasNotes) {
      audioUnits.set(trackId, audioUnit);
      tracks.push({ trackId, label: audioUnit.label || trackId });
    }
    audioUnitIndex++;
  }

  return { regions, eventHandles, tracks, audioUnits };
}

export default function Produce() {
  const { songId } = useParams();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [midiPath, setMidiPath] = useState<string>();
  const [project, setProject] = useState<Project | null>(null);
  // bpm the imported .mid was written at (idea.bpm — the value buildMidi originally used).
  // exportProjectToMidi needs it to convert the project's ppqn note positions back to seconds.
  const [bpm, setBpm] = useState(120);

  // Piano-roll render state, re-derived from the project after every edit so the UI reflects the
  // box graph.
  const [regions, setRegions] = useState<Region[]>([]);
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [instruments, setInstruments] = useState<Record<string, InstrumentName>>({});

  // SDK-side handles held in refs (not render state): rebuilt in lockstep with `regions` but not
  // themselves rendered.
  const eventHandlesRef = useRef<Map<string, EventHandles>>(new Map());
  const audioUnitsRef = useRef<Map<string, AudioUnitBoxAdapter>>(new Map());

  // Export feedback — surfaced VISIBLY (spec's deliberate deviation from this app's usual
  // silent-fail convention: losing edit work silently would be a real regression).
  const [exportError, setExportError] = useState<string>();
  const [exportedOk, setExportedOk] = useState(false);

  // Re-reads the project into render state + handle refs. Called once after import and after
  // every mutation. Does NOT touch `instruments` — that's the user's live selection and must
  // survive note edits.
  function refreshRegions(p: Project) {
    const model = buildRegionModel(p);
    eventHandlesRef.current = model.eventHandles;
    audioUnitsRef.current = model.audioUnits;
    setRegions(model.regions);
    setTracks(model.tracks);
  }

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

        // bpm lives on the source idea (ideas.bpm), not the songs row (which only holds
        // idea_id) — this is the same value SongBuilderPanel fed buildMidi. Own lookup, RLS
        // scopes it to the caller; idea deleted (idea_id null) falls back to 120.
        if (song.idea_id) {
          const { data: idea } = await supabase
            .from("ideas")
            .select("bpm")
            .eq("id", song.idea_id)
            .single();
          if (!cancelled && idea && typeof idea.bpm === "number") setBpm(idea.bpm);
        }

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

        // createOpenDawProject (engine.ts) boots the engine + hand-assembles the full ProjectEnv
        // and returns a fresh Project; importMidiIntoProject (Task 4) decodes the .mid onto
        // Vaporisateur note tracks inside project.editing.modify().
        const built = await createOpenDawProject(getAudioContext());
        if (cancelled) return;
        importMidiIntoProject(built, midiBytes);
        if (cancelled) return;

        refreshRegions(built);
        setInstruments(
          Object.fromEntries(
            buildRegionModel(built).tracks.map((t) => [t.trackId, "Vaporisateur" as InstrumentName]),
          ),
        );
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

  // ---- Piano-roll edit callbacks: box-graph field setters / box deletion inside editing.modify
  // (Task 1: there is NO ProjectApi.deleteRegion / mutate-region method). ----

  function handleMove(id: string, newPosition: number) {
    if (!project) return;
    const handles = eventHandlesRef.current.get(id);
    if (!handles) return;
    // PianoRoll hands back an ABSOLUTE ppqn position; NoteEventBox stores position LOCAL to its
    // parent region (importMidi set it as noteStart - regionStart). Convert back before writing.
    const local = Math.max(0, newPosition - handles.regionBox.position.getValue());
    project.editing.modify(() => handles.eventBox.position.setValue(local));
    refreshRegions(project);
  }

  function handleResize(id: string, newDuration: number) {
    if (!project) return;
    const handles = eventHandlesRef.current.get(id);
    if (!handles) return;
    project.editing.modify(() => handles.eventBox.duration.setValue(Math.max(1, newDuration)));
    refreshRegions(project);
  }

  function handleDelete(id: string) {
    if (!project) return;
    const handles = eventHandlesRef.current.get(id);
    if (!handles) return;
    project.editing.modify(() => handles.eventBox.delete());
    refreshRegions(project);
  }

  function handleInstrumentChange(trackId: string, name: InstrumentName) {
    if (!project) return;
    const audioUnit = audioUnitsRef.current.get(trackId);
    const input = audioUnit?.inputAdapter.unwrapOrNull();
    if (!input) return;
    // inputAdapter is an InstrumentDeviceBoxAdapter for our imported note tracks; its `.box` is
    // typed as the base Box, so narrow to InstrumentBox for replaceMIDIInstrument's target.
    const instrumentBox = input.box as InstrumentBox;
    project.editing.modify(() => {
      project.api.replaceMIDIInstrument(instrumentBox, INSTRUMENT_FACTORIES[name]);
    });
    setInstruments((prev) => ({ ...prev, [trackId]: name }));
  }

  async function handleExport() {
    if (!project || !midiPath) return;
    try {
      const bytes = exportProjectToMidi(project, bpm);
      // First intentional-overwrite upload in this codebase: exporting writes back to the SAME
      // midi_path, so { upsert: true } is required here (saveSong always uploads to a fresh path
      // and correctly omits it — don't add it there). The `as BlobPart` cast mirrors bank.ts's:
      // @types/node's generic Uint8Array no longer satisfies DOM BlobPart under TS 5.7+, a
      // tsconfig-level friction, not a runtime mismatch.
      const { error } = await supabase.storage
        .from("midi")
        .upload(midiPath, new Blob([bytes as BlobPart], { type: "audio/midi" }), { upsert: true });
      if (error) {
        setExportedOk(false);
        setExportError(error.message);
      } else {
        setExportError(undefined);
        setExportedOk(true);
      }
    } catch (err) {
      setExportedOk(false);
      setExportError(String(err));
    }
  }

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
        <TransportControls engine={project.engine} />

        <div>
          {tracks.map((t) => (
            <label key={t.trackId} style={{ marginRight: 12 }}>
              {t.label}{" "}
              <InstrumentPicker
                trackId={t.trackId}
                current={instruments[t.trackId] ?? "Vaporisateur"}
                onChange={handleInstrumentChange}
              />
            </label>
          ))}
        </div>

        <PianoRoll
          regions={regions}
          pxPerPpqn={PX_PER_PPQN}
          onMove={handleMove}
          onResize={handleResize}
          onDelete={handleDelete}
        />

        <div>
          <button onClick={handleExport}>Export .mid</button>
          {exportError && (
            <p role="alert" style={{ color: "crimson" }}>
              Export failed: {exportError}
            </p>
          )}
          {exportedOk && !exportError && <span style={{ color: "green" }}> Exported ✓</span>}
        </div>
      </div>
    );
  }

  return <p>Loading…</p>;
}
