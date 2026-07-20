import { describe, it, expect } from "vitest";
import { contrastRatio } from "./contrast";

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colours", () => {
    expect(contrastRatio("#DED7C8", "#DED7C8")).toBeCloseTo(1, 2);
  });

  it("is symmetric", () => {
    const a = contrastRatio("#C62D18", "#DED7C8");
    const b = contrastRatio("#DED7C8", "#C62D18");
    expect(a).toBeCloseTo(b, 5);
  });

  it("measures Press Red on Newsprint at ~3.87:1 (below the 4.5 text floor)", () => {
    // Precise WCAG relative-luminance ratio for #C62D18 on #DED7C8 is
    // 3.868..., which truncates to the "3.8:1" figure quoted in the design
    // spec/prose. toBeCloseTo(3.8, 1) is too tight to cover the untruncated
    // value (tolerance +/-0.05), so we assert the precise measured ratio.
    expect(contrastRatio("#C62D18", "#DED7C8")).toBeCloseTo(3.87, 1);
  });
});
