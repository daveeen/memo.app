import { supabase } from "~/lib/supabase";
import type { CaptureAnalysis, BankEntry, VibeBrief } from "~/lib/types";

export async function saveIdea(blob: Blob, a: Omit<CaptureAnalysis, "id" | "cleanedAudioPath">, title: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const path = `${user.id}/${crypto.randomUUID()}.webm`;
  const { error: uploadError } = await supabase.storage.from("raw-audio").upload(path, blob);
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("ideas").insert({
    title, raw_path: path, duration: a.durationSec, key: a.detectedKey,
    bpm: a.bpm, notes_json: a.notes, input_type: a.inputType, mood: a.moodTag,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function listIdeas(): Promise<BankEntry[]> {
  const { data } = await supabase.from("ideas").select("*").order("created_at", { ascending: false });
  return (data ?? []) as any;
}

export async function ideaAudioUrl(raw_path: string) {
  const { data } = await supabase.storage.from("raw-audio").createSignedUrl(raw_path, 3600);
  return data?.signedUrl;
}

export async function renameIdea(id: string, title: string) {
  const { error } = await supabase.from("ideas").update({ title }).eq("id", id);
  if (error) throw error;
}

export async function saveBrief(b: Omit<VibeBrief, "id">) {
  // Re-picking the same reference track re-analyzed a fresh row every time with
  // no dedup, which piled up duplicate vibe_briefs rows for the same track. RLS
  // already scopes this lookup to the caller, so reuse an existing row instead
  // of inserting another — analysis isn't served from any client-side cache,
  // this only avoids duplicate persisted rows for the identical source track.
  const { data: existing } = await supabase.from("vibe_briefs")
    .select("*").eq("source_track_name", b.sourceTrackName).eq("source", b.source).limit(1).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase.from("vibe_briefs").insert({
    source: b.source, source_track_name: b.sourceTrackName, preview_url: b.previewUrl,
    shared_key: b.key, shared_bpm: b.bpm, progression_json: b.chordProgression, structure_json: b.sections,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function listBriefs() {
  const { data } = await supabase.from("vibe_briefs").select("*").order("created_at", { ascending: false });
  return data ?? [];
}

export async function saveSong(s: any, midi: Uint8Array) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");
  const path = `${user.id}/${crypto.randomUUID()}.mid`;
  // `@types/node` (pulled in via tsconfig's `types: ["node"]`) redeclares the global
  // `Uint8Array` as generic over `ArrayBufferLike`, which no longer satisfies DOM's
  // `BlobPart` (wants `ArrayBufferView<ArrayBuffer>`) under TS 5.7+ — a tsconfig-level
  // friction, not a real runtime mismatch, so it's cast rather than restructured.
  const { error: uploadError } = await supabase.storage.from("midi").upload(path, new Blob([midi as BlobPart], { type: "audio/midi" }));
  if (uploadError) throw uploadError;
  const { data, error } = await supabase.from("songs").insert({
    idea_id: s.sourceIdeaId, vibe_brief_id: s.sourceVibeBriefId, chordchart_json: s.chordChart,
    structure_json: s.structure, instrumentation_json: s.instrumentation, midi_path: path,
  }).select().single();
  if (error) throw error;
  return { song: data, midiPath: path };
}

export async function updateIdeaNote(id: string, note: string) {
  await supabase.from("ideas").update({ note }).eq("id", id);
}

export async function getIdea(id: string) {
  const { data, error } = await supabase.from("ideas").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function updateIdeaLyrics(id: string, lyrics: string) {
  await supabase.from("ideas").update({ lyrics }).eq("id", id);
}

export async function deleteIdea(id: string, rawPath?: string | null) {
  const { error } = await supabase.from("ideas").delete().eq("id", id);
  if (error) throw error;
  // Best-effort: the row is already gone even if the storage object can't be
  // removed (e.g. already missing), so this doesn't throw on failure.
  if (rawPath) await supabase.storage.from("raw-audio").remove([rawPath]);
}

export async function getBrief(id: string) {
  const { data, error } = await supabase.from("vibe_briefs").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

// Songs list with parent titles joined in one query (no new column). Supabase
// embeds related rows via the FK relationships declared in 0001_init.sql.
export async function listSongs() {
  const { data } = await supabase
    .from("songs")
    .select("*, ideas(title), vibe_briefs(source_track_name)")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function listSongsForIdea(ideaId: string) {
  const { data } = await supabase
    .from("songs")
    .select("*, vibe_briefs(source_track_name)")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getSong(id: string) {
  const { data, error } = await supabase
    .from("songs")
    .select("*, ideas(*), vibe_briefs(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}
