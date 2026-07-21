// DOM-based (native pointer events on positioned <div>s, no canvas) piano-roll
// grid: renders one horizontal bar per note, with pointer-drag-to-move,
// drag-right-edge-to-resize, and a delete button. Matches this codebase's
// low-tooling style everywhere else (no other component reaches for canvas).
//
// Per Task 8 in docs/superpowers/plans/2026-07-21-opendaw-integration.md: this
// component has NO direct openDAW dependency — no `@opendaw/*` import anywhere
// in this file. It receives an already-flattened `Region[]` and three plain
// callbacks; the real `project.editing.modify(...)` mutation happens in
// produce.tsx (Task 9), which is the piece that actually needs Task 1's
// findings. That keeps this file fully specifiable now and testable in
// isolation from the SDK's pre-1.0 version churn — same reasoning
// TransportControls.tsx (Task 7) documents for why IT does need the real API
// and this component doesn't.
//
// ---- Region shape: ppqn, not startSec/durSec (deviation from the plan's
// pre-spike draft) ----
//
// The plan's Task 8 draft used `{ startSec: number; durSec: number }`. Per
// "## Task 1 findings" (bottom of the plan file) + app/lib/opendaw/exportMidi.ts
// (Task 5, already built)'s confirmed read-side walk, a note read off a live
// `Project` comes out of the adapters chain
//   project.rootBoxAdapter.audioUnits.adapters()
//     -> audioUnit.tracks.values()
//       -> track.regions.adapters.values() (filtered to region.isNoteRegion())
//         -> region.optCollection -> collection.events.asArray()
// as a `NoteEventBoxAdapter` exposing `pitch: int`, `position: ppqn`,
// `duration: ppqn` (position is LOCAL to its parent region — exportMidi.ts's
// `collectNoteTracks` computes the absolute timeline position as
// `region.position + event.position` before doing anything else with it).
// There is no seconds-denominated note shape anywhere in the box graph;
// exportMidi.ts only converts to seconds at its very last step, handing notes
// to `buildMidi()` for `.mid` BYTE output — that's a file-format convention,
// not the live project's native representation.
//
// Decision: this component works in ppqn, not seconds.
//   - The data this component will actually be fed (Task 9) comes straight off
//     the adapters chain above, already in ppqn — accepting ppqn means Task 9
//     passes `event.pitch/position/duration` straight through with zero
//     conversion, instead of converting to seconds on the way in.
//   - The onMove/onResize/onDelete callbacks are wired by Task 9 to
//     `project.editing.modify(() => {...})` calls that set the underlying
//     `NoteEventBox`/`NoteRegionBox` position/duration FIELDS directly — Task 1's
//     findings are explicit that "there is no `ProjectApi.deleteRegion` /
//     mutate-region method — region/note edits are box-graph-level field
//     setters/deletions inside `editing.modify`" — and those fields are
//     themselves ppqn ints. A seconds-based callback contract would force
//     Task 9 to convert seconds back to ppqn (`PPQN.secondsToPulses`) on every
//     single drag frame just to undo a conversion this component performed
//     converting the other way — pure round-trip loss for no benefit, and a
//     real risk of rounding drift accumulating over repeated small drags.
//   - Rendering doesn't need seconds either: `pxPerPpqn` (renamed from the
//     draft's `pxPerSec`) is exactly as valid a linear horizontal scale factor
//     as `pxPerSec` was — ppqn is just a different, equally-linear time axis.
//
// `position` here is ABSOLUTE timeline ppqn (`region.position + event.position`,
// exactly as exportMidi.ts's `collectNoteTracks` computes it), not
// region-local — this component draws a whole project's notes on one
// continuous axis, and only Task 9 (which has the parent region in scope both
// when it builds this array and when it writes an edit back) needs to convert
// to/from a region-local offset.
//
// Each `Region` entry here is one NOTE (one `NoteEventBoxAdapter`), not one
// `NoteRegionBox` clip — the plan's Task 8 draft named the type/prop
// `Region`/`regions`, and this file keeps that naming for continuity with the
// plan and with produce.tsx's prose ("PianoRoll fed from the project's current
// regions"), but each bar this component draws corresponds to a single note
// event (it has its own `pitch`), matching the draft's own render code
// (`top: (127 - r.pitch) * 4`) — one row per note, not one row per clip.
import { useRef } from "react";

export type Region = {
  id: string;
  trackId: string;
  pitch: number;
  position: number; // ppqn, absolute timeline position
  duration: number; // ppqn
};

export function PianoRoll({
  regions,
  pxPerPpqn,
  onMove,
  onResize,
  onDelete,
}: {
  regions: Region[];
  pxPerPpqn: number;
  onMove: (id: string, newPosition: number) => void;
  onResize: (id: string, newDuration: number) => void;
  onDelete: (id: string) => void;
}) {
  const drag = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    origPosition: number;
    origDuration: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent, region: Region, mode: "move" | "resize") {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      id: region.id,
      mode,
      startX: e.clientX,
      origPosition: region.position,
      origDuration: region.duration,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    // ppqn is an integer tick count — round every delta before handing it to
    // the callbacks, same clamping style importMidi.ts uses for every other
    // ppqn value it produces (Math.round + Math.max floor).
    const deltaPpqn = Math.round((e.clientX - drag.current.startX) / pxPerPpqn);
    if (drag.current.mode === "move") {
      onMove(drag.current.id, Math.max(0, drag.current.origPosition + deltaPpqn));
    } else {
      onResize(drag.current.id, Math.max(1, drag.current.origDuration + deltaPpqn));
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  return (
    <div
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ position: "relative", height: 300, overflowX: "auto" }}
    >
      {regions.map((r) => (
        <div
          key={r.id}
          onPointerDown={(e) => onPointerDown(e, r, "move")}
          style={{
            position: "absolute",
            left: r.position * pxPerPpqn,
            width: r.duration * pxPerPpqn,
            top: (127 - r.pitch) * 4,
            height: 4,
            background: "#6cf",
          }}
        >
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onPointerDown(e, r, "resize");
            }}
            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 4, cursor: "ew-resize" }}
          />
          <button onClick={() => onDelete(r.id)} style={{ position: "absolute", right: -16, fontSize: 10 }}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
