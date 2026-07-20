import { useEffect, useRef } from "react";

export function Visualizer({ analyser }: { analyser?: AnalyserNode }) {
  const cv = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!analyser || !cv.current) return; // degrade: render nothing if no source
    const ctx = cv.current.getContext("2d")!;
    const buf = new Uint8Array(analyser.fftSize);
    let raf = 0;
    const draw = () => {
      analyser.getByteTimeDomainData(buf);
      const { width: w, height: h } = cv.current!;
      ctx.clearRect(0, 0, w, h);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      ctx.shadowBlur = 8 + peak / 4; // glow scales with amplitude
      ctx.shadowColor = "#6cf";
      ctx.beginPath();
      ctx.strokeStyle = "#6cf";
      ctx.lineWidth = 2;
      for (let i = 0; i < buf.length; i++) {
        const x = (i / buf.length) * w;
        const y = (buf[i] / 255) * h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [analyser]);
  return <canvas ref={cv} width={600} height={120} />;
}
