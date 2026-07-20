import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const TOKENS_FILE = "app/styles/tokens.css";

// All CSS files in the repo, unfiltered. Used only to prove the glob
// mechanism itself works (see "the globbing mechanism works" below) --
// if this ever finds nothing, the guard below would be silently
// meaningless, so we fail loudly instead.
const ALL_CSS_FILES = globSync("app/**/*.css").map((f) => f.replace(/\\/g, "/"));

// The files actually policed for literal hex colours. tokens.css is the
// one file allowed to contain them, so it's excluded. Right now this list
// is empty (tokens.css is the only CSS file in the repo) -- the first real
// CSS Module arrives in a later task. An empty list must not make this
// suite error or silently skip forever; see the guarded `it` below.
const CSS_FILES_TO_CHECK = ALL_CSS_FILES.filter((f) => !f.endsWith(TOKENS_FILE));

describe("colour discipline", () => {
  it("the globbing mechanism works (finds tokens.css)", () => {
    expect(ALL_CSS_FILES.some((f) => f.endsWith(TOKENS_FILE))).toBe(true);
  });

  it("no CSS file outside tokens.css contains a literal hex colour", () => {
    // Deliberately not `it.each` -- with zero files to check (true today,
    // until a later task adds the first CSS Module) `it.each([])` must not
    // throw or silently vanish. Iterating inside a single `it` guarantees
    // the assertion runs -- and can fail -- regardless of how many files
    // exist.
    const violations: string[] = [];

    for (const file of CSS_FILES_TO_CHECK) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const matches = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      if (matches.length > 0) {
        violations.push(`${file}: ${matches.join(", ")}`);
      }
    }

    expect(violations, "Use a token instead of a literal hex colour.").toEqual([]);
  });
});
