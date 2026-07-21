import { supabase } from "~/lib/supabase";

export function ProducePanel({ songId, midiPath }: { songId?: string; midiPath?: string }) {
  async function download() {
    if (!midiPath) return;
    const { data } = await supabase.storage.from("midi").createSignedUrl(midiPath, 3600);
    if (data) window.open(data.signedUrl);
  }
  return <div>
    <button disabled={!midiPath} onClick={download}>Download .mid</button>
    {songId && <a href={`/produce/${songId}`}>Open in openDAW →</a>}
  </div>;
}
