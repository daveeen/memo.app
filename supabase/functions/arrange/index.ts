// POST { key, tempo, chords, melody_contour, ref_progression, structure } → { chordChart, instrumentation }
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
    instrumentation: { type: "array", items: { type: "string" } },
  },
  required: ["chordChart", "instrumentation"],
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
  const { key, tempo, chords, melody_contour, ref_progression, structure } = body ?? {};

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const sys = "You are a music arranger. Stay strictly in the given key and tempo. " +
    "Use only diatonic chords of that key unless a chord is already in the provided reference progression.";
  const user = `Key: ${key}\nTempo: ${tempo}\nReference progression: ${JSON.stringify(ref_progression)}\n` +
    `Melody contour: ${JSON.stringify(melody_contour)}\nStructure: ${JSON.stringify(structure)}\n` +
    `Generate a chord chart ordered to follow the structure.`;

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

  return new Response(JSON.stringify(parsed), { headers: { ...cors, "content-type": "application/json" } });
});
