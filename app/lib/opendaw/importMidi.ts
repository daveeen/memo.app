// Decodes a .mid file (as produced by app/lib/audio/midi.ts's buildMidi(), which
// emits exactly two note tracks — "melody" and "chords" — via `midi.addTrack()`)
// into a fresh openDAW Project: one Vaporisateur instrument + note track per
// source MIDI track that actually contains notes, with each decoded note
// represented as a NoteEventBox inside a single NoteRegionBox spanning that
// track's notes.
//
// Real confirmed API per "## Task 1 findings" in
// docs/superpowers/plans/2026-07-21-opendaw-integration.md — NOT the plan's
// pre-spike draft signature (`decode midiBytes via MidiFileDecoder` /
// "create a note region/event per decoded note" undersold three real gaps):
//
//   1. MidiFileDecoder wants a `ByteArrayInput` (from @opendaw/lib-std), not a
//      raw ArrayBuffer/Uint8Array — `new MidiFileDecoder(new ByteArrayInput(bytes)).decode()`,
//      synchronous.
//   2. decode() returns raw per-channel `ControlEvent`s (NOTE_ON=144 / NOTE_OFF=128
//      via `ControlType`), NOT pre-paired {pitch,start,duration} notes. NOTE_ON has to
//      be paired with the matching NOTE_OFF (or a NOTE_ON with velocity 0, the common
//      running-status "note off" convention) ourselves — see pairNotes() below.
//   3. Decoded `ticks` are in the file's own `timeDivision` (@tonejs/midi's default,
//      NOT openDAW's PPQN.Quarter=960). Every position/duration must be rescaled by
//      `PPQN.Quarter / format.timeDivision` before handing it to ProjectApi.
//
// ProjectApi.createInstrument/createNoteRegion/createNoteEvent all take ppqn
// (integer) positions/durations, int MIDI pitch, and a 0..1 float velocity (MIDI's
// 0..127 must be normalized by /127). Every mutation must be wrapped in
// `project.editing.modify(() => {...})` — confirmed by ProjectApi.duplicateNotes's
// own doc comment ("caller is responsible for wrapping the call in editing.modify").
//
// NoteEventBox.position/duration are LOCAL to the region's note-event collection,
// not absolute timeline position — inferred from NoteRegionBox also exposing
// `loopOffset`/`loopDuration`/`eventOffset` fields (a clip-content-vs-placement
// split only makes sense if event positions are collection-relative). This import
// doesn't need looping, so loopOffset/loopDuration/eventOffset are left at their
// defaults and every note's position is expressed relative to the region's own
// start (region.position = the track's earliest note, in rescaled ppqn).
import { ByteArrayInput, ArrayMultimap } from "@opendaw/lib-std";
import { MidiFileDecoder, ControlType, type MidiTrack, type ControlEvent, type Channel } from "@opendaw/lib-midi";
import { PPQN } from "@opendaw/lib-dsp";
import { InstrumentFactories } from "@opendaw/studio-adapters";
import type { Project } from "@opendaw/studio-core";

type DecodedNote = {
  pitch: number;
  velocity: number; // raw MIDI 0..127, normalized to 0..1 at the ProjectApi call site
  startTicks: number;
  durationTicks: number;
};

// Pairs NOTE_ON/NOTE_OFF control events into notes, per channel then per pitch,
// in ticks order. Same-pitch NOTE_ONs (e.g. a repeated note) pair FIFO with the
// NOTE_OFFs that follow them. A NOTE_ON with no matching NOTE_OFF before the
// track ends is dropped — buildMidi() (this project's own encoder) never emits
// that, but a hand-authored/foreign .mid could.
// Exported (in addition to importMidiIntoProject) so it can be exercised directly
// by a Node-level roundtrip check without needing a real openDAW Project/ProjectEnv
// (which requires a browser AudioContext and can't be constructed headlessly).
export function pairNotes(controlEvents: ArrayMultimap<Channel, ControlEvent>): DecodedNote[] {
  const notes: DecodedNote[] = [];
  for (const [, events] of controlEvents) {
    const sorted = [...events].sort((a, b) => a.ticks - b.ticks);
    const openByPitch = new Map<number, { ticks: number; velocity: number }[]>();
    for (const event of sorted) {
      const pitch = event.param0;
      const velocity = event.param1;
      const isNoteOff = event.type === ControlType.NOTE_OFF || (event.type === ControlType.NOTE_ON && velocity === 0);
      if (event.type === ControlType.NOTE_ON && !isNoteOff) {
        const stack = openByPitch.get(pitch) ?? [];
        stack.push({ ticks: event.ticks, velocity });
        openByPitch.set(pitch, stack);
      } else if (isNoteOff) {
        const stack = openByPitch.get(pitch);
        const opened = stack?.shift();
        if (opened) {
          notes.push({
            pitch,
            velocity: opened.velocity,
            startTicks: opened.ticks,
            durationTicks: Math.max(1, event.ticks - opened.ticks),
          });
        }
      }
    }
  }
  return notes;
}

// Decodes midiBytes and creates one instrument + note track + note region + note
// events per source MIDI track that contains at least one note (buildMidi()'s
// tempo/meta-only track, if @tonejs/midi emits one, has no note events and is
// skipped — tracks are filtered by content, not by index or name).
export function importMidiIntoProject(project: Project, midiBytes: ArrayBuffer): void {
  const format = new MidiFileDecoder(new ByteArrayInput(midiBytes)).decode();
  const ticksToPpqn = PPQN.Quarter / format.timeDivision;

  project.editing.modify(() => {
    for (const track of format.tracks) {
      const notes = pairNotes(track.controlEvents);
      if (notes.length === 0) continue;

      const { trackBox } = project.api.createInstrument(InstrumentFactories.Vaporisateur);

      const startTicks = Math.min(...notes.map((n) => n.startTicks));
      const endTicks = Math.max(...notes.map((n) => n.startTicks + n.durationTicks));
      const regionStartPpqn = Math.round(startTicks * ticksToPpqn);
      const regionDurationPpqn = Math.max(1, Math.round((endTicks - startTicks) * ticksToPpqn));

      const regionBox = project.api.createNoteRegion({
        trackBox,
        position: regionStartPpqn,
        duration: regionDurationPpqn,
      });

      for (const note of notes) {
        project.api.createNoteEvent({
          owner: { events: regionBox.events },
          position: Math.round(note.startTicks * ticksToPpqn) - regionStartPpqn,
          duration: Math.max(1, Math.round(note.durationTicks * ticksToPpqn)),
          pitch: note.pitch,
          velocity: note.velocity / 127,
        });
      }
    }
  });
}
