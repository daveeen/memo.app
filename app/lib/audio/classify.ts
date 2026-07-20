import type { EssentiaInstance, EssentiaVector } from "./essentia";

export function classifyInput(e: EssentiaInstance, vec: EssentiaVector): "hum" | "vocal" | "guitar" | "other" {
  const onset = e.OnsetRate(vec).onsetRate;
  const flatness = e.Flatness(e.Spectrum(vec).spectrum).flatness;
  if (flatness < 0.05 && onset < 2) return "hum";
  if (onset > 3) return "guitar";
  return "vocal";
}
