// POST { key, bpm, mood } → { suggestions: {title, artist}[] }
// Deployed WITH Supabase JWT verification on, same reasoning as arrange:
// it spends the project's GEMINI_API_KEY budget per call.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, artist: { type: "string" } },
        required: ["title", "artist"],
      },
    },
  },
  required: ["suggestions"],
};

// The Interactions API returns a chronological `steps` array (model
// thoughts, tool calls, text blocks, ...), not a single flat text field —
// this mirrors arrange/index.ts's extractOutputText without needing the
// @google/genai SDK for one request.
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
  const { key, bpm, mood } = body ?? {};

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const sys = "You suggest real, existing, released songs that share the musical " +
    "character described. Never invent a title or artist — only suggest songs you " +
    "are confident actually exist and were commercially released.";
  const user = `Key: ${key}\nTempo: ${bpm} BPM\nMood: ${mood}\n` +
    `Suggest 5 real songs (title + artist) that share this musical character.`;

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
          store: false,
          response_format: { type: "text", mime_type: "application/json", schema: RESPONSE_SCHEMA },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!r.ok) throw new Error(`gemini ${r.status}: ${await r.text()}`);
    const j = await r.json();
    parsed = JSON.parse(extractOutputText(j));
  } catch (err) {
    return new Response(JSON.stringify({ error: "suggestion generation failed", detail: String(err) }), {
      status: 502,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(parsed), { headers: { ...cors, "content-type": "application/json" } });
});
