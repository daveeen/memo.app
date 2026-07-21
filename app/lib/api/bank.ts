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
  await supabase.from("ideas").update({ title }).eq("id", id);
}

export async function saveBrief(b: Omit<VibeBrief, "id">) {
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
