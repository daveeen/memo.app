import { useEffect, useState } from "react";
import { listIdeas, ideaAudioUrl, renameIdea } from "~/lib/api/bank";

// `listIdeas()` is declared as Promise<BankEntry[]> (see app/lib/api/bank.ts),
// but it does `select("*")` on the "ideas" table and casts the result `as any`
// — what it actually resolves at runtime is the raw snake_case Supabase row
// (supabase/migrations/0001_init.sql: raw_path, input_type, key, bpm, mood, ...),
// not the camelCase BankEntry/CaptureAnalysis shape. BankRow models that real
// runtime shape so this component both typechecks against what tsc sees
// declared and reads the columns that actually exist on the row.
type BankRow = {
  id: string;
  title: string;
  raw_path: string;
  bpm: number | null;
  key: string | null;
  input_type: string | null;
  mood: string | null;
};

export function BankList({ refreshKey, onPick }: { refreshKey: number; onPick?: (i: BankRow) => void }) {
  const [items, setItems] = useState<BankRow[]>([]);
  const [f, setF] = useState("");
  useEffect(() => {
    listIdeas().then(data => setItems(data as unknown as BankRow[]));
  }, [refreshKey]);
  async function play(p: string) {
    const u = await ideaAudioUrl(p);
    if (u) new Audio(u).play();
  }
  // Nullable fields (mood/key/bpm/input_type can all be null per BankRow) are
  // coalesced to "" before templating — otherwise a null field stringifies to
  // the literal text "null", making it falsely matchable (typing "null" would
  // surface every idea with any null field).
  const filtered = items.filter(i =>
    `${i.mood ?? ""} ${i.key ?? ""} ${i.bpm ?? ""} ${i.input_type ?? ""}`
      .toLowerCase()
      .includes(f.toLowerCase())
  );
  return <>
    <input placeholder="filter: mood/key/bpm" value={f} onChange={e => setF(e.target.value)} />
    <ul>{filtered.map(i => (
      <li key={i.id}>
        <input defaultValue={i.title} onBlur={e => renameIdea(i.id, e.target.value)} />
        <span> · {i.key} · {i.bpm != null ? Math.round(i.bpm) : "—"} bpm · {i.input_type} · {i.mood}</span>
        <button onClick={() => play(i.raw_path)}>▶</button>
        {onPick && <button onClick={() => onPick(i)}>Use</button>}
      </li>
    ))}</ul>
  </>;
}
