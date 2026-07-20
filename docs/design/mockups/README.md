# Design mockups

Exploration screens from the frontend-design brainstorm on 2026-07-20. They are the
visual evidence behind the decision log in
[`../../superpowers/specs/2026-07-20-memo-frontend-design.md`](../../superpowers/specs/2026-07-20-memo-frontend-design.md).

| File | Question it answered | Outcome |
|---|---|---|
| `aesthetic-direction.html` | Studio Dark vs Soft Nocturne vs Paper & Ink | **Paper & Ink** |
| `paper-night.html` | How Paper & Ink handles a dark room | **Newsprint default + Ink dark** |
| `palette.html` | Press Red vs Ink & Ochre vs Mono + One | **Press Red** |
| `typography.html` | Fraunces vs Instrument Serif vs Libre Baskerville | **Fraunces + Inter + JetBrains Mono** |

## Reading them

These are HTML *fragments*, not standalone pages — they were served inside a wrapper
that supplied the page chrome and the `toggleSelect` click handler.

Opening one directly in a browser still works for the purpose you'd want it for: every
phone mockup, swatch ramp and type specimen carries its own inline `<style>`, so the
designs themselves render correctly. Only the surrounding chrome (headings, option
cards, subtitles) will appear unstyled, and clicking an option does nothing.

`typography.html` pulls its faces from Google Fonts and therefore needs a network
connection to render as intended. The shipped app does **not** do this — per the spec,
fonts are self-hosted and subset so the offline app-shell holds.

## Status

Superseded by the spec. Keep them while building components — they are the fastest way
to check an implementation against the intended look — and delete them once the app
itself is the better reference.
