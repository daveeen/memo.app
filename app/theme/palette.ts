export const TEXT_FLOOR = 4.5;
export const UI_FLOOR = 3;

/**
 * Minimum contrast ratio, token-to-token, that `inkFaint` must maintain
 * against `inkMuted` so the two remain a visibly distinct step in the ink
 * ramp rather than collapsing to the same colour. See palette.test.ts for
 * rationale.
 */
export const FAINT_MUTED_STEP = 1.3;

export interface Theme {
  paper: string;
  paperSunk: string;
  paperRaised: string;
  /** Primary text. Must clear TEXT_FLOOR against `paper`. */
  ink: string;
  /** Secondary text *and* labels (incl. small/uppercase). Must clear TEXT_FLOOR against `paper`. */
  inkMuted: string;
  /**
   * Non-text only: disabled states, hairlines, decorative marks. NEVER used
   * for text of any size (inactive tab labels etc. are text and use
   * `inkMuted` instead). Only needs to clear UI_FLOOR against `paper`.
   */
  inkFaint: string;
  accent: string;
  accentOn: string;
  alt: string;
  sections: Record<"intro" | "verse" | "chorus" | "bridge" | "outro", string>;
}

export const NEWSPRINT: Theme = {
  paper: "#DED7C8",
  paperSunk: "#D2CABA",
  paperRaised: "#E9E4D8",
  ink: "#1A1712",
  inkMuted: "#655D51",
  inkFaint: "#81796B",
  accent: "#C62D18",
  accentOn: "#FFFFFF",
  alt: "#3F6B5C",
  sections: {
    intro: "#1A1712",
    verse: "#6D6558",
    chorus: "#C62D18",
    bridge: "#3F6B5C",
    outro: "#847861",
  },
};

export const INK: Theme = {
  paper: "#16130F",
  paperSunk: "#100E0B",
  paperRaised: "#201C16",
  ink: "#F3EDE1",
  inkMuted: "#A79D8C",
  inkFaint: "#7E7566",
  accent: "#FF4A2E",
  accentOn: "#16130F",
  alt: "#5C9C86",
  sections: {
    intro: "#E8E1D3",
    verse: "#7E7566",
    chorus: "#FF4A2E",
    bridge: "#5C9C86",
    outro: "#6B604F",
  },
};
