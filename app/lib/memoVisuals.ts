// app/lib/memoVisuals.ts — deterministic presentation helpers copied verbatim
// from the mockup's renderVals(). Backend-independent. ponytail: synthetic
// waveform is intentional for Phase A — real decoded peaks are Phase B.
export const PAL = [
  {shell:'linear-gradient(150deg,#D98C96,#C06E7B)',glow:'radial-gradient(circle,rgba(217,140,150,.4),transparent 70%)',stripe:'#CB7C87',ink:'#3A1E22'},
  {shell:'linear-gradient(150deg,#9DB88A,#82A06C)',glow:'radial-gradient(circle,rgba(157,184,138,.4),transparent 70%)',stripe:'#8FAC7C',ink:'#1E2A16'},
  {shell:'linear-gradient(150deg,#8FB0C4,#6F94AC)',glow:'radial-gradient(circle,rgba(143,176,196,.4),transparent 70%)',stripe:'#7FA0B6',ink:'#1A242C'},
  {shell:'linear-gradient(150deg,#B79BC7,#9C7EAE)',glow:'radial-gradient(circle,rgba(183,155,199,.4),transparent 70%)',stripe:'#A88CB9',ink:'#2A1E30'},
  {shell:'linear-gradient(150deg,#DCC97A,#C4AE58)',glow:'radial-gradient(circle,rgba(220,201,122,.4),transparent 70%)',stripe:'#D0BC68',ink:'#302A12'},
  {shell:'linear-gradient(150deg,#8FC0A9,#6EA48C)',glow:'radial-gradient(circle,rgba(143,192,169,.4),transparent 70%)',stripe:'#7FAF98',ink:'#16241E'},
  {shell:'linear-gradient(150deg,#7FAFAE,#5F9291)',glow:'radial-gradient(circle,rgba(127,175,174,.4),transparent 70%)',stripe:'#6F9F9E',ink:'#122624'},
  {shell:'linear-gradient(150deg,#E094A0,#C6748A)',glow:'radial-gradient(circle,rgba(224,148,160,.4),transparent 70%)',stripe:'#D48490',ink:'#301820'},
  {shell:'linear-gradient(150deg,#95A6C9,#7688AC)',glow:'radial-gradient(circle,rgba(149,166,201,.4),transparent 70%)',stripe:'#8696BA',ink:'#1C2036'},
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
