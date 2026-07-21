import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";
import { createOpenDawProject } from "~/lib/opendaw/engine";
import { importMidiIntoProject } from "~/lib/opendaw/importMidi";
import { exportProjectToMidi } from "~/lib/opendaw/exportMidi";
import { TransportControls } from "~/components/opendaw/TransportControls";
import { PianoRoll, type Region } from "~/components/opendaw/PianoRoll";
import { InstrumentPicker, type InstrumentName } from "~/components/opendaw/InstrumentPicker";
import { UUID } from "@opendaw/lib-std";
import { PPQN } from "@opendaw/lib-dsp";
import {
  InstrumentFactories,
  type AudioUnitBoxAdapter,
  type InstrumentBox,
  type InstrumentFactory,
} from "@opendaw/studio-adapters";
import type { Project } from "@opendaw/studio-core";
import type { NoteEventBox, NoteRegionBox } from "@opendaw/studio-boxes";

// Default length/loudness for a note placed via click-to-add — an eighth note
// at a comfortably audible velocity. Not user-configurable; matches this
// project's hackathon-pace "pick one sane default" convention elsewhere
// (e.g. midi.ts's fixed triad voicing).
const NEW_NOTE_DURATION_PPQN = PPQN.Quarter / 2;
const NEW_NOTE_VELOCITY = 0.8;

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

// Display-only accent dot colors for the piano-roll/instrumentation track rows — taken
// verbatim from the mockup's prodTracks/prodInstruments seed data (Melody #C97B3C, Chords
// #D08A44, .memo-design/_renderVals.js:262-270). Purely cosmetic: cycles by render order,
// which matches buildRegionModel's stable Melody-then-Chords track order. Has no bearing on
// track identity — that's still `trackId`.
const TRACK_ACCENT_COLORS = ["#C97B3C", "#D08A44"];
function trackAccentColor(index: number): string {
  return TRACK_ACCENT_COLORS[index % TRACK_ACCENT_COLORS.length];
}

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
  // keyed by TrackInfo.trackId — importMidiIntoProject creates exactly one NoteRegionBox per
  // track, so "the track's region" is unambiguous. Click-to-add-note needs this to find where
  // to attach a new NoteEventBox; extending a region's own duration is safe (doesn't touch any
  // existing note's region-LOCAL position), but shifting a region's start backward would — so
  // add-note clamps new notes to not precede the region's current start rather than doing that
  // shift-and-renumber-every-sibling-note dance. See handleAddNote.
  defaultRegions: Map<string, NoteRegionBox>;
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
  const defaultRegions = new Map<string, NoteRegionBox>();

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
            velocity: event.velocity,
          });
          eventHandles.set(id, { eventBox: event.box, regionBox: region.box });
          trackHasNotes = true;
        }
        // First (only, per importMidiIntoProject) note region on this track — recorded
        // regardless of trackHasNotes below, since a region can be genuinely empty after
        // every note in it gets deleted and should still accept a new click-to-add note.
        if (!defaultRegions.has(trackId)) defaultRegions.set(trackId, region.box);
      }
    }

    // Only surface tracks that actually carry notes (skips Project.new's default empty audio
    // unit) — same "filter by content, not identity" rule import/exportMidi use.
    if (trackHasNotes) {
      audioUnits.set(trackId, audioUnit);
      // A semantic label based on import order, NOT audioUnit.label: importMidiIntoProject
      // creates every track as a Vaporisateur instrument (Task 1: fixed attachment-free
      // synths only), so openDAW auto-disambiguates same-name audio units as "Vaporisateur",
      // "Vaporisateur 2", etc. Showing that raw SDK label next to an <InstrumentPicker> whose
      // options are literally "Vaporisateur"/"Apparat" is indistinguishable text soup with no
      // styling to separate them (a real user hit this: reported seeing "Vaporisateur /
      // Apparat / Vaporisateur 2 / Apparat" with no way to tell label from option). Track order
      // is stable and matches buildMidi()'s fixed two-track output (app/lib/audio/midi.ts:
      // melody added first, chords second) — labeling by that known order is unambiguous.
      const label = audioUnitIndex === 0 ? "Melody" : audioUnitIndex === 1 ? "Chords" : `Track ${audioUnitIndex + 1}`;
      tracks.push({ trackId, label });
    }
    audioUnitIndex++;
  }

  return { regions, eventHandles, tracks, audioUnits, defaultRegions };
}

export default function Produce() {
  const { songId } = useParams();
  const nav = useNavigate();
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
  // Which track click-to-add-note attaches new notes to. Defaults to the first track once
  // tracks load; the effect below keeps it valid if the currently-selected track disappears
  // (e.g. its last note got deleted — see buildRegionModel's trackHasNotes comment).
  const [activeTrackId, setActiveTrackId] = useState<string>("");

  // SDK-side handles held in refs (not render state): rebuilt in lockstep with `regions` but not
  // themselves rendered.
  const eventHandlesRef = useRef<Map<string, EventHandles>>(new Map());
  const audioUnitsRef = useRef<Map<string, AudioUnitBoxAdapter>>(new Map());
  const defaultRegionsRef = useRef<Map<string, NoteRegionBox>>(new Map());

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
    defaultRegionsRef.current = model.defaultRegions;
    setRegions(model.regions);
    setTracks(model.tracks);
    setActiveTrackId((current) =>
      model.tracks.some((t) => t.trackId === current) ? current : (model.tracks[0]?.trackId ?? ""),
    );
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

  function handleMove(id: string, newPosition: number, newPitch: number) {
    if (!project) return;
    const handles = eventHandlesRef.current.get(id);
    if (!handles) return;
    // PianoRoll hands back an ABSOLUTE ppqn position; NoteEventBox stores position LOCAL to its
    // parent region (importMidi set it as noteStart - regionStart). Convert back before writing.
    const local = Math.max(0, newPosition - handles.regionBox.position.getValue());
    project.editing.modify(() => {
      handles.eventBox.position.setValue(local);
      handles.eventBox.pitch.setValue(newPitch);
    });
    refreshRegions(project);
  }

  function handleResize(id: string, newDuration: number) {
    if (!project) return;
    const handles = eventHandlesRef.current.get(id);
    if (!handles) return;
    project.editing.modify(() => handles.eventBox.duration.setValue(Math.max(1, newDuration)));
    refreshRegions(project);
  }

  function handleVelocityChange(id: string, newVelocity: number) {
    if (!project) return;
    const handles = eventHandlesRef.current.get(id);
    if (!handles) return;
    project.editing.modify(() => handles.eventBox.velocity.setValue(Math.min(1, Math.max(0, newVelocity))));
    refreshRegions(project);
  }

  function handleDelete(id: string) {
    if (!project) return;
    const handles = eventHandlesRef.current.get(id);
    if (!handles) return;
    project.editing.modify(() => handles.eventBox.delete());
    refreshRegions(project);
  }

  function handleAddNote(trackId: string, pitch: number, position: number) {
    if (!project) return;
    const regionBox = defaultRegionsRef.current.get(trackId);
    if (!regionBox) return;
    // Notes can't currently be added before a track's earliest existing note — see
    // RegionModel.defaultRegions' comment for why (shifting a region's start would require
    // renumbering every sibling note's region-local position, out of scope here). Clamp instead
    // of silently placing the note somewhere the user didn't click.
    const regionStart = regionBox.position.getValue();
    const clampedAbsolute = Math.max(position, regionStart);
    const local = clampedAbsolute - regionStart;
    const regionEnd = local + NEW_NOTE_DURATION_PPQN;
    project.editing.modify(() => {
      if (regionEnd > regionBox.duration.getValue()) regionBox.duration.setValue(regionEnd);
      project.api.createNoteEvent({
        owner: { events: regionBox.events },
        position: local,
        duration: NEW_NOTE_DURATION_PPQN,
        pitch,
        velocity: NEW_NOTE_VELOCITY,
      });
    });
    refreshRegions(project);
  }

  function handleUndo() {
    if (!project) return;
    project.editing.undo();
    refreshRegions(project);
  }

  function handleRedo() {
    if (!project) return;
    project.editing.redo();
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
      <div className="m-scroll" style={cssText("flex:1;padding:56px 20px 40px;background:linear-gradient(180deg,#211913,#171009);")}>
        <div style={cssText("font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#a68a63;")}>openDAW</div>
        <p style={cssText("margin-top:8px;font-size:14px;color:#e9dcc4;")}>Couldn't open the editor: {errorMessage}</p>
        {midiPath && (
          <div style={cssText("margin-top:16px;background:rgba(255,255,255,.04);border:1px dashed rgba(255,255,255,.14);border-radius:12px;padding:12px 14px;")}>
            <div style={cssText("font-size:12px;font-weight:800;color:#c9b79a;")}>Editor won’t load?</div>
            <div style={cssText("font-size:12px;color:#8a7458;margin-top:3px;line-height:1.45;")}>
              The original arrangement is always safe —{" "}
              <a
                href="#"
                onClick={async (e) => {
                  e.preventDefault();
                  const { data } = await supabase.storage.from("midi").createSignedUrl(midiPath, 3600);
                  if (data) window.open(data.signedUrl);
                }}
                style={cssText("color:#D08A44;")}
              >
                download the .mid
              </a>{" "}
              and open it in any DAW.
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state === "ready" && project) {
    return (
      <div className="m-scroll" style={cssText("flex:1;padding:56px 20px 40px;background:linear-gradient(180deg,#211913,#171009);")}>
        <button
          onClick={() => nav(`/songs/${songId}`)}
          style={cssText(
            "display:flex;align-items:center;gap:7px;border:none;background:none;cursor:pointer;color:#c9b79a;font-size:14px;font-weight:600;padding:0;",
          )}
        >
          ← Song
        </button>

        <div style={cssText("margin-top:14px;display:flex;align-items:center;justify-content:space-between;")}>
          <div>
            <div style={cssText("font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#a68a63;")}>openDAW</div>
            <h2 style={cssText("margin:3px 0 0;font-size:24px;font-weight:800;letter-spacing:-.02em;color:#F4EDDB;")}>Produce</h2>
          </div>
          <div
            style={cssText(
              "display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;color:#8fce9a;background:rgba(143,206,154,.12);border:1px solid rgba(143,206,154,.3);border-radius:20px;padding:5px 11px;",
            )}
          >
            <span style={cssText("width:7px;height:7px;border-radius:50%;background:#8fce9a;box-shadow:0 0 8px #8fce9a;")} />
            Engine ready
          </div>
        </div>
        <div style={cssText("margin-top:8px;display:flex;gap:7px;")}>
          <span
            style={cssText(
              "font-size:11px;font-weight:800;color:#F4EDDB;background:rgba(255,255,255,.08);border-radius:7px;padding:4px 9px;font-family:'Space Mono',monospace;",
            )}
          >
            {bpm} BPM
          </span>
          <span style={cssText("font-size:11px;font-weight:700;color:#c9b79a;background:rgba(255,255,255,.05);border-radius:7px;padding:4px 9px;")}>
            .mid loaded
          </span>
        </div>

        {/* transport — real TransportControls (play/stop + bars:beats), just framed like the mockup */}
        <div
          style={cssText(
            "margin-top:16px;display:flex;align-items:center;gap:12px;background:#120c07;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px 14px;",
          )}
        >
          <TransportControls engine={project.engine} />
        </div>

        {/* undo/redo — no mockup equivalent; styled with the mockup's own chip tokens for consistency */}
        <div style={cssText("margin-top:10px;display:flex;gap:8px;")}>
          <button
            onClick={handleUndo}
            disabled={!project.editing.canUndo()}
            style={{
              ...cssText("font-size:11px;font-weight:700;color:#c9b79a;background:rgba(255,255,255,.05);border-radius:7px;padding:6px 11px;border:none;cursor:pointer;"),
              opacity: project.editing.canUndo() ? 1 : 0.4,
            }}
          >
            ↶ Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={!project.editing.canRedo()}
            style={{
              ...cssText("font-size:11px;font-weight:700;color:#c9b79a;background:rgba(255,255,255,.05);border-radius:7px;padding:6px 11px;border:none;cursor:pointer;"),
              opacity: project.editing.canRedo() ? 1 : 0.4,
            }}
          >
            ↷ Redo
          </button>
        </div>

        {/* piano roll — real PianoRoll render with real note data; mockup's decorative seeded
            notes are dropped, per-track rows above it use real regions/tracks state only */}
        <div style={cssText("margin-top:14px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#a68a63;")}>
          Piano roll
        </div>
        <div style={cssText("margin-top:10px;background:#120c07;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:12px;overflow:hidden;")}>
          {tracks.map((t, i) => (
            <div key={t.trackId} style={cssText("display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;")}>
              <div style={cssText("display:flex;align-items:center;gap:7px;")}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: trackAccentColor(i) }} />
                <span style={cssText("font-size:12px;font-weight:800;color:#e9dcc4;")}>{t.label}</span>
              </div>
              <span style={cssText("font-size:10px;color:#8a7458;")}>
                {regions.filter((r) => r.trackId === t.trackId).length} notes
              </span>
            </div>
          ))}
          <PianoRoll
            regions={regions}
            pxPerPpqn={PX_PER_PPQN}
            tracks={tracks}
            activeTrackId={activeTrackId}
            onActiveTrackChange={setActiveTrackId}
            onMove={handleMove}
            onResize={handleResize}
            onVelocityChange={handleVelocityChange}
            onDelete={handleDelete}
            onAddNote={handleAddNote}
          />
        </div>

        {/* instrument picker — real InstrumentPicker (native <select>, factory-swap onChange
            untouched), framed as a row per the mockup; the mockup's per-option chip buttons
            aren't reproducible here without editing InstrumentPicker.tsx itself (out of scope) */}
        <div style={cssText("margin-top:16px;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#a68a63;")}>
          Instrumentation · tap to swap
        </div>
        <div style={cssText("margin-top:10px;display:flex;flex-direction:column;gap:9px;")}>
          {tracks.map((t, i) => (
            <label
              key={t.trackId}
              style={cssText(
                "display:flex;align-items:center;gap:10px;background:#120c07;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px 12px;",
              )}
            >
              <div style={{ width: 8, height: 8, borderRadius: 2, background: trackAccentColor(i), flex: "none" }} />
              <span style={cssText("flex:none;width:58px;font-size:12px;font-weight:800;color:#e9dcc4;")}>{t.label}</span>
              <div style={cssText("flex:1;display:flex;gap:6px;overflow-x:auto;")}>
                <InstrumentPicker
                  trackId={t.trackId}
                  current={instruments[t.trackId] ?? "Vaporisateur"}
                  onChange={handleInstrumentChange}
                />
              </div>
            </label>
          ))}
        </div>

        {/* export */}
        <div style={cssText("margin-top:18px;display:flex;flex-direction:column;gap:10px;")}>
          <button
            onClick={handleExport}
            style={cssText(
              "width:100%;padding:15px;border-radius:14px;border:none;background:linear-gradient(135deg,#C97B3C,#A8432F);color:#fff;font-size:15px;font-weight:800;cursor:pointer;box-shadow:0 10px 24px rgba(160,86,58,.35);",
            )}
          >
            Export .mid
          </button>
          {exportError && (
            <p role="alert" style={cssText("text-align:center;font-size:13px;font-weight:700;color:#ff6b6b;margin:0;")}>
              Export failed: {exportError}
            </p>
          )}
          {exportedOk && !exportError && (
            <div style={cssText("text-align:center;font-size:13px;font-weight:700;color:#8fce9a;")}>✓ Saved back to your song — edits kept.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="m-scroll"
      style={cssText("flex:1;padding:56px 20px 40px;background:linear-gradient(180deg,#211913,#171009);display:flex;align-items:center;justify-content:center;")}
    >
      <p style={cssText("font-size:14px;color:#c9b79a;")}>Loading…</p>
    </div>
  );
}
