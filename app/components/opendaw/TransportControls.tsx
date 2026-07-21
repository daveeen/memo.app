// Minimal transport UI: play/stop buttons + a live bars:beats position readout.
//
// Takes the project's EngineFacade directly (obtained via `project.engine` — a readonly
// field confirmed on the `Project` class itself, `node_modules/@opendaw/studio-core/dist/
// project/Project.d.ts` line 53: `readonly engine: EngineFacade`). Task 9 wires this up
// from produce.tsx's `project` state as `<TransportControls engine={project.engine} />`.
//
// Real confirmed API — read directly from
// node_modules/@opendaw/studio-core/dist/EngineFacade.d.ts (which matches the "## Task 1
// findings" section of docs/superpowers/plans/2026-07-21-opendaw-integration.md), NOT the
// plan's pre-spike guess of `engine.play()`/`engine.stop()` used as bare method calls
// against a plain scalar position:
//   play(): void
//   stop(reset?: boolean): void
//   get position(): ObservableValue<ppqn>     — no plain scalar getter; must subscribe
//   (isPlaying/bpm also exist as ObservableValue getters but aren't needed for this
//   minimal readout — Tasks 8/9 own richer transport state if/when they need it)
//
// ObservableValue<T> (@opendaw/lib-std, dist/observables.d.ts) exposes
// `catchupAndSubscribe(observer): Subscription` where the observer receives the
// ObservableValue itself (read the current value via `.getValue()`), and `Subscription`
// (dist/terminable.d.ts) is a `Terminable` — `.terminate()` unsubscribes.
//
// Position is ppqn (pulses, NOT seconds/ms — PPQN.Quarter === 960). Converted to a
// 1-indexed bar:beat readout via `PPQN.toParts()` (@opendaw/lib-dsp), whose `bars`/`beats`
// fields are 0-indexed pulse-math (confirmed by reading dist/ppqn.js) — the +1s below are
// this component's own display convention, not part of the confirmed API surface.
import { useEffect, useState } from "react";
import type { EngineFacade } from "@opendaw/studio-core";
import { PPQN } from "@opendaw/lib-dsp";

export function TransportControls({ engine }: { engine: EngineFacade }) {
  const [position, setPosition] = useState(() => engine.position.getValue());

  useEffect(() => {
    const subscription = engine.position.catchupAndSubscribe((observable) => setPosition(observable.getValue()));
    return () => subscription.terminate();
  }, [engine]);

  const { bars, beats } = PPQN.toParts(position);

  return (
    <div>
      <button onClick={() => engine.play()}>▶ Play</button>
      <button onClick={() => engine.stop()}>■ Stop</button>
      <span>
        {bars + 1}:{beats + 1}
      </span>
    </div>
  );
}
