// POST { key, tempo, chords, melody_contour, ref_progression, structure } → { chordChart, structure, instrumentation }
// Deployed WITH Supabase JWT verification on (no --no-verify-jwt), unlike track-search which is
// intentionally public. The platform checks the caller's Supabase session token before this code
// runs, so auth is not this file's job — it only needs to not fall over on bad input or a bad
// upstream response, since it's still spending the project's GEMINI_API_KEY budget per call.
//
// Uses Gemini's Interactions API (generally available, the current recommended endpoint —
// the older generateContent API is now "legacy") with response_format.schema for real JSON-mode
// output, confirmed live against https://ai.google.dev/gemini-api/docs/structured-output and
// https://ai.google.dev/gemini-api/docs/text-generation (2026-07). This replaces Claude's
// return-ONLY-JSON-prompt + manual brace-slicing with schema-enforced structured output.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    chordChart: {
      type: "array",
      items: {
        type: "object",
        properties: { chord: { type: "string" }, section: { type: "string" } },
        required: ["chord", "section"],
      },
    },
    structure: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: { label: { type: "string" } },
        required: ["label"],
      },
    },
    instrumentation: { type: "array", items: { type: "string" } },
  },
  required: ["chordChart", "structure", "instrumentation"],
};

// The Interactions API returns a chronological `steps` array (model thoughts, tool
// calls, text blocks, ...), not a single flat text field — the SDK's `output_text`
// convenience getter joins the LAST run of consecutive text blocks; this mirrors
// that without the SDK (no @google/genai dependency needed for one request).
function extractOutputText(data: any): string {
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  let text: string | undefined;
  for (const step of steps) {
    const blocks = Array.isArray(step?.content) ? step.content : [];
    for (const block of blocks) {
      if (block?.type === "text" && typeof block.text === "string") text = block.text;
    }
  }
  if (text === undefined) throw new Error("no text content in interaction response");
  return text;
}

// Renderer contract: midi.ts/playback.ts only understand major/minor triads (root + optional
// trailing "m"). The prompt asks Gemini for exactly that, but a stray "Dm7"/"G7sus4"/"F/A" would
// otherwise render as silent-wrong audio, so collapse any chord to its triad here. Keep in sync
// with scripts/check-arrange-chord.mjs, which tests these exact cases.
function normTriad(raw: unknown): string {
  if (typeof raw !== "string") return "C";
  const m = raw.trim().match(/^([A-Ga-g])([#b]?)(.*)$/);
  if (!m) return "C";
  // Minor only for a leading lowercase "m" (not "maj"), "min", or "-". Capital "M" stays major.
  const isMinor = /^(m(?!aj)|min|-)/.test(m[3]);
  return m[1].toUpperCase() + m[2] + (isMinor ? "m" : "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" },
    });
  }
  const { key, tempo, mood, melody, ref_progression, structure } = body ?? {};

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const sys =
    "You are an expert songwriter and arranger. You harmonize a hummed melody into a chord chart " +
    "that sounds intentional and emotionally specific — never a generic template.\n\n" +
    "HARMONY:\n" +
    "- Stay in the given key and tempo. The key sets 'home', but you are NOT limited to its 6 diatonic triads.\n" +
    "- Harmonize the MELODY: in each section the chosen chords' notes should contain the melody's emphasized " +
    "notes (longer notes and notes on strong beats — infer beats from the start times and tempo). Short notes " +
    "may be non-chord passing tones.\n" +
    "- Use color DELIBERATELY to fit the mood, drawn from: secondary dominants (the major triad a fifth above a " +
    "diatonic chord, e.g. E->Am), borrowed chords from the parallel key (iv, bVII, bVI, bIII, minor v), and " +
    "mode-appropriate substitutions. One well-placed non-diatonic chord is the difference between memorable and " +
    "generic.\n" +
    "- Give each section its OWN harmonic identity. Verse and chorus must NOT share the same progression. Never " +
    "reflexively output I-V-vi-IV or I-IV-V-I.\n\n" +
    "MOOD -> COLOR (guidance, not rules): bright/happy -> major, IV, V/V, sus feel; sad/melancholy -> minor, " +
    "borrowed iv, bVI, bVII; dreamy/nostalgic -> bVII, iii, minor v, modal; tense/dark -> minor, bII, bVI.\n\n" +
    "CHORD FORMAT (STRICT, hard constraint): every chord is a plain major or minor triad written as a note " +
    "letter A-G, an optional # or b, and a trailing lowercase 'm' for minor ONLY. Valid: \"C\", \"Am\", \"F#\", " +
    "\"Bbm\", \"E\", \"Db\". Do NOT emit sevenths, sus, add, slash, maj, or numbers.\n\n" +
    "STRUCTURE: if a reference structure is given, echo its labels in order; if it is null, invent a natural song " +
    "structure that fits the key, tempo, and melody, then harmonize to it. Aim for ~2-4 chords per section with a " +
    "clear harmonic rhythm, and make distinct sections actually feel distinct.\n\n" +
    "EXAMPLE (format + variety only, do not copy): key C, mood \"nostalgic\" -> " +
    "Verse: Am, F, C, G | Chorus: F, G, Em, Am | Bridge: Bb, Gm, Eb, F  (bVII/minor-v/bIII borrowed for lift). " +
    "The bridge leaves the diatonic set on purpose — that is the point.";
  const user =
    `Key: ${key}\nTempo: ${tempo} BPM\nMood: ${mood ?? "unspecified"}\n` +
    `Reference progression (from a similar song, may be null): ${JSON.stringify(ref_progression)}\n` +
    `Melody (pitch, start sec, duration sec): ${JSON.stringify(melody)}\n` +
    `Structure (echo its labels if given, else null -> invent one): ${JSON.stringify(structure)}\n` +
    `Produce chordChart (chords ordered to follow the structure, each tagged with its section label), the ` +
    `structure array, and instrumentation that fits the mood and tempo.`;

  let parsed: any;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let r: Response;
    try {
      r = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-lite",
          system_instruction: sys,
          input: user,
          store: false, // one-shot request, no multi-turn follow-up needed
          response_format: { type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    // Gemini returns error bodies (401/429/5xx) as normal JSON, not a fetch
    // rejection — without this check a bad key or rate limit would parse as
    // empty steps and silently mask a real API failure as a valid empty song.
    if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
    const j = await r.json();
    // response_format.schema already enforces valid, schema-conforming JSON —
    // JSON.parse itself is the only thing that can still fail here.
    parsed = JSON.parse(extractOutputText(j));
  } catch (err) {
    return new Response(JSON.stringify({ error: "arrangement generation failed", detail: String(err) }), {
      status: 502,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  // Enforce the renderer's triad-only chord contract regardless of what the model returned.
  if (Array.isArray(parsed?.chordChart)) {
    for (const c of parsed.chordChart) if (c) c.chord = normTriad(c.chord);
  }

  return new Response(JSON.stringify(parsed), { headers: { ...cors, "content-type": "application/json" } });
});
