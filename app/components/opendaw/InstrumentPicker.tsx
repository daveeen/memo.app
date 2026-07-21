// Instrument picker for one openDAW track. Kept openDAW-SDK-free on purpose — the
// exact same boundary Task 8's PianoRoll deliberately holds (no `@opendaw/*` import
// anywhere in this file): it deals only in plain instrument-NAME strings, and
// produce.tsx (Task 9) is the piece that maps a chosen name to the real
// `InstrumentFactories.<Name>` factory and calls `project.api.replaceMIDIInstrument`
// inside `project.editing.modify(...)`. That keeps this component testable in
// isolation from the SDK's pre-1.0 churn.
//
// ---- Real option list (NOT the plan's pre-spike placeholder ["piano","synth"]) ----
//
// Per "## Task 1 findings" (bottom of
// docs/superpowers/plans/2026-07-21-opendaw-integration.md): instruments are a FIXED
// SDK list, not free-form. `InstrumentFactories.Named` exposes exactly
// { Apparat, MIDIOutput, Nano, Playfield, Soundfont, Tape, Vaporisateur }. Of those,
// only **Vaporisateur** and **Apparat** are playable with NO sample/soundfont
// attachment (Nano/Playfield/Soundfont each require an attachment payload, Tape is a
// sampler, MIDIOutput emits MIDI rather than producing audio). This headless editor
// ships no asset-provider (engine.ts passes rejecting sample/soundfont providers), so
// the two attachment-free synths are the only swap targets it can honestly offer —
// and importMidi.ts imports every track as Vaporisateur for exactly that reason.
export const INSTRUMENT_OPTIONS = ["Vaporisateur", "Apparat"] as const;
export type InstrumentName = (typeof INSTRUMENT_OPTIONS)[number];

export function InstrumentPicker({
  trackId,
  current,
  onChange,
}: {
  trackId: string;
  current: string;
  onChange: (trackId: string, instrument: InstrumentName) => void;
}) {
  return (
    <select
      value={current}
      onChange={(e) => onChange(trackId, e.target.value as InstrumentName)}
      style={{
        fontFamily: "inherit", fontSize: 12, fontWeight: 700, color: "#e9dcc4",
        background: "#1c140c", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8,
        padding: "6px 10px", cursor: "pointer",
      }}
    >
      {INSTRUMENT_OPTIONS.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}
