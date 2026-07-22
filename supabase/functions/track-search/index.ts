// GET ?query=... → results; GET ?preview=<url> → streams the mp3 (CORS shim);
// GET ?image=<url> → streams the artwork image (same shim)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  // This app's COEP `Cross-Origin-Embedder-Policy: require-corp` header (needed
  // for the openDAW WASM worklet, see public/_headers) blocks any cross-origin
  // <img>/<audio> load whose response doesn't carry this header — Apple's CDN
  // doesn't set one, so both proxy routes below need it explicitly or the
  // browser silently drops the image/audio regardless of the CORS headers.
  "Cross-Origin-Resource-Policy": "cross-origin",
};

// iTunes preview clips and artwork are served from Apple's own domains. This
// function has no auth and a wide-open CORS policy, so both proxied-url params
// must be allowlisted — otherwise anyone could point either at an arbitrary/
// internal URL (e.g. ?preview=http://169.254.169.254/...) and use this deployed
// Edge Function as an open SSRF relay.
//
// Confirmed live (2026-07-21) against a real `itunes.apple.com/search` call:
// every previewUrl host was `audio-ssl.itunes.apple.com` — NOT `*.mzstatic.com`
// as originally (wrongly) assumed here without checking. Keeping mzstatic.com
// too since Apple's own asset CDN does use it for other content types, and
// artwork specifically really is served from mzstatic.com.
const ALLOWED_PROXY_HOST_SUFFIXES = [".itunes.apple.com", ".mzstatic.com"];

function isAllowedProxyUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") &&
      ALLOWED_PROXY_HOST_SUFFIXES.some(suffix => u.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);

  const preview = url.searchParams.get("preview");
  if (preview) {
    if (!isAllowedProxyUrl(preview)) {
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

  const image = url.searchParams.get("image");
  if (image) {
    if (!isAllowedProxyUrl(image)) {
      return new Response(JSON.stringify({ error: "image host not allowed" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const r = await fetch(image);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `image fetch failed: ${r.status}` }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    return new Response(r.body, { headers: { ...cors, "Content-Type": r.headers.get("content-type") ?? "image/jpeg" } });
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
  // Rewriting artworkUrl to route through our own ?image= proxy here (rather
  // than in every caller) means every screen that shows iTunes artwork gets
  // a working, COEP-safe image with zero client-side changes.
  const selfBase = `${url.origin}${url.pathname}`;
  const out = results.filter((t: any) => t.previewUrl).map((t: any) => ({
    trackName: t.trackName, artist: t.artistName,
    artworkUrl: `${selfBase}?image=${encodeURIComponent(t.artworkUrl100)}`,
    previewUrl: t.previewUrl,
  }));
  return new Response(JSON.stringify(out), { headers: { ...cors, "Content-Type": "application/json" } });
});
