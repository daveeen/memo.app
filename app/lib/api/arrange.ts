import { supabase } from "~/lib/supabase";
import type { CaptureAnalysis, VibeBrief, SongBuild } from "~/lib/types";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arrange`;

// The real cost of this call is Gemini inference server-side, not the fetch
// itself — nothing client-side to speed up there. What this cache buys:
// (a) a repeat buildSong() for the SAME idea+brief pair (e.g. a double-click,
// or the Chooser re-visited) resolves instantly instead of paying for a
// second LLM round trip, and (b) two concurrent calls for the same pair
// share one in-flight request instead of firing twice. Session-lived,
// module-level Map — same pattern as useCachedFetch.ts. Deliberate tradeoff:
// a genuine "rebuild this same pair for a different arrangement" now needs a
// page reload to bypass it — accepted because repeat-pair builds are rare
// and mostly accidental (double-click/back-and-retry), not a "reroll" flow.
const buildCache = new Map<string, Promise<Omit<SongBuild, "id" | "backingMidiPath">>>();

export async function buildSong(idea: any, brief: any | null): Promise<Omit<SongBuild, "id" | "backingMidiPath">> {
  const cacheKey = `${idea.id}:${brief?.id ?? "none"}`;
  const cached = buildCache.get(cacheKey);
  if (cached) {
    console.log("[arrange] cache hit", cacheKey);
    return cached;
  }
  console.log("[arrange] cache miss — calling Gemini", cacheKey);
  const promise = requestArrangement(idea, brief);
  buildCache.set(cacheKey, promise);
  // Don't cache a failed build — a network blip shouldn't permanently poison
  // this pair for the rest of the session.
  promise.catch(() => buildCache.delete(cacheKey));
  return promise;
}

async function requestArrangement(idea: any, brief: any | null): Promise<Omit<SongBuild, "id" | "backingMidiPath">> {
  // `arrange` is deployed with Supabase JWT verification on, so the Authorization header must
  // carry the signed-in user's own access token — the shared anon key is not a user session and
  // either fails verification outright or (worse) authenticates as no one in particular.
  const { data: { session } } = await supabase.auth.getSession();
  // Send the melody WITH timing (start/duration), not a bare pitch list — the arranger needs to
  // know which notes are structural (long / on strong beats) to harmonize to them instead of
  // defaulting to a safe generic progression. Rounded to 2dp to keep the payload small.
  const melody = ((idea.notes_json ?? idea.notes) ?? []).map((n: any) => ({
    pitch: n.pitch,
    start: Math.round((n.startSec ?? 0) * 100) / 100,
    dur: Math.round((n.durSec ?? 0) * 100) / 100,
  }));
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({
      key: idea.key, tempo: idea.bpm, mood: idea.mood ?? idea.moodTag ?? null,
      melody,
      ref_progression: brief ? (brief.progression_json ?? brief.chordProgression) : null,
      structure: brief ? (brief.structure_json ?? brief.sections).map((s: any, i: number) => ({ label: s.label, order: i + 1 })) : null,
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error ?? `arrange failed: ${r.status}`);
  }
  // `structure` now comes back from the arrange function itself — either an
  // echo of the reference structure we sent, or (when we sent null because
  // there was no brief) the one Gemini invented from key/tempo/melody alone.
  // Gemini only returns {label} per entry (see arrange/index.ts's schema);
  // `order` is derived from array position here, same as it always was for
  // the brief-supplied case.
  const { chordChart, instrumentation, structure: rawStructure } = await r.json();
  const structure = (rawStructure ?? []).map((s: any, i: number) => ({ label: s.label, order: i + 1 }));
  return { sourceIdeaId: idea.id, sourceVibeBriefId: brief?.id ?? null, chordChart, structure, instrumentation };
}
