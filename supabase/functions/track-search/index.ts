// GET ?query=... → results; GET ?preview=<url> → streams the mp3 (CORS shim)
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

// iTunes preview clips are always served from Apple's CDN (*.mzstatic.com).
// This function has no auth and a wide-open CORS policy, so the `preview`
// param must be allowlisted — otherwise anyone could point it at an
// arbitrary/internal URL (e.g. ?preview=http://169.254.169.254/...) and use
// this deployed Edge Function as an open SSRF relay.
const ALLOWED_PREVIEW_HOST_SUFFIX = ".mzstatic.com";

function isAllowedPreviewUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      u.hostname.endsWith(ALLOWED_PREVIEW_HOST_SUFFIX);
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
    return new Response(r.body, { headers: { ...cors, "Content-Type": "audio/mpeg" } });
  }
  const q = url.searchParams.get("query") ?? "";
  const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=8`);
  const j = await r.json();
  const out = j.results.filter((t: any)=>t.previewUrl).map((t: any) => ({
    trackName: t.trackName, artist: t.artistName, artworkUrl: t.artworkUrl100, previewUrl: t.previewUrl,
  }));
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
});
