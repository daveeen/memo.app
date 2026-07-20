import { useEffect, useRef, useState } from "react";
export function Timer({ running }: { running: boolean }) {
  const [ms,setMs]=useState(0); const t0=useRef(0); const raf=useRef(0);
  useEffect(()=>{ if(running){ t0.current=performance.now()-ms; const loop=()=>{ setMs(performance.now()-t0.current); raf.current=requestAnimationFrame(loop);}; raf.current=requestAnimationFrame(loop);} return ()=>cancelAnimationFrame(raf.current); },[running]);
  const s=Math.floor(ms/1000); return <div>⏱ {Math.floor(s/60)}:{String(s%60).padStart(2,"0")} <small>(manual ≈ 3–4 hr)</small></div>;
}
