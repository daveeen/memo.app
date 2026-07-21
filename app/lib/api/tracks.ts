const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-search`;

export async function searchTracks(query: string) {
  const r = await fetch(`${BASE}?query=${encodeURIComponent(query)}`);
  if (!r.ok) throw new Error(`track search failed: ${r.status}`);
  return r.json();
}

export async function fetchPreviewBlob(previewUrl: string): Promise<Blob> {
  const r = await fetch(`${BASE}?preview=${encodeURIComponent(previewUrl)}`);
  if (!r.ok) throw new Error(`preview fetch failed: ${r.status}`);
  return r.blob();
}
