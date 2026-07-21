import { supabase } from "~/lib/supabase";
import type { CaptureAnalysis, VibeBrief, SongBuild } from "~/lib/types";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arrange`;

export async function buildSong(idea: any, brief: any): Promise<Omit<SongBuild, "id" | "backingMidiPath">> {
  // `arrange` is deployed with Supabase JWT verification on, so the Authorization header must
  // carry the signed-in user's own access token — the shared anon key is not a user session and
  // either fails verification outright or (worse) authenticates as no one in particular.
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify({
      key: idea.key, tempo: idea.bpm,
      chords: [], melody_contour: (idea.notes_json ?? idea.notes)?.map((n: any) => n.pitch),
      ref_progression: brief.progression_json ?? brief.chordProgression,
      structure: (brief.structure_json ?? brief.sections).map((s: any, i: number) => ({ label: s.label, order: i + 1 })),
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err.error ?? `arrange failed: ${r.status}`);
  }
  const { chordChart, instrumentation } = await r.json();
  const structure = (brief.structure_json ?? brief.sections).map((s: any, i: number) => ({ label: s.label, order: i + 1 }));
  return { sourceIdeaId: idea.id, sourceVibeBriefId: brief.id, chordChart, structure, instrumentation };
}
