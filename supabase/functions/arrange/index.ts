// POST { key, tempo, chords, melody_contour, ref_progression, structure } → { chordChart, instrumentation }
// Deployed WITH Supabase JWT verification on (no --no-verify-jwt), unlike track-search which is
// intentionally public. The platform checks the caller's Supabase session token before this code
// runs, so auth is not this file's job — it only needs to not fall over on bad input or a bad
// upstream response, since it's still spending the project's ANTHROPIC_API_KEY budget per call.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

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

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  const sys = "You are a music arranger. Return ONLY JSON. Stay strictly in the given key and tempo. " +
    "Use only diatonic chords of that key unless a chord is already in the provided reference progression.";
  const user = `Key: ${key}\nTempo: ${tempo}\nReference progression: ${JSON.stringify(ref_progression)}\n` +
    `Melody contour: ${JSON.stringify(melody_contour)}\nStructure: ${JSON.stringify(structure)}\n` +
    `Return {"chordChart":[{"chord":string,"section":string}],"instrumentation":[string]} ` +
    `where chordChart is ordered to follow the structure.`;

  let parsed: any;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let r: Response;
    try {
      r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001", max_tokens: 1024,
          system: sys, messages: [{ role: "user", content: user }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    // Anthropic returns error bodies (401/429/5xx) as normal JSON, not a fetch
    // rejection — without this check a bad key or rate limit would parse as
    // `j.content` undefined -> "{}" -> an empty-but-"successful" arrangement,
    // silently masking a real API failure as a valid empty song.
    if (!r.ok) throw new Error(`anthropic ${r.status}: ${await r.text()}`);
    const j = await r.json();
    const text = j.content?.[0]?.text ?? "{}";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in model response");
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch (err) {
    return new Response(JSON.stringify({ error: "arrangement generation failed", detail: String(err) }), {
      status: 502,
      headers: { ...cors, "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(parsed), { headers: { ...cors, "content-type": "application/json" } });
});
