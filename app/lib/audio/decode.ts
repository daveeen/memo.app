// Returns mono Float32 PCM at the AudioContext sample rate, silence-trimmed + peak-normalized.
export async function decodeAndClean(blob: Blob): Promise<{ pcm: Float32Array; sampleRate: number; durationSec: number }> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); // decodes webm/m4a/wav/mp3 natively
  // downmix to mono
  const chs = buf.numberOfChannels, len = buf.length;
  const mono = new Float32Array(len);
  for (let c = 0; c < chs; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / chs; }
  // peak normalize
  let peak = 1e-6; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(mono[i]));
  const g = Math.min(1 / peak, 8); for (let i = 0; i < len; i++) mono[i] *= g;
  // trim leading/trailing silence (energy threshold)
  const thr = 0.02; let s = 0, e = len - 1;
  while (s < len && Math.abs(mono[s]) < thr) s++;
  while (e > s && Math.abs(mono[e]) < thr) e--;
  const trimmed = mono.subarray(s, e + 1);
  return { pcm: trimmed, sampleRate: buf.sampleRate, durationSec: trimmed.length / buf.sampleRate };
}
