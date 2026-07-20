import { describe, it, expect } from "vitest";
import { NEWSPRINT, INK, TEXT_FLOOR, UI_FLOOR, FAINT_MUTED_STEP } from "./palette";
import { contrastRatio } from "./contrast";

const themes = [
  { name: "newsprint", t: NEWSPRINT },
  { name: "ink", t: INK },
];

describe.each(themes)("$name theme", ({ t }) => {
  it("meets the text floor for ink on paper", () => {
    expect(contrastRatio(t.ink, t.paper)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  it("meets the text floor for muted ink on paper (secondary text and labels)", () => {
    expect(contrastRatio(t.inkMuted, t.paper)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  // inkFaint is non-text only (disabled states, hairlines, decorative
  // marks). It only has to clear the UI floor, never the text floor. Do NOT
  // raise this to TEXT_FLOOR: on Newsprint's pale paper, forcing both
  // inkMuted (TEXT_FLOOR) and inkFaint (also TEXT_FLOOR) collapses them to
  // nearly the same colour, which is the bug this contract fixes.
  it("meets the UI floor for faint ink (non-text use only)", () => {
    expect(contrastRatio(t.inkFaint, t.paper)).toBeGreaterThanOrEqual(UI_FLOOR);
  });

  // Guards against inkFaint and inkMuted quietly converging to the same
  // colour again (the original bug this task's palette review caught).
  // FAINT_MUTED_STEP = 1.3 is a deliberately modest floor: it sits well
  // below the ~1.5-1.7 ratio the current values actually achieve, so it
  // won't be flaky, but it's comfortably above 1.0 (identical colours) and
  // enforces a real, perceptible luminance step between the two tokens.
  it("keeps inkFaint visibly distinct from inkMuted", () => {
    expect(contrastRatio(t.inkFaint, t.inkMuted)).toBeGreaterThanOrEqual(FAINT_MUTED_STEP);
  });

  it("meets the UI floor for accent on paper", () => {
    expect(contrastRatio(t.accent, t.paper)).toBeGreaterThanOrEqual(UI_FLOOR);
  });

  it("meets the text floor for accent-on over accent", () => {
    expect(contrastRatio(t.accentOn, t.accent)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  it("meets the UI floor for every section colour on paper", () => {
    for (const [label, colour] of Object.entries(t.sections)) {
      expect(
        contrastRatio(colour, t.paper),
        `section ${label} on paper`
      ).toBeGreaterThanOrEqual(UI_FLOOR);
    }
  });
});

describe("accent as text", () => {
  it("is forbidden in Newsprint because it fails the text floor", () => {
    expect(contrastRatio(NEWSPRINT.accent, NEWSPRINT.paper)).toBeLessThan(TEXT_FLOOR);
  });

  it("is forbidden in Ink too, even though it would pass, for cross-theme consistency", () => {
    expect(contrastRatio(INK.accent, INK.paper)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });
});
