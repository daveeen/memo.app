import { supabase } from "~/lib/supabase";
import type { CaptureAnalysis, BankEntry } from "~/lib/types";

export async function saveIdea(blob: Blob, a: Omit<CaptureAnalysis, "id" | "cleanedAudioPath">, title: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const path = `${user!.id}/${crypto.randomUUID()}.webm`;
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
