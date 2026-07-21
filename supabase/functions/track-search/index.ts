// GET ?query=... → results; GET ?preview=<url> → streams the mp3 (CORS shim)
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

// iTunes preview clips are served from Apple's own domains. This function has
// no auth and a wide-open CORS policy, so the `preview` param must be
// allowlisted — otherwise anyone could point it at an arbitrary/internal URL
// (e.g. ?preview=http://169.254.169.254/...) and use this deployed Edge
// Function as an open SSRF relay.
//
// Confirmed live (2026-07-21) against a real `itunes.apple.com/search` call:
// every previewUrl host was `audio-ssl.itunes.apple.com` — NOT `*.mzstatic.com`
// as originally (wrongly) assumed here without checking. Keeping mzstatic.com
// too since Apple's own asset CDN does use it for other content types and may
// for previews in some region/catalog case; itunes.apple.com is the confirmed one.
const ALLOWED_PREVIEW_HOST_SUFFIXES = [".itunes.apple.com", ".mzstatic.com"];

function isAllowedPreviewUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      ALLOWED_PREVIEW_HOST_SUFFIXES.some(suffix => u.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const preview = url.searchParams.get("preview");
  if (preview) {
    if (!isAllowedPreviewUrl(preview)) {
      return new Response(JSON.stringify({ error: "preview host not allowed" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const r = await fetch(preview);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `preview fetch failed: ${r.status}` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(r.body, { headers: { ...cors, "Content-Type": "audio/mpeg" } });
  }
  const q = url.searchParams.get("query") ?? "";
  const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`);
  if (!r.ok) {
    return new Response(JSON.stringify({ error: `itunes search failed: ${r.status}` }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const j = await r.json();
  const results = Array.isArray(j?.results) ? j.results : [];
  const out = results.filter((t: any)=>t.previewUrl).map((t: any) => ({
    trackName: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl100, previewUrl: t.previewUrl,
  }));
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
});
