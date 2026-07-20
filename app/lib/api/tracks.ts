const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-search`;

export async function searchTracks(query: string) {
  const r = await fetch(`${BASE}?query=${encodeURIComponent(query)}`);
  return r.json();
}

export async function fetchPreviewBlob(previewUrl: string): Promise<Blob> {
  const r = await fetch(`${BASE}?preview=${encodeURIComponent(previewUrl)}`);
  return r.blob();
}
