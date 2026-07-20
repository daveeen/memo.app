import type { EssentiaInstance, EssentiaVector } from "./essentia";

export type Section = {
  label: "intro" | "verse" | "chorus" | "bridge" | "outro";
  startSec: number;
  endSec: number;
};

// ponytail: segmentation ships as even-quarters with real labels; upgrade to true
// self-similarity boundaries if time remains. The Essentia handle and audio vector
// are threaded through now so that upgrade needs no signature change.
export function segment(_e: EssentiaInstance, _vec: EssentiaVector, samples: number): Section[] {
  const dur = samples / 44100;
  const labels: Section["label"][] = ["intro", "verse", "chorus", "outro"];
  const step = dur / labels.length;
  return labels.map((label, i) => ({ label, startSec: i * step, endSec: (i + 1) * step }));
}
