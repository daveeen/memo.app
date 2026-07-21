// Parses a CSS declaration string (as used verbatim in the Memo mockup's inline
// styles) into a React style object. Splits each declaration on its FIRST colon
// so gradient/url values with internal colons survive. kebab-case -> camelCase;
// a leading vendor dash (-webkit-) becomes a leading capital (Webkit...).
export type StyleObj = Record<string, string>;

export function cssText(s: string): StyleObj {
  const out: StyleObj = {};
  if (!s) return out;
  for (const decl of s.split(';')) {
    const t = decl.trim();
    if (!t) continue;
    const c = t.indexOf(':');
    if (c < 0) continue;
    const rawProp = t.slice(0, c).trim();
    const val = t.slice(c + 1).trim();
    if (!rawProp || !val) continue;
    const prop = rawProp.replace(/^-(webkit|moz|ms|o)-/i, (_m, v) => v.charAt(0).toUpperCase() + v.slice(1) + '-')
      .replace(/-([a-z])/g, (_m, ch) => ch.toUpperCase());
    out[prop] = val;
  }
  return out;
}
