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

const ROW_PX = 10; // vertical px per semitone — was 4, too cramped to see or grab a note
const VELOCITY_HANDLE_PX = 20; // height of the draggable velocity bar under each note
// 960 is PPQN.Quarter project-wide (see engine.ts/exportMidi.ts) — kept as a plain
// number, not an SDK import, to preserve this file's deliberate no-@opendaw-import
// boundary (see file header). Only used here for the beat gridline spacing.
const PPQN_QUARTER = 960;
// Accent colors per track, matching produce.tsx's TRACK_ACCENT_COLORS (kept as its
// own small constant here rather than threaded through as a prop — same values,
// one extra line, avoids coupling this SDK-free component to produce.tsx's palette).
const TRACK_COLORS = ["#C97B3C", "#D08A44"];

export type Region = {
  id: string;
  trackId: string;
  pitch: number;
  position: number; // ppqn, absolute timeline position
  duration: number; // ppqn
  velocity: number; // 0..1
};

export function PianoRoll({
  regions,
  pxPerPpqn,
  tracks,
  activeTrackId,
  onActiveTrackChange,
  onMove,
  onResize,
  onVelocityChange,
  onDelete,
  onAddNote,
}: {
  regions: Region[];
  pxPerPpqn: number;
  tracks: { trackId: string; label: string }[];
  activeTrackId: string;
  onActiveTrackChange: (trackId: string) => void;
  // newPitch is included so a single drag gesture can move both time and pitch at once —
  // splitting into two separate callbacks (per-axis) would force two editing.modify() calls
  // per drag frame in produce.tsx for what is really one edit.
  onMove: (id: string, newPosition: number, newPitch: number) => void;
  onResize: (id: string, newDuration: number) => void;
  onVelocityChange: (id: string, newVelocity: number) => void;
  onDelete: (id: string) => void;
  onAddNote: (trackId: string, pitch: number, position: number) => void;
}) {
  const drag = useRef<{
    id: string;
    mode: "move" | "resize" | "velocity";
    startX: number;
    startY: number;
    origPosition: number;
    origDuration: number;
    origPitch: number;
    origVelocity: number;
  } | null>(null);

  function onPointerDown(e: React.PointerEvent, region: Region, mode: "move" | "resize" | "velocity") {
    e.stopPropagation(); // don't let this bubble to the grid's onClick (which adds a new note)
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      id: region.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origPosition: region.position,
      origDuration: region.duration,
      origPitch: region.pitch,
      origVelocity: region.velocity,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    // ppqn is an integer tick count — round every delta before handing it to
    // the callbacks, same clamping style importMidi.ts uses for every other
    // ppqn value it produces (Math.round + Math.max floor).
    const deltaPpqn = Math.round((e.clientX - drag.current.startX) / pxPerPpqn);
    if (drag.current.mode === "move") {
      const deltaPitch = -Math.round((e.clientY - drag.current.startY) / ROW_PX);
      onMove(
        drag.current.id,
        Math.max(0, drag.current.origPosition + deltaPpqn),
        Math.min(127, Math.max(0, drag.current.origPitch + deltaPitch)),
      );
    } else if (drag.current.mode === "resize") {
      onResize(drag.current.id, Math.max(1, drag.current.origDuration + deltaPpqn));
    } else {
      // velocity: drag up = louder. VELOCITY_HANDLE_PX of vertical travel = full 0..1 range.
      const deltaVelocity = -(e.clientY - drag.current.startY) / VELOCITY_HANDLE_PX;
      onVelocityChange(drag.current.id, Math.min(1, Math.max(0, drag.current.origVelocity + deltaVelocity)));
    }
  }

  function onPointerUp() {
    drag.current = null;
  }

  // Click on empty grid space (not on a note/handle/button — those stopPropagation above)
  // adds a new note to whichever track is selected in the "adding to" picker. Pitch from Y,
  // time from X, snapped to the ppqn grid the same way drags are.
  function onGridClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    // Note positions are absolute over the full scrollable content, so a click's
    // on-screen offset needs the container's own scroll added back in — without
    // this, clicking after scrolling placed the note at the wrong position.
    const x = e.clientX - rect.left + el.scrollLeft;
    const y = e.clientY - rect.top + el.scrollTop;
    const position = Math.max(0, Math.round(x / pxPerPpqn));
    const pitch = Math.min(127, Math.max(0, 127 - Math.round(y / ROW_PX)));
    onAddNote(activeTrackId, pitch, position);
  }

  const trackColor = (trackId: string) => {
    const i = Math.max(0, tracks.findIndex((t) => t.trackId === trackId));
    return TRACK_COLORS[i % TRACK_COLORS.length];
  };

  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#a68a63" }}>
          Adding to
        </span>
        <select
          value={activeTrackId}
          onChange={(e) => onActiveTrackChange(e.target.value)}
          style={{
            fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#e9dcc4",
            background: "#1c140c", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8,
            padding: "5px 9px", cursor: "pointer",
          }}
        >
          {tracks.map((t) => (
            <option key={t.trackId} value={t.trackId}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <div
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onGridClick}
        style={{
          position: "relative", height: 340, overflow: "auto", cursor: "copy",
          background: "#0c0704", borderRadius: 10, border: "1px solid rgba(255,255,255,.06)",
          backgroundImage:
            `repeating-linear-gradient(90deg, rgba(255,255,255,.07) 0, rgba(255,255,255,.07) 1px, transparent 1px, transparent ${Math.max(4, pxPerPpqn * PPQN_QUARTER)}px),` +
            `repeating-linear-gradient(0deg, rgba(255,255,255,.05) 0, rgba(255,255,255,.05) 1px, transparent 1px, transparent ${ROW_PX * 12}px)`,
        }}
      >
        {regions.length === 0 && (
          <div style={{ position: "absolute", top: 14, left: 14, fontSize: 12, color: "#8a7458", pointerEvents: "none" }}>
            Click the grid to add a note.
          </div>
        )}
        {regions.map((r) => {
          const color = trackColor(r.trackId);
          return (
            <div
              key={r.id}
              onPointerDown={(e) => onPointerDown(e, r, "move")}
              style={{
                position: "absolute",
                left: r.position * pxPerPpqn,
                width: Math.max(3, r.duration * pxPerPpqn),
                top: (127 - r.pitch) * ROW_PX,
                height: ROW_PX,
                background: color,
                borderRadius: 3,
                boxShadow: "0 1px 3px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.3)",
                cursor: "grab",
              }}
            >
              <div
                onPointerDown={(e) => onPointerDown(e, r, "resize")}
                style={{
                  position: "absolute", right: 0, top: 0, bottom: 0, width: 4,
                  background: "rgba(255,255,255,.35)", borderRadius: "0 3px 3px 0", cursor: "ew-resize",
                }}
              />
              <div
                onPointerDown={(e) => onPointerDown(e, r, "velocity")}
                title={`velocity ${r.velocity.toFixed(2)}`}
                style={{
                  position: "absolute", left: 0, top: ROW_PX + 2, width: 6,
                  height: VELOCITY_HANDLE_PX * r.velocity,
                  background: "#F4EDDB", opacity: 0.7, borderRadius: 2, cursor: "ns-resize",
                }}
              />
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(r.id); }}
                title="Delete note"
                style={{
                  position: "absolute", right: -18, top: -3, width: 14, height: 14, lineHeight: "12px",
                  fontSize: 10, padding: 0, borderRadius: "50%", border: "none",
                  background: "rgba(0,0,0,.55)", color: "#e9dcc4", cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
