# Memo Frontend Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Memo's complete UI layer — design tokens, both themes, primitives, and all five screens — rendering from mock fixtures, so it can be developed in parallel with the DSP and Supabase work streams.

**Architecture:** React Router 7 in framework mode with SSR disabled (SPA, per the memo's Cloudflare Pages target). Styling is plain CSS with custom properties in a single token file plus CSS Modules per component — no utility framework, because the spec's hard rule is that no literal colour may appear outside the token file, and that rule is machine-enforced by a test in Task 3. Audio visuals are split into pure functions (testable) and thin canvas/SVG renderers (not unit-tested).

**Tech Stack:** React Router 7, React 18, TypeScript, Vite, Vitest, @testing-library/react, jsdom, @fontsource-variable (Fraunces, Inter, JetBrains Mono).

**Source spec:** [`../specs/2026-07-20-memo-frontend-design.md`](../specs/2026-07-20-memo-frontend-design.md)

**Out of scope:** Essentia.js, Supabase, Tone.js, @tonejs/midi, openDAW, auth. Every screen renders from `app/mock/fixtures.ts`. Buttons that would trigger real work call no-op handlers.

---

## File Structure

| Path | Responsibility |
|---|---|
| `app/root.tsx` | HTML document, theme attribute, font imports |
| `app/routes.ts` | Route table |
| `app/routes/ideas.tsx` | Idea Bank screen |
| `app/routes/record.tsx` | Record screen |
| `app/routes/songs.tsx` | Songs list |
| `app/routes/songs.$id.tsx` | Song Builder |
| `app/routes/brief.tsx` | Vibe Brief |
| `app/styles/tokens.css` | **The only file containing literal colours** |
| `app/styles/base.css` | Reset, type scale, spacing scale |
| `app/theme/contrast.ts` | WCAG contrast maths (pure) |
| `app/theme/theme.ts` | Theme resolution (pure) |
| `app/theme/ThemeProvider.tsx` | Applies `data-theme` to root |
| `app/components/layout/*` | `Sheet`, `Container`, `Rule`, `Masthead`, `TabRule` |
| `app/components/type/*` | `Display`, `Heading`, `Body`, `Label`, `Data`, `Chord` |
| `app/components/controls/*` | `Button`, `RecordButton`, `FacetToggle`, `Transport` |
| `app/components/audio/fingerprint.ts` | Peak extraction + SVG path (pure) |
| `app/components/audio/Fingerprint.tsx` | SVG renderer |
| `app/components/audio/bloom.ts` | Frame budget / downgrade logic (pure) |
| `app/components/audio/HalftoneBloom.tsx` | Canvas renderer |
| `app/components/domain/*` | `BankRow`, `RecipeCard`, `SectionBlock`, `ChordChart`, `CompletionStamp`, `ProvenanceLine`, `AnalysisReveal` |
| `app/mock/fixtures.ts` | All mock data |

---

## Task 1: Scaffold the project

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `react-router.config.ts`, `app/root.tsx`, `app/routes.ts`, `app/routes/record.tsx`

- [ ] **Step 1: Scaffold React Router 7 into the repo root**

Run from the repo root (`memo.app/`):

```bash
npx create-react-router@latest . --template remix-run/react-router-templates/default --no-git-init --no-install
```

If prompted to overwrite `README.md`, accept. Then:

```bash
npm install
```

- [ ] **Step 2: Disable SSR (SPA mode)**

Replace `react-router.config.ts` with:

```ts
import type { Config } from "@react-router/dev/config";

export default {
  ssr: false,
} satisfies Config;
```

- [ ] **Step 3: Verify the dev server boots**

Run: `npm run dev`
Expected: Vite prints a `http://localhost:5173` URL and the page loads without console errors. Stop the server with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold React Router 7 in SPA mode"
```

---

## Task 2: Set up Vitest

**Files:**
- Create: `vitest.config.ts`, `test/setup.ts`, `app/smoke.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install test dependencies**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["app/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
  },
});
```

Note: `vite-tsconfig-paths` ships with the React Router template. If `npm run test` later fails to resolve it, install with `npm install -D vite-tsconfig-paths`.

- [ ] **Step 3: Write `test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a smoke test at `app/smoke.test.ts`**

```ts
import { describe, it, expect } from "vitest";

describe("test harness", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npm run test`
Expected: PASS, 1 test passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: set up Vitest with jsdom and Testing Library"
```

---

## Task 3: Design tokens with enforced contrast

This task encodes the spec's §2.3 contrast floor as executable tests. The spec records a real bug caught during review — Press Red on Newsprint is 3.8:1, not the 4.6:1 originally assumed — so these tests exist to stop that class of error recurring.

**Files:**
- Create: `app/theme/contrast.ts`, `app/theme/contrast.test.ts`, `app/theme/palette.ts`, `app/theme/palette.test.ts`, `app/styles/tokens.css`
- Test: `app/theme/no-hex-outside-tokens.test.ts`

- [ ] **Step 1: Write the failing contrast test at `app/theme/contrast.test.ts`**

```ts
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

  it("measures Press Red on Newsprint at ~3.8:1", () => {
    expect(contrastRatio("#C62D18", "#DED7C8")).toBeCloseTo(3.8, 1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- contrast`
Expected: FAIL — `Failed to resolve import "./contrast"`.

- [ ] **Step 3: Implement `app/theme/contrast.ts`**

```ts
function channelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(hex: string): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (
    0.2126 * channelToLinear(r) +
    0.7152 * channelToLinear(g) +
    0.0722 * channelToLinear(b)
  );
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- contrast`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing palette test at `app/theme/palette.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { NEWSPRINT, INK, TEXT_FLOOR, UI_FLOOR } from "./palette";
import { contrastRatio } from "./contrast";

const themes = [
  { name: "newsprint", t: NEWSPRINT },
  { name: "ink", t: INK },
];

describe.each(themes)("$name theme", ({ t }) => {
  it("meets the text floor for ink on paper", () => {
    expect(contrastRatio(t.ink, t.paper)).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  it("meets the text floor for muted ink on paper", () => {
    expect(contrastRatio(t.inkMuted, t.paper)).toBeGreaterThanOrEqual(TEXT_FLOOR);
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
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm run test -- palette`
Expected: FAIL — `Failed to resolve import "./palette"`.

- [ ] **Step 7: Implement `app/theme/palette.ts`**

```ts
export const TEXT_FLOOR = 4.5;
export const UI_FLOOR = 3;

export interface Theme {
  paper: string;
  paperSunk: string;
  paperRaised: string;
  ink: string;
  inkMuted: string;
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
  inkMuted: "#6D6558",
  inkFaint: "#8A8172",
  accent: "#C62D18",
  accentOn: "#FFFFFF",
  alt: "#3F6B5C",
  sections: {
    intro: "#1A1712",
    verse: "#6D6558",
    chorus: "#C62D18",
    bridge: "#3F6B5C",
    outro: "#B9B1A0",
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
    outro: "#3A342B",
  },
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npm run test -- palette`
Expected: PASS. If `--sec-outro` in Newsprint (`#B9B1A0`) fails the UI floor against paper, that is a genuine spec finding — record it, darken the value until it clears 3:1, and update the spec's §2.1 table to match.

- [ ] **Step 9: Write `app/styles/tokens.css`**

This is the only file in the codebase permitted to contain literal colour values.

```css
:root,
:root[data-theme="newsprint"] {
  --paper: #DED7C8;
  --paper-sunk: #D2CABA;
  --paper-raised: #E9E4D8;
  --ink: #1A1712;
  --ink-muted: #6D6558;
  --ink-faint: #8A8172;
  --accent: #C62D18;
  --accent-on: #FFFFFF;
  --alt: #3F6B5C;

  --sec-intro: #1A1712;
  --sec-verse: #6D6558;
  --sec-chorus: #C62D18;
  --sec-bridge: #3F6B5C;
  --sec-outro: #B9B1A0;
}

:root[data-theme="ink"] {
  --paper: #16130F;
  --paper-sunk: #100E0B;
  --paper-raised: #201C16;
  --ink: #F3EDE1;
  --ink-muted: #A79D8C;
  --ink-faint: #7E7566;
  --accent: #FF4A2E;
  --accent-on: #16130F;
  --alt: #5C9C86;

  --sec-intro: #E8E1D3;
  --sec-verse: #7E7566;
  --sec-chorus: #FF4A2E;
  --sec-bridge: #5C9C86;
  --sec-outro: #3A342B;
}

:root {
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;

  --radius-none: 0;
  --radius-chip: 4px;

  --dur-state: 120ms;
  --dur-route: 200ms;
  --dur-reveal: 350ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
}
```

- [ ] **Step 10: Write the hex-literal guard test at `app/theme/no-hex-outside-tokens.test.ts`**

This makes the spec's hard rule mechanically enforceable, so dark mode stays a variable swap.

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

// Node 22+ exposes globSync from node:fs. If unavailable, swap to fast-glob.
const CSS_FILES = globSync("app/**/*.css").filter(
  (f: string) => !f.replace(/\\/g, "/").endsWith("app/styles/tokens.css")
);

describe("colour discipline", () => {
  it("finds CSS files to check", () => {
    expect(CSS_FILES.length).toBeGreaterThan(0);
  });

  it.each(CSS_FILES)("%s contains no literal hex colours", (file: string) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    const matches = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(
      matches,
      `Use a token from tokens.css instead of a literal colour. Found: ${matches.join(", ")}`
    ).toEqual([]);
  });
});
```

- [ ] **Step 11: Run the full suite**

Run: `npm run test`
Expected: PASS. The `finds CSS files to check` assertion will fail until Task 4 creates `base.css` — that is intentional and resolves in the next task. If it fails now, proceed to Task 4 and re-run.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: add design tokens with enforced contrast floors"
```

---

## Task 4: Typography and base styles

**Files:**
- Create: `app/styles/base.css`
- Modify: `app/root.tsx`

- [ ] **Step 1: Install self-hosted fonts**

Per the spec, fonts are self-hosted and subset — never fetched from Google — so the offline app-shell holds and venue wifi cannot cause blank text.

```bash
npm install @fontsource-variable/fraunces @fontsource-variable/inter @fontsource-variable/jetbrains-mono
```

- [ ] **Step 2: Write `app/styles/base.css`**

```css
@import "@fontsource-variable/fraunces/index.css";
@import "@fontsource-variable/inter/index.css";
@import "@fontsource-variable/jetbrains-mono/index.css";

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  background: var(--paper);
  color: var(--ink);
  font-family: "Inter Variable", ui-sans-serif, system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.u-display {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 700;
  font-size: 34px;
  line-height: 1.02;
  letter-spacing: -0.025em;
  margin: 0;
}

.u-h1 {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 700;
  font-size: 27px;
  line-height: 1.08;
  margin: 0;
}

.u-h2 {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 600;
  font-size: 20px;
  line-height: 1.2;
  margin: 0;
}

.u-body {
  font-size: 15px;
  line-height: 1.5;
  margin: 0;
}

.u-label {
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin: 0;
}

.u-data {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-weight: 500;
  font-size: 12px;
}

.u-data--hero {
  font-weight: 700;
  font-size: 19px;
  letter-spacing: -0.02em;
}

.u-chord {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 600;
  font-size: 17px;
}

.u-chord--focus {
  font-size: 28px;
}

:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Import both stylesheets in `app/root.tsx`**

Near the top of `app/root.tsx`, alongside the existing imports:

```tsx
import "./styles/tokens.css";
import "./styles/base.css";
```

- [ ] **Step 4: Run the full suite**

Run: `npm run test`
Expected: PASS, including `no-hex-outside-tokens` now that `base.css` exists and contains no literal colours.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add typography scale and self-hosted fonts"
```

---

## Task 5: Theme resolution and provider

**Files:**
- Create: `app/theme/theme.ts`, `app/theme/theme.test.ts`, `app/theme/ThemeProvider.tsx`
- Modify: `app/root.tsx`

- [ ] **Step 1: Write the failing test at `app/theme/theme.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { resolveInitialTheme } from "./theme";

describe("resolveInitialTheme", () => {
  it("prefers a stored choice over the system preference", () => {
    expect(resolveInitialTheme("ink", false)).toBe("ink");
    expect(resolveInitialTheme("newsprint", true)).toBe("newsprint");
  });

  it("falls back to the system preference when nothing is stored", () => {
    expect(resolveInitialTheme(null, true)).toBe("ink");
    expect(resolveInitialTheme(null, false)).toBe("newsprint");
  });

  it("ignores an unrecognised stored value", () => {
    expect(resolveInitialTheme("chartreuse", true)).toBe("ink");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- theme`
Expected: FAIL — `Failed to resolve import "./theme"`.

- [ ] **Step 3: Implement `app/theme/theme.ts`**

```ts
export type ThemeName = "newsprint" | "ink";

export const STORAGE_KEY = "memo.theme";

export function resolveInitialTheme(
  stored: string | null,
  prefersDark: boolean
): ThemeName {
  if (stored === "newsprint" || stored === "ink") return stored;
  return prefersDark ? "ink" : "newsprint";
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- theme`
Expected: PASS, 3 tests.

- [ ] **Step 5: Implement `app/theme/ThemeProvider.tsx`**

Per the spec, `prefers-color-scheme` is honoured on first load only; after that the stored choice wins.

```tsx
import { createContext, useContext, useEffect, useState } from "react";
import { resolveInitialTheme, STORAGE_KEY, type ThemeName } from "./theme";

interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (t: ThemeName) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "newsprint",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>("newsprint");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setThemeState(resolveInitialTheme(stored, prefersDark));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  function setTheme(next: ThemeName) {
    window.localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

- [ ] **Step 6: Wrap the app in `app/root.tsx`**

Inside the `App` (or default-exported) component, wrap the `<Outlet />` so every route sees the provider:

```tsx
import { ThemeProvider } from "./theme/ThemeProvider";

// ...

export default function App() {
  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add theme resolution and provider"
```

---

## Task 6: Mock fixtures

**Files:**
- Create: `app/mock/fixtures.ts`

- [ ] **Step 1: Write `app/mock/fixtures.ts`**

Types mirror the memo's shared TS shapes so real data drops in unchanged.

```ts
export interface Note {
  pitch: string;
  startSec: number;
  durSec: number;
}

export interface BankEntry {
  id: string;
  createdAt: string;
  title: string;
  durationSec: number;
  detectedKey: string;
  bpm: number;
  inputType: "hum" | "vocal" | "guitar" | "other";
  moodTag: string;
  peaks: number[];
}

export interface VibeBrief {
  id: string;
  sourceTrackName: string;
  artist: string;
  source: "itunes" | "upload";
  key: string;
  bpm: number;
  chordProgression: { chord: string; startSec: number; durSec: number }[];
  sections: {
    label: "intro" | "verse" | "chorus" | "bridge" | "outro";
    startSec: number;
    endSec: number;
  }[];
  sectionsEstimated: boolean;
}

export interface SongBuild {
  id: string;
  title: string;
  structure: {
    label: "intro" | "verse" | "chorus" | "bridge" | "outro";
    order: number;
    chords: string[];
  }[];
  instrumentation: string[];
  stages: { label: string; atSec: number }[];
}

function pseudoPeaks(seed: number, count = 40): number[] {
  const out: number[] = [];
  let x = seed;
  for (let i = 0; i < count; i++) {
    x = (x * 1103515245 + 12345) % 2147483648;
    out.push(0.15 + (x / 2147483648) * 0.85);
  }
  return out;
}

export const IDEAS: BankEntry[] = [
  {
    id: "idea-1",
    createdAt: "2026-07-19T23:41:00Z",
    title: "bridge idea",
    durationSec: 14,
    detectedKey: "C major",
    bpm: 112,
    inputType: "hum",
    moodTag: "restless",
    peaks: pseudoPeaks(7),
  },
  {
    id: "idea-2",
    createdAt: "2026-07-19T01:12:00Z",
    title: "drive hook",
    durationSec: 22,
    detectedKey: "E minor",
    bpm: 84,
    inputType: "guitar",
    moodTag: "wistful",
    peaks: pseudoPeaks(23),
  },
  {
    id: "idea-3",
    createdAt: "2026-07-18T20:03:00Z",
    title: "chorus shape",
    durationSec: 9,
    detectedKey: "A minor",
    bpm: 96,
    inputType: "vocal",
    moodTag: "urgent",
    peaks: pseudoPeaks(41),
  },
];

export const BRIEF: VibeBrief = {
  id: "brief-1",
  sourceTrackName: "Dreams",
  artist: "Fleetwood Mac",
  source: "itunes",
  key: "A minor",
  bpm: 120,
  chordProgression: [
    { chord: "Am", startSec: 0, durSec: 4 },
    { chord: "G", startSec: 4, durSec: 4 },
    { chord: "Am", startSec: 8, durSec: 4 },
    { chord: "G", startSec: 12, durSec: 4 },
  ],
  sections: [
    { label: "intro", startSec: 0, endSec: 8 },
    { label: "verse", startSec: 8, endSec: 30 },
    { label: "chorus", startSec: 30, endSec: 52 },
    { label: "bridge", startSec: 52, endSec: 64 },
    { label: "outro", startSec: 64, endSec: 74 },
  ],
  sectionsEstimated: false,
};

export const SONG: SongBuild = {
  id: "song-1",
  title: "chorus shape × Dreams",
  structure: [
    { label: "intro", order: 0, chords: ["Am", "G"] },
    { label: "verse", order: 1, chords: ["Am", "G", "F", "G"] },
    { label: "chorus", order: 2, chords: ["F", "C", "G", "Am"] },
    { label: "bridge", order: 3, chords: ["Dm", "Am", "E"] },
    { label: "outro", order: 4, chords: ["Am", "Am"] },
  ],
  instrumentation: ["felt piano", "brushed kit", "upright bass", "pad"],
  stages: [
    { label: "captured", atSec: 0 },
    { label: "analysed", atSec: 14 },
    { label: "brief", atSec: 91 },
    { label: "built", atSec: 522 },
  ],
};
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat: add mock fixtures for UI development"
```

---

## Task 7: Waveform fingerprint (pure logic + renderer)

The spec is emphatic that this must **not** look like a standard mirrored-bar waveform: a single angular polygon, hard mitre joins, no smoothing, asymmetric about the baseline.

**Files:**
- Create: `app/components/audio/fingerprint.ts`, `app/components/audio/fingerprint.test.ts`, `app/components/audio/Fingerprint.tsx`, `app/components/audio/Fingerprint.module.css`

- [ ] **Step 1: Write the failing test at `app/components/audio/fingerprint.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { downsampleToPeaks, fingerprintPath } from "./fingerprint";

describe("downsampleToPeaks", () => {
  it("returns exactly the requested number of points", () => {
    const samples = new Float32Array(1000).fill(0.5);
    expect(downsampleToPeaks(samples, 40)).toHaveLength(40);
  });

  it("normalises peaks into 0..1", () => {
    const samples = Float32Array.from({ length: 100 }, (_, i) => (i % 10) / 10);
    const peaks = downsampleToPeaks(samples, 10);
    for (const p of peaks) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("uses absolute amplitude so negative swings count", () => {
    const samples = Float32Array.from([-1, 0, 0, 0]);
    expect(downsampleToPeaks(samples, 1)[0]).toBe(1);
  });

  it("returns all zeros for silence", () => {
    const peaks = downsampleToPeaks(new Float32Array(100), 8);
    expect(peaks.every((p) => p === 0)).toBe(true);
  });

  it("is deterministic", () => {
    const samples = Float32Array.from({ length: 64 }, (_, i) => Math.sin(i));
    expect(downsampleToPeaks(samples, 16)).toEqual(downsampleToPeaks(samples, 16));
  });
});

describe("fingerprintPath", () => {
  it("draws a closed baseline-up polygon with hard corners", () => {
    expect(fingerprintPath([0, 1], 2, 10)).toBe("M0,10 L0,10 L1,0 L1,10 Z");
  });

  it("returns a flat closed path for an empty peak list", () => {
    expect(fingerprintPath([], 10, 10)).toBe("M0,10 L10,10 Z");
  });

  it("contains no curve commands", () => {
    const path = fingerprintPath([0.2, 0.9, 0.4, 0.7], 40, 20);
    expect(path).not.toMatch(/[CQSTA]/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- fingerprint`
Expected: FAIL — `Failed to resolve import "./fingerprint"`.

- [ ] **Step 3: Implement `app/components/audio/fingerprint.ts`**

```ts
export function downsampleToPeaks(
  samples: Float32Array,
  points = 40
): number[] {
  if (points <= 0) return [];
  const bucketSize = Math.max(1, Math.floor(samples.length / points));
  const peaks: number[] = [];

  for (let i = 0; i < points; i++) {
    let peak = 0;
    const start = i * bucketSize;
    const end = Math.min(start + bucketSize, samples.length);
    for (let j = start; j < end; j++) {
      const value = Math.abs(samples[j]);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
  }

  const max = Math.max(...peaks);
  return max === 0 ? peaks.map(() => 0) : peaks.map((p) => p / max);
}

/**
 * A single filled polygon drawn baseline-up. Hard corners only — no smoothing,
 * no rounded caps, asymmetric about the baseline. Reads as a seismograph trace
 * rather than a symmetric waveform blob.
 */
export function fingerprintPath(
  peaks: number[],
  width: number,
  height: number
): string {
  if (peaks.length === 0) return `M0,${height} L${width},${height} Z`;

  const step = peaks.length === 1 ? width : width / (peaks.length - 1);
  const points = peaks.map((peak, i) => {
    const x = Math.round(i * step * 1000) / 1000;
    const y = Math.round((height - peak * height) * 1000) / 1000;
    return `L${x},${y}`;
  });

  return `M0,${height} ${points.join(" ")} L${width},${height} Z`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- fingerprint`
Expected: PASS, 8 tests.

- [ ] **Step 5: Implement `app/components/audio/Fingerprint.module.css`**

```css
.svg {
  display: block;
  overflow: visible;
}

.shape {
  fill: var(--ink);
  stroke: none;
  shape-rendering: crispEdges;
}

.shape[data-live="true"] {
  fill: var(--accent);
}
```

- [ ] **Step 6: Implement `app/components/audio/Fingerprint.tsx`**

```tsx
import { fingerprintPath } from "./fingerprint";
import styles from "./Fingerprint.module.css";

interface FingerprintProps {
  peaks: number[];
  width?: number;
  height?: number;
  live?: boolean;
  label?: string;
}

export function Fingerprint({
  peaks,
  width = 64,
  height = 24,
  live = false,
  label,
}: FingerprintProps) {
  return (
    <svg
      className={styles.svg}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? "img" : "presentation"}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path
        className={styles.shape}
        data-live={live}
        d={fingerprintPath(peaks, width, height)}
      />
    </svg>
  );
}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add angular waveform fingerprint"
```

---

## Task 8: Halftone bloom frame budget + canvas renderer

The spec mandates three guardrails: a fixed ~192-dot grid drawn from one pre-rendered sprite, a 30fps cap, and a silent automatic downgrade to a plain ink trace after ~20 consecutive over-budget frames.

**Files:**
- Create: `app/components/audio/bloom.ts`, `app/components/audio/bloom.test.ts`, `app/components/audio/HalftoneBloom.tsx`, `app/components/audio/HalftoneBloom.module.css`

- [ ] **Step 1: Write the failing test at `app/components/audio/bloom.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { FrameBudget, DOT_COLUMNS, DOT_ROWS, TARGET_FRAME_MS } from "./bloom";

describe("dot grid", () => {
  it("is about 192 dots", () => {
    expect(DOT_COLUMNS * DOT_ROWS).toBe(192);
  });
});

describe("FrameBudget", () => {
  it("starts undegraded", () => {
    expect(new FrameBudget().degraded).toBe(false);
  });

  it("degrades after 20 consecutive over-budget frames", () => {
    const budget = new FrameBudget();
    for (let i = 0; i < 19; i++) budget.record(TARGET_FRAME_MS + 5);
    expect(budget.degraded).toBe(false);
    budget.record(TARGET_FRAME_MS + 5);
    expect(budget.degraded).toBe(true);
  });

  it("resets its streak when a frame comes in under budget", () => {
    const budget = new FrameBudget();
    for (let i = 0; i < 19; i++) budget.record(TARGET_FRAME_MS + 5);
    budget.record(1);
    for (let i = 0; i < 19; i++) budget.record(TARGET_FRAME_MS + 5);
    expect(budget.degraded).toBe(false);
  });

  it("never recovers once degraded, to avoid visible flip-flopping", () => {
    const budget = new FrameBudget();
    for (let i = 0; i < 20; i++) budget.record(TARGET_FRAME_MS + 5);
    for (let i = 0; i < 100; i++) budget.record(1);
    expect(budget.degraded).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- bloom`
Expected: FAIL — `Failed to resolve import "./bloom"`.

- [ ] **Step 3: Implement `app/components/audio/bloom.ts`**

```ts
export const DOT_COLUMNS = 24;
export const DOT_ROWS = 8;
export const TARGET_FPS = 30;
export const TARGET_FRAME_MS = 1000 / TARGET_FPS;
export const DEGRADE_AFTER_FRAMES = 20;

/**
 * Watches frame cost and latches into a degraded state after a sustained run of
 * over-budget frames. Latching is deliberate: recovering would make the
 * visualizer flip between two looks on stage, which is worse than either.
 */
export class FrameBudget {
  private streak = 0;
  private latched = false;

  record(frameMs: number): void {
    if (this.latched) return;
    if (frameMs > TARGET_FRAME_MS) {
      this.streak += 1;
      if (this.streak >= DEGRADE_AFTER_FRAMES) this.latched = true;
    } else {
      this.streak = 0;
    }
  }

  get degraded(): boolean {
    return this.latched;
  }
}

export function makeDotSprite(radius: number, colour: string): HTMLCanvasElement {
  const size = radius * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(radius, radius, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvas;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm run test -- bloom`
Expected: PASS, 5 tests.

- [ ] **Step 5: Implement `app/components/audio/HalftoneBloom.module.css`**

```css
.canvas {
  display: block;
  width: 100%;
  height: 120px;
}
```

- [ ] **Step 6: Implement `app/components/audio/HalftoneBloom.tsx`**

Reads amplitude from a supplied callback so it works identically with a real `AnalyserNode` later and with mock data now.

```tsx
import { useEffect, useRef } from "react";
import {
  DOT_COLUMNS,
  DOT_ROWS,
  FrameBudget,
  TARGET_FRAME_MS,
  makeDotSprite,
} from "./bloom";
import styles from "./HalftoneBloom.module.css";

interface HalftoneBloomProps {
  /** Returns amplitudes in 0..1, one per column. */
  getAmplitudes: () => number[];
  active: boolean;
}

export function HalftoneBloom({ getAmplitudes, active }: HalftoneBloomProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const styleOf = getComputedStyle(document.documentElement);
    const inkColour = styleOf.getPropertyValue("--ink").trim();
    const accentColour = styleOf.getPropertyValue("--accent").trim();

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const cellW = width / DOT_COLUMNS;
    const cellH = height / DOT_ROWS;
    const maxRadius = Math.min(cellW, cellH) / 2;

    const inkSprite = makeDotSprite(Math.ceil(maxRadius), inkColour);
    const accentSprite = makeDotSprite(Math.ceil(maxRadius), accentColour);

    const budget = new FrameBudget();
    let raf = 0;
    let lastDraw = 0;

    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      if (now - lastDraw < TARGET_FRAME_MS) return;
      const frameStart = performance.now();
      lastDraw = now;

      ctx!.clearRect(0, 0, width, height);
      const amps = getAmplitudes();

      if (budget.degraded) {
        // Silent fallback: a plain ink trace.
        ctx!.strokeStyle = inkColour;
        ctx!.lineWidth = 2;
        ctx!.beginPath();
        amps.forEach((amp, col) => {
          const x = col * cellW + cellW / 2;
          const y = height - amp * height;
          if (col === 0) ctx!.moveTo(x, y);
          else ctx!.lineTo(x, y);
        });
        ctx!.stroke();
      } else {
        amps.forEach((amp, col) => {
          const lit = amp * DOT_ROWS;
          for (let row = 0; row < DOT_ROWS; row++) {
            const fromBottom = DOT_ROWS - 1 - row;
            if (fromBottom > lit) continue;
            const strength = Math.min(1, lit - fromBottom);
            const radius = maxRadius * strength;
            if (radius < 0.4) continue;
            const sprite = amp > 0.85 ? accentSprite : inkSprite;
            ctx!.drawImage(
              sprite,
              col * cellW + cellW / 2 - radius,
              row * cellH + cellH / 2 - radius,
              radius * 2,
              radius * 2
            );
          }
        });
      }

      budget.record(performance.now() - frameStart);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, getAmplitudes]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />;
}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add halftone bloom visualizer with frame-budget downgrade"
```

---

## Task 9: Layout primitives and app shell

**Files:**
- Create: `app/components/layout/Masthead.tsx`, `app/components/layout/Masthead.module.css`, `app/components/layout/TabRule.tsx`, `app/components/layout/TabRule.module.css`, `app/components/layout/Shell.tsx`, `app/components/layout/Shell.module.css`, `app/components/layout/Shell.test.tsx`
- Modify: `app/routes.ts`

- [ ] **Step 1: Write the failing test at `app/components/layout/Shell.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Shell } from "./Shell";

function renderShell(status?: React.ReactNode) {
  const router = createMemoryRouter(
    [{ path: "/", element: <Shell status={status}>content</Shell> }],
    { initialEntries: ["/"] }
  );
  return render(<RouterProvider router={router} />);
}

describe("Shell", () => {
  it("renders the masthead wordmark", () => {
    renderShell();
    expect(screen.getByText("Memo")).toBeInTheDocument();
  });

  it("renders all three tabs", () => {
    renderShell();
    expect(screen.getByRole("link", { name: "Ideas" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Record" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Songs" })).toBeInTheDocument();
  });

  it("renders contextual status when given", () => {
    renderShell(<span>Analysing…</span>);
    expect(screen.getByText("Analysing…")).toBeInTheDocument();
  });

  it("announces status politely for screen readers", () => {
    renderShell(<span>Analysing…</span>);
    expect(screen.getByRole("status")).toHaveTextContent("Analysing…");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- Shell`
Expected: FAIL — `Failed to resolve import "./Shell"`.

- [ ] **Step 3: Implement `app/components/layout/Masthead.module.css`**

```css
.masthead {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: var(--space-4) var(--space-4) var(--space-3);
  border-bottom: 1px solid var(--ink);
}

.wordmark {
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink);
}

.status {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 11px;
  color: var(--ink-muted);
}
```

- [ ] **Step 4: Implement `app/components/layout/Masthead.tsx`**

```tsx
import styles from "./Masthead.module.css";

export function Masthead({ status }: { status?: React.ReactNode }) {
  return (
    <header className={styles.masthead}>
      <span className={styles.wordmark}>Memo</span>
      <div className={styles.status} role="status" aria-live="polite">
        {status}
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Implement `app/components/layout/TabRule.module.css`**

```css
.tabs {
  display: flex;
  border-top: 1px solid var(--ink);
  padding-bottom: env(safe-area-inset-bottom);
}

.tab {
  flex: 1;
  text-align: center;
  padding: var(--space-3) 0;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--ink-faint);
  transition: color var(--dur-state) var(--ease);
}

.tab[aria-current="page"] {
  color: var(--ink);
}
```

- [ ] **Step 6: Implement `app/components/layout/TabRule.tsx`**

```tsx
import { NavLink } from "react-router";
import styles from "./TabRule.module.css";

const TABS = [
  { to: "/ideas", label: "Ideas" },
  { to: "/record", label: "Record" },
  { to: "/songs", label: "Songs" },
];

export function TabRule() {
  return (
    <nav className={styles.tabs} aria-label="Main">
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} className={styles.tab}>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 7: Implement `app/components/layout/Shell.module.css`**

Two breakpoints only, per the spec. The container cap is the escape hatch — raising or removing the media queries returns a centred column with nothing broken.

```css
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--paper);
}

.main {
  flex: 1;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-4);
}

@media (min-width: 720px) {
  .main {
    max-width: 680px;
    padding: var(--space-6);
  }
}

@media (min-width: 1100px) {
  .main {
    max-width: 900px;
    padding: var(--space-8);
  }
}
```

- [ ] **Step 8: Implement `app/components/layout/Shell.tsx`**

```tsx
import { Masthead } from "./Masthead";
import { TabRule } from "./TabRule";
import styles from "./Shell.module.css";

interface ShellProps {
  children: React.ReactNode;
  status?: React.ReactNode;
}

export function Shell({ children, status }: ShellProps) {
  return (
    <div className={styles.shell}>
      <Masthead status={status} />
      <main className={styles.main}>{children}</main>
      <TabRule />
    </div>
  );
}
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npm run test -- Shell`
Expected: PASS, 4 tests.

- [ ] **Step 10: Define the routes in `app/routes.ts`**

```ts
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/record.tsx"),
  route("record", "routes/record.tsx", { id: "record-tab" }),
  route("ideas", "routes/ideas.tsx"),
  route("songs", "routes/songs.tsx"),
  route("songs/:id", "routes/songs.$id.tsx"),
  route("brief", "routes/brief.tsx"),
] satisfies RouteConfig;
```

- [ ] **Step 11: Create placeholder routes**

Create each of `app/routes/ideas.tsx`, `app/routes/songs.tsx`, `app/routes/songs.$id.tsx`, `app/routes/brief.tsx` with the same shape, changing only the component name and heading text. For example, `app/routes/ideas.tsx`:

```tsx
import { Shell } from "../components/layout/Shell";

export default function Ideas() {
  return <Shell>Ideas</Shell>;
}
```

Use `Songs` / "Songs" for `songs.tsx`, `SongBuilder` / "Song" for `songs.$id.tsx`, and `Brief` / "Brief" for `brief.tsx`. Replace `app/routes/record.tsx` similarly with a `Record` component rendering `<Shell>Record</Shell>`.

- [ ] **Step 12: Verify the app runs**

Run: `npm run dev`
Expected: `http://localhost:5173` shows the masthead, "Record", and three working tabs. Clicking each tab changes the active label to ink. Stop with Ctrl-C.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: add app shell with masthead, tab rule and routes"
```

---

## Task 10: Controls

**Files:**
- Create: `app/components/controls/Button.tsx`, `app/components/controls/Button.module.css`, `app/components/controls/RecordButton.tsx`, `app/components/controls/RecordButton.module.css`, `app/components/controls/RecordButton.test.tsx`, `app/components/controls/FacetToggle.tsx`, `app/components/controls/FacetToggle.module.css`

- [ ] **Step 1: Write the failing test at `app/components/controls/RecordButton.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordButton } from "./RecordButton";

describe("RecordButton", () => {
  it("labels itself for the idle state", () => {
    render(<RecordButton recording={false} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "Start recording" })).toBeInTheDocument();
  });

  it("labels itself for the recording state", () => {
    render(<RecordButton recording onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeInTheDocument();
  });

  it("exposes pressed state to assistive tech", () => {
    render(<RecordButton recording onToggle={() => {}} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn();
    render(<RecordButton recording={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- RecordButton`
Expected: FAIL — `Failed to resolve import "./RecordButton"`.

- [ ] **Step 3: Implement `app/components/controls/RecordButton.module.css`**

The hard 3px ink offset is the app's only shadow — letterpress relief, not elevation.

```css
.button {
  width: 76px;
  height: 76px;
  min-width: 44px;
  min-height: 44px;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 3px 0 var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform var(--dur-state) var(--ease);
}

.button:active {
  transform: translateY(2px);
  box-shadow: 0 1px 0 var(--ink);
}

.glyph {
  width: 26px;
  height: 26px;
  background: var(--accent-on);
  border-radius: 50%;
}

.glyph[data-recording="true"] {
  border-radius: 3px;
}
```

- [ ] **Step 4: Implement `app/components/controls/RecordButton.tsx`**

```tsx
import styles from "./RecordButton.module.css";

interface RecordButtonProps {
  recording: boolean;
  onToggle: () => void;
}

export function RecordButton({ recording, onToggle }: RecordButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      aria-pressed={recording}
      aria-label={recording ? "Stop recording" : "Start recording"}
      onClick={onToggle}
    >
      <span className={styles.glyph} data-recording={recording} />
    </button>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test -- RecordButton`
Expected: PASS, 4 tests.

- [ ] **Step 6: Implement `app/components/controls/Button.module.css`**

```css
.button {
  font-family: inherit;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: var(--space-3) var(--space-4);
  min-height: 44px;
  border-radius: var(--radius-chip);
  border: 1.5px solid var(--ink);
  cursor: pointer;
  transition: opacity var(--dur-state) var(--ease);
}

.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-on);
}

.secondary {
  background: transparent;
  color: var(--ink);
}

.button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
```

- [ ] **Step 7: Implement `app/components/controls/Button.tsx`**

```tsx
import styles from "./Button.module.css";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

export function Button({ variant = "secondary", ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${styles.button} ${styles[variant]}`}
    />
  );
}
```

- [ ] **Step 8: Implement `app/components/controls/FacetToggle.module.css`**

```css
.strip {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) 0;
}

.facet {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 11px;
  padding: var(--space-2) var(--space-3);
  min-height: 44px;
  border: 1.5px solid var(--ink);
  border-radius: var(--radius-chip);
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}

.facet[aria-pressed="true"] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-on);
}
```

- [ ] **Step 9: Implement `app/components/controls/FacetToggle.tsx`**

```tsx
import styles from "./FacetToggle.module.css";

export interface Facet {
  id: string;
  label: string;
}

interface FacetToggleProps {
  facets: Facet[];
  active: string | null;
  onChange: (id: string | null) => void;
}

export function FacetToggle({ facets, active, onChange }: FacetToggleProps) {
  return (
    <div className={styles.strip} role="group" aria-label="Filter ideas">
      {facets.map((facet) => (
        <button
          key={facet.id}
          type="button"
          className={styles.facet}
          aria-pressed={active === facet.id}
          onClick={() => onChange(active === facet.id ? null : facet.id)}
        >
          {facet.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 10: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add button, record button and facet toggle controls"
```

---

## Task 11: Record screen with staged analysis reveal

Per the spec, values land in mono one per ~350ms in the order input-type → tempo → key → mood, opacity only, and mood carries a marker distinguishing inferred from measured.

**Files:**
- Create: `app/components/domain/AnalysisReveal.tsx`, `app/components/domain/AnalysisReveal.module.css`, `app/components/domain/AnalysisReveal.test.tsx`
- Modify: `app/routes/record.tsx`

- [ ] **Step 1: Write the failing test at `app/components/domain/AnalysisReveal.test.tsx`**

```tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AnalysisReveal, REVEAL_ORDER, REVEAL_STEP_MS } from "./AnalysisReveal";

const RESULT = {
  inputType: "hum" as const,
  bpm: 96,
  detectedKey: "A minor",
  moodTag: "urgent",
};

describe("AnalysisReveal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reveals fields in the specified order", () => {
    expect(REVEAL_ORDER).toEqual(["inputType", "bpm", "detectedKey", "moodTag"]);
  });

  it("shows nothing revealed at first", () => {
    render(<AnalysisReveal result={RESULT} />);
    expect(screen.getByTestId("field-bpm")).toHaveAttribute("data-revealed", "false");
  });

  it("reveals each field in sequence", () => {
    render(<AnalysisReveal result={RESULT} />);

    act(() => { vi.advanceTimersByTime(REVEAL_STEP_MS); });
    expect(screen.getByTestId("field-inputType")).toHaveAttribute("data-revealed", "true");
    expect(screen.getByTestId("field-bpm")).toHaveAttribute("data-revealed", "false");

    act(() => { vi.advanceTimersByTime(REVEAL_STEP_MS * 3); });
    expect(screen.getByTestId("field-moodTag")).toHaveAttribute("data-revealed", "true");
  });

  it("marks mood as inferred and the rest as measured", () => {
    render(<AnalysisReveal result={RESULT} />);
    expect(screen.getByTestId("field-moodTag")).toHaveAttribute("data-source", "inferred");
    expect(screen.getByTestId("field-detectedKey")).toHaveAttribute("data-source", "measured");
  });

  it("renders the values", () => {
    render(<AnalysisReveal result={RESULT} />);
    act(() => { vi.advanceTimersByTime(REVEAL_STEP_MS * 4); });
    expect(screen.getByText("96")).toBeInTheDocument();
    expect(screen.getByText("A minor")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- AnalysisReveal`
Expected: FAIL — `Failed to resolve import "./AnalysisReveal"`.

- [ ] **Step 3: Implement `app/components/domain/AnalysisReveal.module.css`**

Opacity only — nothing moves, per the spec's motion rules.

```css
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-6);
  padding: var(--space-4) 0;
}

.field {
  opacity: 0;
  transition: opacity var(--dur-reveal) var(--ease);
}

.field[data-revealed="true"] {
  opacity: 1;
}

.label {
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: var(--space-1);
}

.value {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-weight: 700;
  font-size: 19px;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.mark {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 10px;
  color: var(--ink-faint);
  margin-left: var(--space-2);
}
```

- [ ] **Step 4: Implement `app/components/domain/AnalysisReveal.tsx`**

```tsx
import { useEffect, useState } from "react";
import styles from "./AnalysisReveal.module.css";

export const REVEAL_ORDER = ["inputType", "bpm", "detectedKey", "moodTag"] as const;
export const REVEAL_STEP_MS = 350;

type FieldKey = (typeof REVEAL_ORDER)[number];

export interface AnalysisResult {
  inputType: "hum" | "vocal" | "guitar" | "other";
  bpm: number;
  detectedKey: string;
  moodTag: string;
}

const LABELS: Record<FieldKey, string> = {
  inputType: "Input",
  bpm: "Tempo",
  detectedKey: "Key",
  moodTag: "Mood",
};

/** Mood comes from the LLM; everything else is measured by the DSP. */
const INFERRED: FieldKey[] = ["moodTag"];

export function AnalysisReveal({ result }: { result: AnalysisResult }) {
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    setRevealed(0);
    const timers = REVEAL_ORDER.map((_, i) =>
      setTimeout(() => setRevealed(i + 1), REVEAL_STEP_MS * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, [result]);

  return (
    <div className={styles.grid}>
      {REVEAL_ORDER.map((key, i) => {
        const inferred = INFERRED.includes(key);
        return (
          <div
            key={key}
            className={styles.field}
            data-testid={`field-${key}`}
            data-revealed={i < revealed}
            data-source={inferred ? "inferred" : "measured"}
          >
            <div className={styles.label}>{LABELS[key]}</div>
            <div className={styles.value}>
              {String(result[key])}
              {inferred && <span className={styles.mark}>inferred</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test -- AnalysisReveal`
Expected: PASS, 5 tests.

- [ ] **Step 6: Build the record screen at `app/routes/record.tsx`**

```tsx
import { useCallback, useRef, useState } from "react";
import { Shell } from "../components/layout/Shell";
import { RecordButton } from "../components/controls/RecordButton";
import { HalftoneBloom } from "../components/audio/HalftoneBloom";
import { AnalysisReveal, type AnalysisResult } from "../components/domain/AnalysisReveal";
import { DOT_COLUMNS } from "../components/audio/bloom";

const MOCK_RESULT: AnalysisResult = {
  inputType: "hum",
  bpm: 96,
  detectedKey: "A minor",
  moodTag: "urgent",
};

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function Record() {
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mock amplitudes until the real AnalyserNode is wired in.
  const getAmplitudes = useCallback(
    () =>
      Array.from(
        { length: DOT_COLUMNS },
        (_, i) => 0.2 + Math.abs(Math.sin(Date.now() / 300 + i / 2)) * 0.8
      ),
    []
  );

  function toggle() {
    if (recording) {
      if (tick.current) clearInterval(tick.current);
      setRecording(false);
      setResult(MOCK_RESULT);
    } else {
      setResult(null);
      setElapsed(0);
      setRecording(true);
      tick.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    }
  }

  const status = recording ? (
    <span>
      <span style={{ color: "var(--accent)" }}>●</span> Listening {formatElapsed(elapsed)}
    </span>
  ) : null;

  return (
    <Shell status={status}>
      <HalftoneBloom getAmplitudes={getAmplitudes} active={recording} />
      {result && <AnalysisReveal result={result} />}
      <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-6) 0" }}>
        <RecordButton recording={recording} onToggle={toggle} />
      </div>
    </Shell>
  );
}
```

Note: the inline `style` uses `var(--accent)` rather than a literal colour, so the hex-literal guard stays satisfied. The `●` is a graphical mark; the surrounding text remains `--ink`, per §2.3.

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`
Expected: pressing record starts the mono counter and the halftone bloom; pressing stop reveals Input → Tempo → Key → Mood in sequence, with `inferred` beside Mood. Stop with Ctrl-C.

- [ ] **Step 8: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add record screen with staged analysis reveal"
```

---

## Task 12: Idea Bank

**Files:**
- Create: `app/components/domain/BankRow.tsx`, `app/components/domain/BankRow.module.css`, `app/components/domain/BankRow.test.tsx`
- Modify: `app/routes/ideas.tsx`

- [ ] **Step 1: Write the failing test at `app/components/domain/BankRow.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BankRow } from "./BankRow";
import { IDEAS } from "../../mock/fixtures";

describe("BankRow", () => {
  it("renders the title and metadata", () => {
    render(<BankRow entry={IDEAS[0]} onPlay={() => {}} />);
    expect(screen.getByText("bridge idea")).toBeInTheDocument();
    expect(screen.getByText(/C major/)).toBeInTheDocument();
    expect(screen.getByText(/112/)).toBeInTheDocument();
  });

  it("renders a fingerprint labelled for assistive tech", () => {
    render(<BankRow entry={IDEAS[0]} onPlay={() => {}} />);
    expect(screen.getByRole("img", { name: /waveform/i })).toBeInTheDocument();
  });

  it("calls onPlay when the row is activated", async () => {
    const onPlay = vi.fn();
    render(<BankRow entry={IDEAS[0]} onPlay={onPlay} />);
    await userEvent.click(screen.getByRole("button", { name: /bridge idea/ }));
    expect(onPlay).toHaveBeenCalledWith("idea-1");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- BankRow`
Expected: FAIL — `Failed to resolve import "./BankRow"`.

- [ ] **Step 3: Implement `app/components/domain/BankRow.module.css`**

```css
.row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 44px;
  padding: var(--space-3) 0;
  border: none;
  border-bottom: 1px solid var(--ink);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.text {
  flex: 1;
  min-width: 0;
}

.title {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--ink);
}

.meta {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 12px;
  color: var(--ink-muted);
}
```

- [ ] **Step 4: Implement `app/components/domain/BankRow.tsx`**

```tsx
import { Fingerprint } from "../audio/Fingerprint";
import type { BankEntry } from "../../mock/fixtures";
import styles from "./BankRow.module.css";

interface BankRowProps {
  entry: BankEntry;
  onPlay: (id: string) => void;
}

export function BankRow({ entry, onPlay }: BankRowProps) {
  return (
    <button type="button" className={styles.row} onClick={() => onPlay(entry.id)}>
      <Fingerprint peaks={entry.peaks} label={`waveform for ${entry.title}`} />
      <span className={styles.text}>
        <span className={styles.title}>{entry.title}</span>
      </span>
      <span className={styles.meta}>
        {entry.detectedKey} · {entry.bpm} · {entry.moodTag}
      </span>
    </button>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test -- BankRow`
Expected: PASS, 3 tests.

- [ ] **Step 6: Build the Idea Bank at `app/routes/ideas.tsx`**

```tsx
import { useState } from "react";
import { Shell } from "../components/layout/Shell";
import { BankRow } from "../components/domain/BankRow";
import { FacetToggle } from "../components/controls/FacetToggle";
import { IDEAS } from "../mock/fixtures";

const FACETS = [
  { id: "hum", label: "hum" },
  { id: "vocal", label: "vocal" },
  { id: "guitar", label: "guitar" },
];

export default function Ideas() {
  const [facet, setFacet] = useState<string | null>(null);
  const visible = facet ? IDEAS.filter((i) => i.inputType === facet) : IDEAS;

  return (
    <Shell>
      <h1 className="u-h1">Ideas</h1>
      <FacetToggle facets={FACETS} active={facet} onChange={setFacet} />
      {visible.length === 0 ? (
        <p className="u-body">Nothing filed under that yet.</p>
      ) : (
        visible.map((entry) => (
          <BankRow key={entry.id} entry={entry} onPlay={() => {}} />
        ))
      )}
    </Shell>
  );
}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add Idea Bank with fingerprint rows and facet filtering"
```

---

## Task 13: Vibe Brief recipe card

The spec requires the low-confidence state to be *visible*: when segmentation is estimated, Method renders dashed with an `estimated` marker.

**Files:**
- Create: `app/components/domain/RecipeCard.tsx`, `app/components/domain/RecipeCard.module.css`, `app/components/domain/RecipeCard.test.tsx`
- Modify: `app/routes/brief.tsx`

- [ ] **Step 1: Write the failing test at `app/components/domain/RecipeCard.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecipeCard } from "./RecipeCard";
import { BRIEF } from "../../mock/fixtures";

describe("RecipeCard", () => {
  it("renders ingredients and method headings", () => {
    render(<RecipeCard brief={BRIEF} />);
    expect(screen.getByText("Ingredients")).toBeInTheDocument();
    expect(screen.getByText("Method")).toBeInTheDocument();
  });

  it("renders the measured values", () => {
    render(<RecipeCard brief={BRIEF} />);
    expect(screen.getByText("A minor")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
  });

  it("renders a provenance line", () => {
    render(<RecipeCard brief={BRIEF} />);
    expect(screen.getByText(/measured from 30s preview/i)).toBeInTheDocument();
  });

  it("does not mark confident sections as estimated", () => {
    render(<RecipeCard brief={BRIEF} />);
    expect(screen.queryByText("estimated")).not.toBeInTheDocument();
    expect(screen.getByTestId("method")).toHaveAttribute("data-estimated", "false");
  });

  it("marks the method as estimated when segmentation was unreliable", () => {
    render(<RecipeCard brief={{ ...BRIEF, sectionsEstimated: true }} />);
    expect(screen.getByText("estimated")).toBeInTheDocument();
    expect(screen.getByTestId("method")).toHaveAttribute("data-estimated", "true");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- RecipeCard`
Expected: FAIL — `Failed to resolve import "./RecipeCard"`.

- [ ] **Step 3: Implement `app/components/domain/RecipeCard.module.css`**

```css
.card {
  background: var(--paper-raised);
  border: 1.5px solid var(--ink);
  padding: var(--space-6);
}

.track {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 700;
  font-size: 27px;
  line-height: 1.08;
  color: var(--ink);
}

.artist {
  font-size: 15px;
  color: var(--ink-muted);
  margin-bottom: var(--space-6);
}

.heading {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 600;
  font-size: 20px;
  margin: var(--space-6) 0 var(--space-3);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: flex;
  justify-content: space-between;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--ink);
}

.method[data-estimated="true"] .item {
  border-bottom-style: dashed;
}

.value {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 12px;
  color: var(--ink);
}

.marker {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 10px;
  color: var(--ink-faint);
  margin-left: var(--space-2);
}

.provenance {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 10px;
  color: var(--ink-faint);
  margin-top: var(--space-6);
}
```

- [ ] **Step 4: Implement `app/components/domain/RecipeCard.tsx`**

```tsx
import type { VibeBrief } from "../../mock/fixtures";
import styles from "./RecipeCard.module.css";

export function RecipeCard({ brief }: { brief: VibeBrief }) {
  const chords = brief.chordProgression.map((c) => c.chord).join(" · ");
  const source =
    brief.source === "itunes" ? "measured from 30s preview" : "measured from upload";

  return (
    <article className={styles.card}>
      <div className={styles.track}>{brief.sourceTrackName}</div>
      <div className={styles.artist}>{brief.artist}</div>

      <h2 className={styles.heading}>Ingredients</h2>
      <ul className={styles.list}>
        <li className={styles.item}>
          <span>Key</span>
          <span className={styles.value}>{brief.key}</span>
        </li>
        <li className={styles.item}>
          <span>Tempo</span>
          <span className={styles.value}>{brief.bpm}</span>
        </li>
        <li className={styles.item}>
          <span>Chords</span>
          <span className={styles.value}>{chords}</span>
        </li>
      </ul>

      <h2 className={styles.heading}>
        Method
        {brief.sectionsEstimated && <span className={styles.marker}>estimated</span>}
      </h2>
      <ul
        className={`${styles.list} ${styles.method}`}
        data-testid="method"
        data-estimated={brief.sectionsEstimated}
      >
        {brief.sections.map((section, i) => (
          <li key={section.label + i} className={styles.item}>
            <span>
              {i + 1}. {section.label}
            </span>
            <span className={styles.value}>
              {Math.round(section.endSec - section.startSec)}s
            </span>
          </li>
        ))}
      </ul>

      <p className={styles.provenance}>{source} · Essentia</p>
    </article>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test -- RecipeCard`
Expected: PASS, 5 tests.

- [ ] **Step 6: Build the brief route at `app/routes/brief.tsx`**

```tsx
import { Shell } from "../components/layout/Shell";
import { RecipeCard } from "../components/domain/RecipeCard";
import { BRIEF } from "../mock/fixtures";

export default function Brief() {
  return (
    <Shell>
      <RecipeCard brief={BRIEF} />
    </Shell>
  );
}
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add Vibe Brief recipe card with estimated-sections state"
```

---

## Task 14: Song Builder — structure map and completion stamp

The structure map leads; chords nest inside each section. The completion stamp shows the stage breakdown, not just a total.

**Files:**
- Create: `app/components/domain/SectionBlock.tsx`, `app/components/domain/SectionBlock.module.css`, `app/components/domain/SectionBlock.test.tsx`, `app/components/domain/CompletionStamp.tsx`, `app/components/domain/CompletionStamp.module.css`, `app/components/domain/CompletionStamp.test.tsx`
- Modify: `app/routes/songs.$id.tsx`, `app/routes/songs.tsx`

- [ ] **Step 1: Write the failing test at `app/components/domain/SectionBlock.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionBlock } from "./SectionBlock";

const SECTION = { label: "chorus" as const, order: 2, chords: ["F", "C", "G", "Am"] };

describe("SectionBlock", () => {
  it("renders the section label", () => {
    render(<SectionBlock section={SECTION} playing={false} />);
    expect(screen.getByText("chorus")).toBeInTheDocument();
  });

  it("renders every chord", () => {
    render(<SectionBlock section={SECTION} playing={false} />);
    for (const chord of SECTION.chords) {
      expect(screen.getByText(chord)).toBeInTheDocument();
    }
  });

  it("exposes the section label as a data attribute for colour coding", () => {
    render(<SectionBlock section={SECTION} playing={false} />);
    expect(screen.getByTestId("section")).toHaveAttribute("data-label", "chorus");
  });

  it("marks the playing section", () => {
    render(<SectionBlock section={SECTION} playing />);
    expect(screen.getByTestId("section")).toHaveAttribute("data-playing", "true");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- SectionBlock`
Expected: FAIL — `Failed to resolve import "./SectionBlock"`.

- [ ] **Step 3: Implement `app/components/domain/SectionBlock.module.css`**

Colour is always paired with the text label, per §2.3.

```css
.block {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4);
  margin-bottom: var(--space-2);
  border-left: 6px solid var(--sec-verse);
  background: var(--paper-raised);
}

.block[data-label="intro"] { border-left-color: var(--sec-intro); }
.block[data-label="verse"] { border-left-color: var(--sec-verse); }
.block[data-label="chorus"] { border-left-color: var(--sec-chorus); }
.block[data-label="bridge"] { border-left-color: var(--sec-bridge); }
.block[data-label="outro"] { border-left-color: var(--sec-outro); }

.block[data-playing="true"] {
  outline: 2px solid var(--accent);
}

.label {
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-muted);
  width: 64px;
  flex: none;
}

.chords {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.chord {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--ink);
  border: 1.5px solid var(--ink);
  border-radius: var(--radius-chip);
  padding: var(--space-1) var(--space-2);
}
```

- [ ] **Step 4: Implement `app/components/domain/SectionBlock.tsx`**

```tsx
import type { SongBuild } from "../../mock/fixtures";
import styles from "./SectionBlock.module.css";

type Section = SongBuild["structure"][number];

interface SectionBlockProps {
  section: Section;
  playing: boolean;
}

export function SectionBlock({ section, playing }: SectionBlockProps) {
  return (
    <div
      className={styles.block}
      data-testid="section"
      data-label={section.label}
      data-playing={playing}
    >
      <span className={styles.label}>{section.label}</span>
      <span className={styles.chords}>
        {section.chords.map((chord, i) => (
          <span key={chord + i} className={styles.chord}>
            {chord}
          </span>
        ))}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test -- SectionBlock`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing test at `app/components/domain/CompletionStamp.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompletionStamp, formatStage } from "./CompletionStamp";
import { SONG } from "../../mock/fixtures";

describe("formatStage", () => {
  it("formats seconds as m:ss", () => {
    expect(formatStage(0)).toBe("0:00");
    expect(formatStage(14)).toBe("0:14");
    expect(formatStage(91)).toBe("1:31");
    expect(formatStage(522)).toBe("8:42");
  });
});

describe("CompletionStamp", () => {
  it("renders every stage, not just the total", () => {
    render(<CompletionStamp stages={SONG.stages} />);
    expect(screen.getByText(/captured/)).toBeInTheDocument();
    expect(screen.getByText(/analysed/)).toBeInTheDocument();
    expect(screen.getByText(/brief/)).toBeInTheDocument();
    expect(screen.getByText(/built/)).toBeInTheDocument();
  });

  it("renders the final elapsed time", () => {
    render(<CompletionStamp stages={SONG.stages} />);
    expect(screen.getByText("8:42")).toBeInTheDocument();
  });

  it("renders the manual baseline comparison", () => {
    render(<CompletionStamp stages={SONG.stages} />);
    expect(screen.getByText(/3–4 hrs by hand/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm run test -- CompletionStamp`
Expected: FAIL — `Failed to resolve import "./CompletionStamp"`.

- [ ] **Step 8: Implement `app/components/domain/CompletionStamp.module.css`**

```css
.stamp {
  border: 1.5px solid var(--ink);
  padding: var(--space-6);
  margin: var(--space-6) 0;
}

.total {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-weight: 700;
  font-size: 34px;
  letter-spacing: -0.02em;
  color: var(--ink);
}

.baseline {
  font-size: 15px;
  color: var(--ink-muted);
  margin-bottom: var(--space-4);
}

.stages {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 12px;
  color: var(--ink-muted);
}
```

- [ ] **Step 9: Implement `app/components/domain/CompletionStamp.tsx`**

```tsx
import styles from "./CompletionStamp.module.css";

export function formatStage(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface CompletionStampProps {
  stages: { label: string; atSec: number }[];
}

export function CompletionStamp({ stages }: CompletionStampProps) {
  const total = stages.length ? stages[stages.length - 1].atSec : 0;

  return (
    <section className={styles.stamp}>
      <div className={styles.total}>{formatStage(total)}</div>
      <div className={styles.baseline}>vs ~3–4 hrs by hand</div>
      <div className={styles.stages}>
        {stages.map((stage) => (
          <span key={stage.label}>
            {stage.label} {formatStage(stage.atSec)}
          </span>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 10: Run it to verify it passes**

Run: `npm run test -- CompletionStamp`
Expected: PASS, 6 tests.

- [ ] **Step 11: Build the Song Builder at `app/routes/songs.$id.tsx`**

Note: this version carries a temporary Play button so the section-highlight can be checked in isolation. Task 15 replaces the whole file with the real docked transport.

```tsx
import { useState } from "react";
import { Shell } from "../components/layout/Shell";
import { SectionBlock } from "../components/domain/SectionBlock";
import { CompletionStamp } from "../components/domain/CompletionStamp";
import { Button } from "../components/controls/Button";
import { SONG } from "../mock/fixtures";

export default function SongBuilder() {
  const [playingOrder, setPlayingOrder] = useState<number | null>(null);

  return (
    <Shell>
      <h1 className="u-h1">{SONG.title}</h1>

      {SONG.structure.map((section) => (
        <SectionBlock
          key={section.order}
          section={section}
          playing={playingOrder === section.order}
        />
      ))}

      <p className="u-label">Instrumentation</p>
      <p className="u-body">{SONG.instrumentation.join(" · ")}</p>

      <CompletionStamp stages={SONG.stages} />

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <Button variant="primary" onClick={() => {}}>
          Open in openDAW
        </Button>
        <Button variant="secondary" onClick={() => {}}>
          Export .mid
        </Button>
      </div>

      <div style={{ paddingTop: "var(--space-6)" }}>
        <Button
          onClick={() => setPlayingOrder(playingOrder === null ? 2 : null)}
        >
          {playingOrder === null ? "Play" : "Pause"}
        </Button>
      </div>
    </Shell>
  );
}
```

- [ ] **Step 12: Build the songs list at `app/routes/songs.tsx`**

```tsx
import { Link } from "react-router";
import { Shell } from "../components/layout/Shell";
import { SONG } from "../mock/fixtures";

export default function Songs() {
  return (
    <Shell>
      <h1 className="u-h1">Songs</h1>
      <Link to={`/songs/${SONG.id}`} className="u-body">
        {SONG.title}
      </Link>
    </Shell>
  );
}
```

- [ ] **Step 13: Verify in the browser**

Run: `npm run dev`
Expected: `/songs` links to the builder; the builder shows five colour-coded, labelled sections with nested chords, the instrumentation list, the stage-breakdown stamp, and both handoff actions. Pressing Play outlines the chorus. Stop with Ctrl-C.

- [ ] **Step 14: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add Song Builder with structure map and completion stamp"
```

---

## Task 15: Persistent transport

Per §4.5 the transport is docked above the tab rule whenever a song is loaded, and the sounding section fills accent in the map above — connecting sound to structure without labels.

**Files:**
- Create: `app/components/controls/Transport.tsx`, `app/components/controls/Transport.module.css`, `app/components/controls/Transport.test.tsx`
- Modify: `app/routes/songs.$id.tsx`

- [ ] **Step 1: Write the failing test at `app/components/controls/Transport.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Transport } from "./Transport";
import { SONG } from "../../mock/fixtures";

const PEAKS = [0.2, 0.9, 0.4, 0.7, 0.5];

describe("Transport", () => {
  it("labels the play control when paused", () => {
    render(
      <Transport
        playing={false}
        elapsedSec={0}
        durationSec={60}
        peaks={PEAKS}
        sections={SONG.structure}
        onToggle={() => {}}
        onSeek={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("labels the play control when playing", () => {
    render(
      <Transport
        playing
        elapsedSec={0}
        durationSec={60}
        peaks={PEAKS}
        sections={SONG.structure}
        onToggle={() => {}}
        onSeek={() => {}}
      />
    );
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("renders elapsed time in m:ss", () => {
    render(
      <Transport
        playing
        elapsedSec={91}
        durationSec={200}
        peaks={PEAKS}
        sections={SONG.structure}
        onToggle={() => {}}
        onSeek={() => {}}
      />
    );
    expect(screen.getByText("1:31")).toBeInTheDocument();
  });

  it("calls onToggle when the play control is pressed", async () => {
    const onToggle = vi.fn();
    render(
      <Transport
        playing={false}
        elapsedSec={0}
        durationSec={60}
        peaks={PEAKS}
        sections={SONG.structure}
        onToggle={onToggle}
        onSeek={() => {}}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("exposes the scrubber as a slider with the correct range", () => {
    render(
      <Transport
        playing
        elapsedSec={30}
        durationSec={200}
        peaks={PEAKS}
        sections={SONG.structure}
        onToggle={() => {}}
        onSeek={() => {}}
      />
    );
    const slider = screen.getByRole("slider", { name: /seek/i });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "200");
    expect(slider).toHaveAttribute("aria-valuenow", "30");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- Transport`
Expected: FAIL — `Failed to resolve import "./Transport"`.

- [ ] **Step 3: Implement `app/components/controls/Transport.module.css`**

```css
.transport {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--ink);
  background: var(--paper);
}

.play {
  width: 44px;
  height: 44px;
  flex: none;
  border: 1.5px solid var(--ink);
  border-radius: 50%;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
}

.elapsed {
  font-family: "JetBrains Mono Variable", ui-monospace, monospace;
  font-size: 12px;
  color: var(--ink-muted);
  flex: none;
}

.scrubber {
  flex: 1;
  height: 32px;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
}

.strip {
  display: block;
  width: 100%;
  height: 32px;
}

.wave {
  fill: var(--ink-faint);
  shape-rendering: crispEdges;
}

.playhead {
  stroke: var(--accent);
  stroke-width: 2;
}
```

- [ ] **Step 4: Implement `app/components/controls/Transport.tsx`**

Reuses `fingerprintPath` from Task 7 rather than duplicating the geometry — same angular language, compressed to the full song.

```tsx
import { fingerprintPath } from "../audio/fingerprint";
import type { SongBuild } from "../../mock/fixtures";
import styles from "./Transport.module.css";

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface TransportProps {
  playing: boolean;
  elapsedSec: number;
  durationSec: number;
  peaks: number[];
  sections: SongBuild["structure"];
  onToggle: () => void;
  onSeek: (seconds: number) => void;
}

const STRIP_WIDTH = 200;
const STRIP_HEIGHT = 32;

export function Transport({
  playing,
  elapsedSec,
  durationSec,
  peaks,
  onToggle,
  onSeek,
}: TransportProps) {
  const progress = durationSec === 0 ? 0 : elapsedSec / durationSec;
  const playheadX = progress * STRIP_WIDTH;

  function handleSeek(event: React.MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    onSeek(Math.max(0, Math.min(1, ratio)) * durationSec);
  }

  return (
    <div className={styles.transport}>
      <button
        type="button"
        className={styles.play}
        aria-label={playing ? "Pause" : "Play"}
        onClick={onToggle}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <span className={styles.elapsed}>{formatElapsed(elapsedSec)}</span>

      <button
        type="button"
        className={styles.scrubber}
        role="slider"
        aria-label="Seek through song"
        aria-valuemin={0}
        aria-valuemax={durationSec}
        aria-valuenow={elapsedSec}
        onClick={handleSeek}
      >
        <svg
          className={styles.strip}
          viewBox={`0 0 ${STRIP_WIDTH} ${STRIP_HEIGHT}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            className={styles.wave}
            d={fingerprintPath(peaks, STRIP_WIDTH, STRIP_HEIGHT)}
          />
          <line
            className={styles.playhead}
            x1={playheadX}
            y1={0}
            x2={playheadX}
            y2={STRIP_HEIGHT}
          />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test -- Transport`
Expected: PASS, 5 tests.

- [ ] **Step 6: Wire it into `app/routes/songs.$id.tsx`**

Replace the temporary Play button block at the bottom of the component with the transport, and drive the playing section from elapsed time. Replace the whole file with:

```tsx
import { useEffect, useState } from "react";
import { Shell } from "../components/layout/Shell";
import { SectionBlock } from "../components/domain/SectionBlock";
import { CompletionStamp } from "../components/domain/CompletionStamp";
import { Transport } from "../components/controls/Transport";
import { Button } from "../components/controls/Button";
import { SONG } from "../mock/fixtures";

const SECTION_SECONDS = 8;
const DURATION = SONG.structure.length * SECTION_SECONDS;
const STRIP_PEAKS = [0.3, 0.8, 0.5, 0.95, 0.4, 0.7, 0.6, 0.85, 0.35, 0.75];

export default function SongBuilder() {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setElapsed((e) => (e + 1 >= DURATION ? 0 : e + 1));
    }, 1000);
    return () => clearInterval(id);
  }, [playing]);

  const playingOrder = playing
    ? Math.min(SONG.structure.length - 1, Math.floor(elapsed / SECTION_SECONDS))
    : null;

  return (
    <Shell>
      <h1 className="u-h1">{SONG.title}</h1>

      {SONG.structure.map((section) => (
        <SectionBlock
          key={section.order}
          section={section}
          playing={playingOrder === section.order}
        />
      ))}

      <p className="u-label">Instrumentation</p>
      <p className="u-body">{SONG.instrumentation.join(" · ")}</p>

      <CompletionStamp stages={SONG.stages} />

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <Button variant="primary" onClick={() => {}}>
          Open in openDAW
        </Button>
        <Button variant="secondary" onClick={() => {}}>
          Export .mid
        </Button>
      </div>

      <Transport
        playing={playing}
        elapsedSec={elapsed}
        durationSec={DURATION}
        peaks={STRIP_PEAKS}
        sections={SONG.structure}
        onToggle={() => setPlaying((p) => !p)}
        onSeek={setElapsed}
      />
    </Shell>
  );
}
```

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`
Expected: at `/songs/song-1`, pressing play advances the accent outline down the sections one at a time while the playhead crosses the strip. Clicking the strip seeks. Stop with Ctrl-C.

- [ ] **Step 8: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add persistent transport with angular scrubber"
```

---

## Task 16: System states

**Files:**
- Create: `app/components/domain/StateNotice.tsx`, `app/components/domain/StateNotice.module.css`, `app/components/domain/StateNotice.test.tsx`
- Modify: `app/routes/ideas.tsx`

- [ ] **Step 1: Write the failing test at `app/components/domain/StateNotice.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StateNotice } from "./StateNotice";

describe("StateNotice", () => {
  it("renders a heading and plain-language body", () => {
    render(<StateNotice heading="No ideas yet" body="Hum something." />);
    expect(screen.getByText("No ideas yet")).toBeInTheDocument();
    expect(screen.getByText("Hum something.")).toBeInTheDocument();
  });

  it("renders an action when given one", async () => {
    const onAct = vi.fn();
    render(
      <StateNotice
        heading="Microphone blocked"
        body="Memo needs the mic to hear your idea."
        actionLabel="Try again"
        onAction={onAct}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onAct).toHaveBeenCalledOnce();
  });

  it("renders no button when no action is given", () => {
    render(<StateNotice heading="Offline" body="Cached ideas still play." />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test -- StateNotice`
Expected: FAIL — `Failed to resolve import "./StateNotice"`.

- [ ] **Step 3: Implement `app/components/domain/StateNotice.module.css`**

```css
.notice {
  border-top: 1.5px solid var(--ink);
  padding: var(--space-8) 0;
}

.heading {
  font-family: "Fraunces Variable", ui-serif, Georgia, serif;
  font-weight: 700;
  font-size: 27px;
  line-height: 1.08;
  color: var(--ink);
  margin: 0 0 var(--space-3);
}

.body {
  font-size: 15px;
  color: var(--ink-muted);
  margin: 0 0 var(--space-4);
  max-width: 34ch;
}
```

- [ ] **Step 4: Implement `app/components/domain/StateNotice.tsx`**

No illustrations and no error iconography — a printed notice, per §6.

```tsx
import { Button } from "../controls/Button";
import styles from "./StateNotice.module.css";

interface StateNoticeProps {
  heading: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StateNotice({
  heading,
  body,
  actionLabel,
  onAction,
}: StateNoticeProps) {
  return (
    <section className={styles.notice}>
      <h2 className={styles.heading}>{heading}</h2>
      <p className={styles.body}>{body}</p>
      {actionLabel && onAction && (
        <Button variant="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npm run test -- StateNotice`
Expected: PASS, 3 tests.

- [ ] **Step 6: Use it for the empty Bank in `app/routes/ideas.tsx`**

Replace the `visible.length === 0` branch:

```tsx
{visible.length === 0 ? (
  <StateNotice
    heading="Nothing filed here yet"
    body="Ideas you record land in this list, sorted newest first, with their key and tempo worked out for you."
  />
) : (
  visible.map((entry) => (
    <BankRow key={entry.id} entry={entry} onPlay={() => {}} />
  ))
)}
```

Add the import:

```tsx
import { StateNotice } from "../components/domain/StateNotice";
```

- [ ] **Step 7: Run the full suite and commit**

Run: `npm run test`
Expected: PASS.

```bash
git add -A
git commit -m "feat: add system state notices"
```

---

## Task 17: Final verification

**Files:** none created — this task verifies the whole build.

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: PASS, with no skipped tests. Record the total count.

- [ ] **Step 2: Verify the colour discipline guard is actually guarding**

Temporarily add `color: #ff0000;` to the end of `app/components/layout/Shell.module.css`, then:

Run: `npm run test -- no-hex`
Expected: FAIL, naming `Shell.module.css` and `#ff0000`. Remove the line and re-run — expected PASS. This confirms the guard works rather than silently passing.

- [ ] **Step 3: Verify both themes render**

Run: `npm run dev`, then in the browser console:

```js
document.documentElement.setAttribute("data-theme", "ink");
```

Expected: every screen inverts to warm near-black with cream type. No element keeps a light background, and no text becomes unreadable. Switch back with `"newsprint"`.

- [ ] **Step 4: Verify the production build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit any fixes and push**

```bash
git add -A
git commit -m "chore: verify themes, colour discipline and production build"
git push
```

---

## Deferred to the integration streams

These are explicitly **not** in this plan, and each has a component whose props are already shaped to receive it:

| Deferred work | Lands in |
|---|---|
| Real `AnalyserNode` amplitudes | `HalftoneBloom`'s `getAmplitudes` prop |
| Real peak data from decoded PCM | `downsampleToPeaks`, already pure and tested |
| Real Essentia results | `AnalysisReveal`'s `result` prop |
| Supabase-backed ideas | replaces `IDEAS` from fixtures |
| iTunes search + real brief | replaces `BRIEF` from fixtures |
| `/arrange` output | replaces `SONG` from fixtures |
| Tone.js playback + playhead | `Transport`'s `elapsedSec`/`onSeek` props and `SectionBlock`'s `playing` prop |
| Real stage timestamps | `CompletionStamp`'s `stages` prop |
| PWA manifest + service worker | `vite-plugin-pwa`, app-shell already static |
| openDAW embed | `/produce` route, button already present |
