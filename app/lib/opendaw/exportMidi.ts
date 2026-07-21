// Reads the current openDAW project's note events back out and re-encodes
// them into .mid bytes via app/lib/audio/midi.ts's tested MIDI-writing code —
// the direct inverse of app/lib/opendaw/importMidi.ts (Task 4).
//
// Read-side API confirmed here by reading the actual studio-adapters .d.ts
// files directly (this walk isn't covered by "## Task 1 findings" in
// docs/superpowers/plans/2026-07-21-opendaw-integration.md, which only spiked
// the WRITE-side ProjectApi.create* calls importMidi.ts needed — Task 1 never
// had to enumerate EXISTING tracks/regions/events, so that chain is
// confirmed fresh below, the same way Task 1/Task 4 confirmed their own
// pieces: real class/method names read out of the shipped .d.ts, not
// guessed):
//
//   project.rootBoxAdapter.audioUnits.adapters(): ReadonlyArray<AudioUnitBoxAdapter>
//     (studio-adapters/dist/RootBoxAdapter.d.ts)
//   audioUnit.tracks.values(): ReadonlyArray<TrackBoxAdapter>
//     (studio-adapters/dist/audio-unit/AudioUnitTracks.d.ts)
//   track.regions.adapters: SortedSet<..., AnyRegionBoxAdapter> (iterate via .values())
//     (studio-adapters/dist/timeline/TrackRegions.d.ts, lib-std/dist/sorted-set.d.ts)
//   region.isNoteRegion(): this is NoteRegionBoxAdapter   -- real type guard,
//     AnyRegionBoxAdapter = NoteRegionBoxAdapter | AudioRegionBoxAdapter | ValueRegionBoxAdapter
//     (studio-adapters/dist/UnionAdapterTypes.d.ts)
//   noteRegion.position: ppqn : absolute region start
//   noteRegion.optCollection: Option<NoteEventCollectionBoxAdapter>
//     (studio-adapters/dist/timeline/region/NoteRegionBoxAdapter.d.ts)
//   collection.events.asArray(): ReadonlyArray<NoteEventBoxAdapter>
//     (lib-dsp/dist/events.d.ts EventCollection.asArray(),
//      studio-adapters/dist/timeline/collection/NoteEventCollectionBoxAdapter.d.ts)
//   event.position: ppqn, event.duration: ppqn, event.pitch: int, event.velocity: unitValue (0..1)
//     (studio-adapters/dist/timeline/event/NoteEventBoxAdapter.d.ts)
//
// Consistent with importMidi.ts's inferred (SDK-undocumented) convention:
// NoteEventBox.position/duration are LOCAL to the region's note-event
// collection, not absolute timeline position. This function un-does exactly
// what importMidi.ts applied on the way in — absolute event position (ppqn)
// = region.position + event.position — so it doesn't contradict that
// inference. Getting this wrong (e.g. treating event.position as already
// absolute) would silently shift every re-exported note by its region's
// start offset on any project whose regions don't start at ppqn 0.
//
// Deliberate deviation from the plan's pre-spike draft, which called for
// reconstructing a `chordChart: {chord: string}[]` and calling
// `buildMidi(notes, chordChart, bpm)` directly: buildMidi's chordChart
// parameter is a sequence of bare chord SYMBOLS ("C", "Am") that buildMidi
// re-expands into fresh triads on a fixed beat grid. That shape does not
// exist inside an openDAW project — importMidi.ts imports each chord as
// three independent NoteEventBoxes with no chord-symbol annotation anywhere
// in the box graph (confirmed above: NoteEventBox/NoteRegionBox/AudioUnitBox
// have no such field). Re-deriving a chord symbol from a set of *edited* note
// events would require new chord-identification logic this plan never asked
// for, and would be actively wrong once Task 8's piano roll has been used to
// move/resize/delete individual chord-tone notes off buildMidi's fixed beat
// grid — forcing edited notes back onto that grid would silently discard the
// user's edits. So this export function treats every note track uniformly
// (mirroring importMidi.ts, which also doesn't special-case "chords" vs
// "melody" beyond track order) and reuses buildMidi's actual per-note
// track-writing loop directly via the `addNotesToTrack` helper extracted in
// midi.ts for exactly this reuse — the plan's option (b), applied at the
// note-writing-loop granularity rather than the whole two-argument function,
// since the two-argument function's chordChart half doesn't fit this
// direction of the round trip. Track names ("melody"/"chords") are assigned
// positionally on export purely for human-readable parity with the original
// file — cosmetic only, since importMidi.ts's own re-import filters tracks by
// "has notes", never by name or index.
import type { Project } from "@opendaw/studio-core";
import { PPQN, type bpm as Bpm } from "@opendaw/lib-dsp";
import pkg from "@tonejs/midi";
import { addNotesToTrack, type PlayableNote } from "~/lib/audio/midi";
const { Midi } = pkg;

const POSITIONAL_TRACK_NAMES = ["melody", "chords"];

// Walks every note track in the project (via the adapters chain documented
// above) and returns one array of playable notes per note-bearing track, in
// the order the adapters collections report them. A track with regions but
// no note events, or an audio unit with no tracks (e.g. the project's
// default primaryAudioUnitBox before anything is imported), is skipped —
// same "filter by content, not identity" approach importMidi.ts used when
// deciding which decoded MIDI tracks to import.
function collectNoteTracks(project: Project, bpm: Bpm): PlayableNote[][] {
  const tracks: PlayableNote[][] = [];
  for (const audioUnit of project.rootBoxAdapter.audioUnits.adapters()) {
    for (const track of audioUnit.tracks.values()) {
      const notes: PlayableNote[] = [];
      for (const region of track.regions.adapters.values()) {
        if (!region.isNoteRegion()) continue;
        const collection = region.optCollection.unwrapOrNull();
        if (!collection) continue;
        for (const event of collection.events.asArray()) {
          const absolutePositionPpqn = region.position + event.position;
          notes.push({
            pitch: event.pitch,
            startSec: PPQN.pulsesToSeconds(absolutePositionPpqn, bpm),
            durSec: PPQN.pulsesToSeconds(event.duration, bpm),
          });
        }
      }
      if (notes.length > 0) tracks.push(notes);
    }
  }
  return tracks;
}

export function exportProjectToMidi(project: Project, bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);

  const tracks = collectNoteTracks(project, bpm);
  tracks.forEach((notes, i) => {
    const track = midi.addTrack();
    track.name = POSITIONAL_TRACK_NAMES[i] ?? `track-${i}`;
    addNotesToTrack(track, notes);
  });

  return midi.toArray();
}
