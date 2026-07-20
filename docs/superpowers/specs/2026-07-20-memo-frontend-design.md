# Memo — Frontend Design Spec

**Date:** 2026-07-20
**Scope:** Visual design, theme, palette, component styling — the section the Final Plan memo deferred.
**Non-scope:** Architecture, DSP, backend, data model. Those are settled in `Memo — Final Plan.txt` and are treated here as fixed constraints.

---

## 1. Concept

Memo is a **printed songwriting notebook that can hear.**

Warm newsprint, black ink, one press red. The interface should read as a two-colour printed artifact rather than an app: flat surfaces, hairline rules, typographic hierarchy instead of chrome. No blur shadows anywhere — paper does not glow. The single exception is a hard 3px ink offset beneath the record button, which reads as letterpress relief, not as elevation.

This directly serves the judging criteria:

- **Niche/personal + creative (40)** — a distinctive, committed aesthetic that looks like a real habit-driven product, not a hackathon shell.
- **Technical (20)** — monospaced, measured-looking data readouts make the DSP legible as measurement rather than generation.
- **Demo (10)** — high-contrast ink-on-paper survives a projector; a dark theme exists for the room itself.

### Design target

Phone-first, demo-safe. Designed as a genuine mobile app, with a legibility floor that guarantees it reads from ~5m on a projector.

---

## 2. Foundations

### 2.1 Colour — Newsprint (default theme)

| Token | Value | Role |
|---|---|---|
| `--paper` | `#DED7C8` | base surface |
| `--paper-sunk` | `#D2CABA` | inputs, wells, scrubber track |
| `--paper-raised` | `#E9E4D8` | cards, sheets |
| `--ink` | `#1A1712` | primary text, rules, waveforms |
| `--ink-muted` | `#6D6558` | metadata, secondary text |
| `--ink-faint` | `#8A8172` | labels, disabled |
| `--accent` | `#C62D18` | live state, chorus, primary action |
| `--accent-on` | `#FFFFFF` | text on accent fills |
| `--alt` | `#3F6B5C` | bridge, secondary data |

**Section ramp** — `--sec-intro` `#1A1712` · `--sec-verse` `#6D6558` · `--sec-chorus` `#C62D18` · `--sec-bridge` `#3F6B5C` · `--sec-outro` `#B9B1A0`

### 2.2 Colour — Ink (dark theme)

Same token names, re-bound. No component knows which theme is active.

| Token | Value |
|---|---|
| `--paper` | `#16130F` |
| `--paper-sunk` | `#100E0B` |
| `--paper-raised` | `#201C16` |
| `--ink` | `#F3EDE1` |
| `--ink-muted` | `#A79D8C` |
| `--ink-faint` | `#7E7566` |
| `--accent` | `#FF4A2E` |
| `--accent-on` | `#16130F` |
| `--alt` | `#5C9C86` |

**Section ramp (value-inverted)** — `--sec-intro` `#E8E1D3` · `--sec-verse` `#7E7566` · `--sec-chorus` `#FF4A2E` · `--sec-bridge` `#5C9C86` · `--sec-outro` `#3A342B`

Theme switches via `data-theme` on the root, defaulting to Newsprint. A manual toggle lives in settings; `prefers-color-scheme` is respected on first load only.

**Hard rule:** no literal colour value appears outside the token definition file. This is what keeps Ink a variable swap rather than a retrofit. Violating it on Day 1 turns dark mode into a Day-3 contrast-bug hunt.

### 2.3 Contrast and legibility floor

- Ink on paper ≈ 12.6:1.
- Accent on paper ≈ **3.8:1** (measured, not estimated). This fails normal-text contrast. **Accent never sets text on paper**, at any size. It is permitted only for fills, rules ≥1.5px, and non-text graphical marks — where it clears the 3:1 UI floor. Text that must be red sits on an accent *fill* using `--accent-on`, never red-on-paper.
- `--accent-on` (white) on accent ≈ 5.5:1 — passes normal text; ≥14px.
- **Theme asymmetry:** in Ink, accent on paper ≈ 5.6:1 and *does* pass for text. Do not exploit this — accent-as-text must stay forbidden in both themes, or the same component renders legibly in dark and illegibly in light.
- Text contrast floor 4.5:1; UI/graphical floor 3:1.
- No type below 10px anywhere; all mono data ≥12px.
- Section colour is **always** paired with a text label. Colour alone never encodes meaning.

### 2.4 Typography

Self-hosted, subset, `font-display: swap`. Fraunces ships as one variable file. No third-party font fetch — it would hole the offline app-shell and risks blank text on venue wifi during a timed demo.

| Role | Face | Spec |
|---|---|---|
| Display | Fraunces 700 | 34 / 1.02 / `-0.025em` |
| H1 | Fraunces 700 | 27 / 1.08 |
| H2 | Fraunces 600 | 20 / 1.2 |
| Body | Inter 400 | 15 / 1.5 |
| Label | Inter 600 | 10 / `0.16em` / uppercase |
| Data (hero) | JetBrains Mono 700 | 19 / `-0.02em` |
| Data (inline) | JetBrains Mono 500 | 12 |
| Chord symbol | Fraunces 600 | 17 in chart · 28 in focused section |

Mono is load-bearing, not decorative: monospaced key/BPM values read as instrument output. This is the "not an LLM wrapper" argument made typographically.

### 2.5 Space, shape, iconography

- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Radius: `0` on rules and sheets, `4px` on chips and buttons, `50%` on the record button only.
- Shadows: none, except the record button's hard `0 3px 0 var(--ink)` offset.
- **Icons: almost none.** Actions and tabs are labelled in small-caps Inter. The only glyphs are primitives the aesthetic already owns — record square/circle, play triangle, pause bars, live red dot. No icon library is installed.

---

## 3. App shell

**Structure:** masthead → content → footer tab rule.

- **Masthead** — `MEMO` in small-caps Inter at left; contextual status at right (`● Listening 0:07`, `Analysing…`, `Saved`, `offline`). A masthead, not an app bar: hairline rule beneath, no fill, no elevation.
  - Per §2.3, in the live state **only the dot is accent** (a graphical mark); the accompanying text is `--ink`. This status counter is the *recording elapsed time*, unrelated to the time-saved timer in §4.6.
- **Tabs** — `Ideas · Record · Songs`, set as labels on a hairline ink rule rather than a floating bar. Active tab is ink; inactive is `--ink-faint`. Respects `env(safe-area-inset-bottom)`.
- Vibe Brief has no tab; it lives inside the Songs flow.

**Responsive:** fully responsive, constrained to **exactly two breakpoints** — ≥720px and ≥1100px. Layout is expressed through a small set of container primitives so screens inherit responsive behaviour rather than each authoring it.

**Contingency:** if Day 3 runs short, capping the container width yields a centred phone column on a newsprint field with nothing broken. This fallback must remain available — no screen may depend on a wide layout for correctness.

---

## 4. Screens

### 4.1 Record

Calm by default. Halftone bloom visualizer, mono elapsed counter, red record button.

**Halftone bloom** — the waveform is printed halftone dots that grow and darken with amplitude, red blooming on peaks. Performance guardrails, all mandatory:

- Fixed grid of ~192 dots, canvas 2D, drawn from **one pre-rendered dot sprite** (no per-dot path fills).
- Own rAF loop, capped at 30fps, fully decoupled from analysis.
- **Silent automatic downgrade** to a plain ink trace if frame time exceeds budget for ~20 consecutive frames.
- Renders nothing when no audio is present.

**Threading constraint:** Essentia.js runs in a **Web Worker**. WASM analysis on the main thread freezes rAF, stalling the visualizer at the moment the app should look most alive — seconds, not milliseconds, on a mid-range phone. This must be priced into the Day 1 spike.

### 4.2 Analysis reveal

Triggered on stop. Values fade up in mono, one per ~350ms, in order: **input-type → tempo → key → mood**. Opacity only, no movement.

Mood carries a marker distinguishing **inferred** (LLM) from **measured** (DSP). Making that distinction visible is the honest form of the anti-LLM-wrapper claim, and it earns trust for every other value on screen.

### 4.3 Idea Bank

Hairline-ruled index rows — 7–8 visible on a phone. Each row: title in Fraunces, key/BPM/mood in mono, and the waveform fingerprint. Tap anywhere plays inline. Title is editable in place.

**Fingerprint spec** — deliberately *not* a standard mirrored-bar waveform:

- ~40 downsampled amplitude points.
- Single filled polygon, drawn baseline-up.
- Hard mitre joins, **no smoothing, no rounded caps**.
- Asymmetric about the baseline — a profile, not a symmetric blob.
- Reads as a seismograph trace or cut mountain silhouette. Sharp, angular, unique per take.

**Filtering** — a mono facet strip beneath the masthead: `mood · key · bpm · input` as small-caps toggles, active facet filled accent. No dropdowns, no modals.

### 4.4 Vibe Brief

Presented as a **recipe card**: *Ingredients* (key, BPM, chord progression) then *Method* (section order). Warm framing chosen deliberately — the memo's own non-musician accessibility goal is better served by "ingredients and method" than by a lab report.

Rigour is preserved by keeping all **values in mono** and carrying a provenance line: `measured from 30s preview · Essentia`. Visual register is mid-century printed cookbook — still squarely Paper & Ink.

**Low-confidence state:** when self-similarity segmentation is unreliable and the fixed-length fallback is used, Method renders with **dashed rules and an `estimated` marker**. Showing the seam is required, not optional — an unmarked wrong section map costs more trust than a marked estimate.

### 4.5 Song Builder

**Structure map leads.** Section blocks stack down the page as the song's spine; each expands to reveal its chords. Instrumentation sits as a footer list. One scroll tells the whole song's story, and a non-musician can read it without knowing what `Am` means.

**Transport** — persistent, docked above the tab rule whenever a song is loaded: play/pause, mono elapsed, and a compressed halftone strip of the full song as scrubber. The currently-sounding section fills accent in the map above, connecting sound to structure without labels.

**Completion stamp** — shows the **stage breakdown**, not just a total: `captured 0:00 · analysed 0:14 · brief 1:31 · built 8:42`, in mono. A total alone is an assertion; a breakdown reads as instrumentation.

**Handoff** — paired footer actions: `Open in openDAW` (primary) and `Export .mid` (secondary). The export action must read as complete and intentional on its own, because openDAW is the memo's designated drop-if-short feature. Its absence must never look like something is missing.

### 4.6 Timer

No running timer in the product UI. Elapsed time and the `vs ~3–4 hrs by hand` comparison appear **only on the completion stamp**. This protects the product feeling (the 40-point criterion) at some cost to visible proof (the 30-point one); the stage breakdown above is the mitigation, and the pitch deck can carry a live clock if more visible accumulation is wanted.

---

## 5. Motion

- State changes: 120ms opacity, ease-out.
- Route changes: 200ms opacity, ease-out.
- Analysis reveal: 350ms stagger, opacity only.
- **Opacity over transform throughout** — cheap to render, and nothing jumps mid-demo.
- `prefers-reduced-motion: reduce` → reveal stagger becomes instant, halftone bloom freezes to a static trace.
- Nothing animates on route change within the Song Builder during playback.

---

## 6. System states

| State | Treatment |
|---|---|
| Empty bank (first run) | A printed invitation in Fraunces with a single clear action. No illustration, no empty-state mascot. |
| Analysis in progress | Masthead status `Analysing…`; content area holds its layout to avoid reflow. |
| Mic permission denied | Plain-language ink copy plus a real next action. No error iconography. |
| Analysis failed | States what failed and offers re-record. Never a bare "something went wrong". |
| Low-confidence result | Dashed rules plus `estimated` marker, per §4.4. |
| Offline | Masthead `offline` marker. Cached ideas remain playable; build actions disable **with a stated reason** rather than failing silently. |
| Auth / magic-link | Full-page newsprint sheet: masthead, one field, one action, plus a "check your email" confirmation state. |

---

## 7. Component inventory

Built as tokens-first primitives so responsiveness and theming are inherited:

- **Layout** — `Sheet`, `Container`, `Rule`, `Masthead`, `TabRule`
- **Type** — `Display`, `Heading`, `Body`, `Label`, `Data` (mono), `Chord`
- **Controls** — `RecordButton`, `Button` (primary/secondary/disabled), `FacetToggle`, `Transport`
- **Audio** — `HalftoneBloom`, `Fingerprint`, `Scrubber`
- **Domain** — `BankRow`, `RecipeCard`, `SectionBlock`, `ChordChart`, `CompletionStamp`, `ProvenanceLine`

---

## 8. Accessibility floor

- Contrast per §2.3, enforced in both themes.
- Colour never the sole carrier of meaning (sections always labelled).
- All controls keyboard reachable with a visible focus ring — 2px ink outline, 2px offset.
- Touch targets ≥44px.
- `prefers-reduced-motion` honoured per §5.
- Live status changes announced via a polite live region (recording started/stopped, analysis complete).

---

## 9. Risks carried by this design

| Risk | Mitigation |
|---|---|
| Fully responsive is the most expensive shell option on a 2.5-day clock | Two breakpoints only; container primitives; centred-column fallback stays available at zero cost |
| Halftone bloom is the most expensive visualizer per frame | Sprite-based drawing, 30fps cap, silent downgrade to ink trace |
| Essentia on main thread would stall the visualizer | Worker required; validated in the Day 1 spike |
| Two themes double the styling surface | Strict token discipline from the first component; no literal hex outside the token file |
| Timer only on completion weakens visible proof | Stage breakdown on the stamp; live clock moved to the pitch deck |
| Recipe-card framing could read as cute and cost technical credibility | Mono values plus visible provenance line |

---

## 10. Decision log

| # | Decision | Chosen |
|---|---|---|
| 1 | Design target | Phone-first, demo-safe |
| 2 | Aesthetic direction | Paper & Ink |
| 3 | Theme model | Newsprint default + Ink dark |
| 4 | Palette | Press Red |
| 5 | Typography | Fraunces + Inter + JetBrains Mono |
| 6 | Navigation | Bottom tabs — Ideas / Record / Songs |
| 7 | Wide screen | Fully responsive |
| 8 | Visualizer | Halftone bloom |
| 9 | Analysis reveal | After stop, staged |
| 10 | Bank entries | Index rows + angular fingerprint |
| 11 | Vibe Brief | Recipe card |
| 12 | Song Builder | Structure map leads, chords nested |
| 13 | Timer | Completion screen only |
| 14 | Iconography | Almost none — words and shapes |
