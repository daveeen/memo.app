export interface CaptureAnalysis {
  id: string; durationSec: number; detectedKey: string; bpm: number;
  inputType: "hum" | "vocal" | "guitar" | "other"; moodTag: string;
  notes: { pitch: string; startSec: number; durSec: number }[];
  cleanedAudioPath: string;
}
export interface VibeBrief {
  id: string; sourceTrackName: string; source: "itunes" | "upload"; previewUrl?: string;
  key: string; bpm: number;
  chordProgression: { chord: string; startSec: number; durSec: number }[];
  sections: { label: "intro"|"verse"|"chorus"|"bridge"|"outro"; startSec: number; endSec: number }[];
}
export interface SongBuild {
  id: string; sourceIdeaId: string; sourceVibeBriefId: string;
  chordChart: { chord: string; section: string }[];
  structure: { label: string; order: number }[];
  instrumentation: string[]; backingMidiPath?: string;
}
export interface BankEntry extends CaptureAnalysis { createdAt: string; title: string; }
