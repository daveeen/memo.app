import { supabase } from "~/lib/supabase";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/suggest-similar`;

export async function suggestSimilar(
  args: { key: string; bpm: number; mood: string; inputType: string },
): Promise<{ title: string; artist: string }[]> {
  // JWT-verified function (spends GEMINI_API_KEY budget) — same reasoning
  // and same header pattern as arrange.ts.
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`suggest-similar failed: ${r.status}`);
  const { suggestions } = await r.json();
  return suggestions ?? [];
}
