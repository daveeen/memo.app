// app/lib/memoVisuals.ts — deterministic presentation helpers copied verbatim
// from the mockup's renderVals(). Backend-independent. ponytail: synthetic
// waveform is intentional for Phase A — real decoded peaks are Phase B.
export const PAL = [
  {shell:'linear-gradient(150deg,#C4593E,#9A3B2A)',glow:'radial-gradient(circle,rgba(196,89,62,.45),transparent 70%)',stripe:'#B34A34',ink:'#F3E6CF'},
  {shell:'linear-gradient(150deg,#D08A44,#A85E24)',glow:'radial-gradient(circle,rgba(208,138,68,.45),transparent 70%)',stripe:'#B76C2C',ink:'#F5EAD3'},
  {shell:'linear-gradient(150deg,#C9A84C,#9C7C2C)',glow:'radial-gradient(circle,rgba(201,168,76,.42),transparent 70%)',stripe:'#A98A32',ink:'#3A2E16'},
  {shell:'linear-gradient(150deg,#7E7E3E,#575A24)',glow:'radial-gradient(circle,rgba(126,126,62,.42),transparent 70%)',stripe:'#6A6C2E',ink:'#F1EAD2'},
  {shell:'linear-gradient(150deg,#5E8577,#3E5F53)',glow:'radial-gradient(circle,rgba(94,133,119,.42),transparent 70%)',stripe:'#4E7364',ink:'#EFE7D2'},
  {shell:'linear-gradient(150deg,#B9A987,#8E7C57)',glow:'radial-gradient(circle,rgba(185,169,135,.42),transparent 70%)',stripe:'#8E7C57',ink:'#3A2E1A'},
  {shell:'linear-gradient(150deg,#6E8490,#4C616C)',glow:'radial-gradient(circle,rgba(110,132,144,.42),transparent 70%)',stripe:'#5B727D',ink:'#EFEAD8'},
  {shell:'linear-gradient(150deg,#9A5A3C,#6E3B23)',glow:'radial-gradient(circle,rgba(154,90,60,.42),transparent 70%)',stripe:'#82492E',ink:'#F3E4CE'},
  {shell:'linear-gradient(150deg,#A85463,#7A3946)',glow:'radial-gradient(circle,rgba(168,84,99,.42),transparent 70%)',stripe:'#8E4351',ink:'#F3E2D6'},
];
export const SEC_COLORS = ['#C4593E','#7E7E3E','#D08A44','#C9A84C','#5E8577'];

// Shared by wavePoints() (synthetic) and realWavePath() (actual decoded
// audio): builds a smooth closed SVG <path> `d` string from a 0..1
// normalized envelope of any length, via quadratic midpoint smoothing (turns
// a jagged polyline into a flowing organic curve — a straight-edge <polygon>
// through raw samples reads as sketchy, not like audio).
function envelopeToPath(env: number[]): string {
  const W = 100, H = 24, mid = H / 2, amp = mid - 1;
  const n = env.length;
  const top: [number, number][] = env.map((p, i) => [i * W / (n - 1), mid - p * amp] as [number, number]);
  const bot: [number, number][] = env.map((p, i) => [i * W / (n - 1), mid + p * amp] as [number, number]).reverse();
  const pts = [...top, ...bot];
  const mid0 = [(pts[0][0] + pts[pts.length - 1][0]) / 2, (pts[0][1] + pts[pts.length - 1][1]) / 2];
  let d = `M ${mid0[0].toFixed(1)},${mid0[1].toFixed(1)}`;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i], next = pts[(i + 1) % pts.length];
    const mx = (cur[0] + next[0]) / 2, my = (cur[1] + next[1]) / 2;
    d += ` Q ${cur[0].toFixed(1)},${cur[1].toFixed(1)} ${mx.toFixed(1)},${my.toFixed(1)}`;
  }
  return d + ' Z';
}

// Synthetic waveform fingerprint — seed derived from a stable per-idea
// number so each recording gets a unique but deterministic shape. Used by
// Cassette's compact list/thumbnail view, which stays decorative/synthetic
// even once real peaks exist (see realWavePath) — a tiny thumbnail doesn't
// need to be literal, and it's the only rendering available before a
// recording has been analyzed.
export function wavePoints(seed: number): string {
  const N = 40;
  let env = Array.from({ length: N }, (_, i) => {
    const e = 1 - Math.abs(i - (N - 1) / 2) / ((N - 1) / 2);
    const r = Math.abs(Math.sin(seed * 12.9898 * (i + 1))) % 1;
    return Math.max(0.06, (0.35 + 0.65 * r) * (0.35 + 0.65 * e));
  });
  // Smooth sample-to-sample jaggedness (two passes of a 3-tap average) so the
  // envelope reads like a real audio waveform instead of random spikes.
  for (let pass = 0; pass < 2; pass++) {
    env = env.map((v, i) => (env[Math.max(0, i - 1)] + 2 * v + env[Math.min(N - 1, i + 1)]) / 4);
  }
  return envelopeToPath(env);
}

// Real waveform from decoded-audio peaks (see bucketPeaks) — used only by
// Idea Detail's big waveform, once a recording has waveform_json stored.
export function realWavePath(peaks: number[]): string {
  if (peaks.length < 2) return envelopeToPath([0.1, 0.1]);
  // Normalize against this recording's own loudest bucket so a quiet take
  // still fills the waveform box, rather than reusing the seeded-noise
  // generator's arbitrary 0.06-1 range.
  const max = Math.max(...peaks, 1e-6);
  return envelopeToPath(peaks.map((p) => Math.max(0.06, p / max)));
}

// Bucket a decoded PCM signal into `bucketCount` peak-amplitude samples
// (max absolute value per bucket). Called once at record time on the same
// Float32Array decodeAndClean() already produced — no extra decode cost.
export function bucketPeaks(pcm: Float32Array, bucketCount = 70): number[] {
  if (pcm.length === 0) return Array.from({ length: bucketCount }, () => 0);
  const bucketSize = Math.max(1, Math.floor(pcm.length / bucketCount));
  const peaks: number[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const start = i * bucketSize;
    const end = i === bucketCount - 1 ? pcm.length : start + bucketSize;
    let max = 0;
    for (let j = start; j < end && j < pcm.length; j++) max = Math.max(max, Math.abs(pcm[j]));
    peaks.push(max);
  }
  return peaks;
}

// Maps an absolute chord index (position/beat, from playback.ts's
// SongPlayback.getPosition()) to which row of Builder's `structure` array
// currently owns it — purely positional (cumulative chord count per row),
// NOT by matching structure[i].label against each chord's `section` string.
// songs.$id.tsx's own `structure` computation filters chords by label match,
// which silently merges rows that share a label (e.g. two "verse" rows) —
// not fixed here (out of scope, not what was asked), but this function
// avoids compounding that ambiguity: given each row's already-computed
// `chords.length`, index-based lookup is unambiguous regardless of
// duplicate labels.
export function chordIndexToRow(chordCountsByRow: number[], chordIndex: number): number {
  let row = 0, cumulative = 0;
  for (let i = 0; i < chordCountsByRow.length; i++) {
    if (chordIndex >= cumulative) row = i;
    cumulative += chordCountsByRow[i];
  }
  return row;
}

// Stable seed from a uuid string (mockup used numeric ids; real ids are uuids).
export function seedFromId(id: string): number {
  let h=0; for(let i=0;i<id.length;i++){ h=(h*31 + id.charCodeAt(i)) % 100000; } return (h % 900)/100 + 1;
}

// mm:ss — was hardcoding "0:" and padding the raw second count (75s rendered
// as "0:75" instead of "1:15"); this actually rolls seconds over into minutes.
function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Palette index derived from the idea's own id (same hashing approach as
// seedFromId), not list position — decoIdea() used to take an `idx` param
// for this, which meant the SAME idea could render a different tape/wave
// colour depending on where it happened to sit in whatever array was being
// mapped (e.g. index 0 on the list vs. hardcoded index 0 on Idea Detail
// regardless of the idea's real position). Stable per-id colour means an
// idea looks the same everywhere it's rendered.
function paletteIndexFromId(id: string): number {
  let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return h % PAL.length;
}

// Cassette-shape decoration for one idea row/card.
export function decoIdea(d: {id:string; key?:string|null; bpm?:number|null; input_type?:string|null; mood?:string|null; title?:string; duration?:number|null; keyLow?:boolean; waveform_json?: number[] | null}) {
  const p = PAL[paletteIndexFromId(d.id)];
  const keyShort = (d.key||'').split(' ')[0];
  const bpmShort = d.bpm != null ? `${Math.round(d.bpm)}` : '—';
  const realPeaks = d.waveform_json && d.waveform_json.length > 1 ? d.waveform_json : null;
  return {
    id: d.id, ...p,
    name: d.title || 'Untitled',
    key: d.key || '—', bpm: d.bpm != null ? `${Math.round(d.bpm)} BPM` : '— BPM',
    type: d.input_type || 'other', mood: d.mood || '—',
    duration: d.duration != null ? formatDuration(d.duration) : '0:00',
    wavePoints: wavePoints(seedFromId(d.id)),
    realWavePoints: realPeaks ? realWavePath(realPeaks) : null,
    keyLow: !!d.keyLow,
    spineMeta: `${keyShort} · ${bpmShort}`,
  };
}

// Real "sounds like" matching — scores an idea's key+BPM against a reference
// track's key+BPM (both real analysis output, not fixtures). There is no
// external song-similarity/audio-features API wired into this app (Spotify's
// audio-features endpoint is now access-restricted; no other catalog exists
// here), so matches are only ever drawn from tracks the user has themselves
// analyzed via the Brief screen (`vibe_briefs`) — real numbers, honestly
// small pool, never a fabricated "94% match" against a song we know nothing about.
function keySimilarity(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const [rootA, modeA] = a.split(' ');
  const [rootB, modeB] = b.split(' ');
  if (rootA === rootB && modeA === modeB) return 1;
  if (rootA === rootB) return 0.7; // same root, different mode (relative major/minor still feels close)
  return 0.2;
}
function bpmSimilarity(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null || b == null) return 0;
  return Math.max(0, 1 - Math.abs(a - b) / 40); // linear falloff, ~0 past a 40bpm gap
}

export interface SoundsLikeMatch { id: string; title: string; matchPct: string; art: string }

// `refs` are raw vibe_briefs rows (need `id`, `source_track_name`, `shared_key`, `shared_bpm`).
export function soundsLike(
  idea: { key?: string | null; bpm?: number | null },
  refs: { id: string; source_track_name: string; shared_key?: string | null; shared_bpm?: number | null }[],
  limit = 4,
): SoundsLikeMatch[] {
  return refs
    .map((r, idx) => ({
      id: r.id,
      title: r.source_track_name,
      score: keySimilarity(idea.key, r.shared_key) * 0.5 + bpmSimilarity(idea.bpm, r.shared_bpm) * 0.5,
      art: PAL[idx % PAL.length].shell,
    }))
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((m) => ({ id: m.id, title: m.title, matchPct: `${Math.round(m.score * 100)}%`, art: m.art }));
}
