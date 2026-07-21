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

// Angular fingerprint polygon — seed derived from a stable per-idea number so
// each recording gets a unique but deterministic waveform.
export function wavePoints(seed: number): string {
  const N=22,W=100,H=24,mid=H/2,amp=mid-1,top:string[]=[],bot:string[]=[];
  for(let i=0;i<N;i++){ const env=1-Math.abs(i-(N-1)/2)/((N-1)/2); const r=Math.abs(Math.sin(seed*12.9898*(i+1)))%1;
    const p=Math.max(0.06,(0.35+0.65*r)*(0.35+0.65*env)); const x=(i*W/(N-1)).toFixed(1);
    top.push(`${x},${(mid-p*amp).toFixed(1)}`); bot.push(`${x},${(mid+p*amp).toFixed(1)}`);}
  return top.concat(bot.reverse()).join(' ');
}

// Stable seed from a uuid string (mockup used numeric ids; real ids are uuids).
export function seedFromId(id: string): number {
  let h=0; for(let i=0;i<id.length;i++){ h=(h*31 + id.charCodeAt(i)) % 100000; } return (h % 900)/100 + 1;
}

// Cassette-shape decoration for one idea row/card. `idx` selects the palette.
export function decoIdea(d: {id:string; key?:string|null; bpm?:number|null; input_type?:string|null; mood?:string|null; title?:string; duration?:number|null; keyLow?:boolean}, idx: number) {
  const p = PAL[idx % PAL.length];
  const keyShort = (d.key||'').split(' ')[0];
  const bpmShort = d.bpm != null ? `${Math.round(d.bpm)}` : '—';
  return {
    id: d.id, ...p,
    name: d.title || 'Untitled',
    key: d.key || '—', bpm: d.bpm != null ? `${Math.round(d.bpm)} BPM` : '— BPM',
    type: d.input_type || 'other', mood: d.mood || '—',
    duration: d.duration != null ? `0:${String(Math.round(d.duration)).padStart(2,'0')}` : '0:00',
    wavePoints: wavePoints(seedFromId(d.id)),
    keyLow: !!d.keyLow,
    spineMeta: `${keyShort} · ${bpmShort}`,
  };
}
