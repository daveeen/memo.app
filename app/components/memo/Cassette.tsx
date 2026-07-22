import { cssText } from "~/lib/cssText";

export interface CassetteIdea {
  name: string; key: string; bpm: string; type: string; mood: string; duration: string;
  shell: string; glow: string; stripe: string; wavePoints: string; keyLow: boolean;
}

export function Cassette({ idea, showMeta = true }: { idea: CassetteIdea; showMeta?: boolean }) {
  return (
    <div style={cssText("display:flex;flex-direction:column;cursor:grab;")}>
      <div style={cssText("position:relative;width:100%;aspect-ratio:8/5;")}>
        <div style={cssText(`position:absolute;inset:9%;border-radius:22px;background:${idea.glow};filter:blur(17px);opacity:.95;`)}></div>
        <div style={cssText(`position:absolute;inset:0;border-radius:13px;background:${idea.shell};box-shadow:0 15px 32px rgba(20,12,50,.34),inset 0 2px 3px rgba(255,255,255,.4),inset 0 -7px 15px rgba(0,0,0,.24);overflow:hidden;`)}>
          <div style={cssText("position:absolute;inset:0;background:linear-gradient(122deg,rgba(255,255,255,.46) 0%,transparent 32%,transparent 66%,rgba(0,0,0,.16) 100%);")}></div>
          <div style={cssText("position:absolute;top:0;left:13%;width:15%;height:100%;background:rgba(255,255,255,.18);transform:skewX(-12deg);")}></div>
          <div style={cssText("position:absolute;top:7px;left:7px;width:5px;height:5px;border-radius:50%;background:rgba(0,0,0,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);")}></div>
          <div style={cssText("position:absolute;top:7px;right:7px;width:5px;height:5px;border-radius:50%;background:rgba(0,0,0,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);")}></div>
          <div style={cssText("position:absolute;bottom:7px;left:7px;width:5px;height:5px;border-radius:50%;background:rgba(0,0,0,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);")}></div>
          <div style={cssText("position:absolute;bottom:7px;right:7px;width:5px;height:5px;border-radius:50%;background:rgba(0,0,0,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.4);")}></div>
          <div style={cssText("position:absolute;top:8%;left:8.5%;right:8.5%;height:37%;border-radius:5px;background:linear-gradient(180deg,#fcfbff,#efedf8);box-shadow:0 1px 2px rgba(0,0,0,.16);overflow:hidden;display:flex;flex-direction:column;")}>
            <div style={cssText(`height:4px;background:${idea.stripe};flex:none;`)}></div>
            <div style={cssText("flex:1;display:flex;align-items:center;padding:2px 8px;")}>
              <svg viewBox="0 0 100 24" preserveAspectRatio="none" style={cssText("width:100%;height:78%;display:block;")}><path d={idea.wavePoints} fill={idea.stripe}></path></svg>
            </div>
            <div style={cssText(`flex:none;display:flex;align-items:center;gap:5px;padding:0 8px 4px;font-size:8px;font-weight:700;letter-spacing:.02em;color:${idea.stripe};opacity:.62;`)}>{idea.key}<span style={cssText("opacity:.5;")}>·</span>{idea.bpm}</div>
          </div>
          <div style={cssText("position:absolute;bottom:10%;left:16%;right:16%;height:33%;border-radius:8px;background:radial-gradient(circle at 50% 40%,#2a2836,#0c0b14);box-shadow:inset 0 2px 5px rgba(0,0,0,.6);display:flex;align-items:center;justify-content:space-between;padding:0 13%;")}>
            <div style={cssText("width:32%;aspect-ratio:1;border-radius:50%;background:conic-gradient(from 0deg,#e8dcc4 0 30deg,#c4b291 30deg 60deg,#e8dcc4 60deg 90deg,#c4b291 90deg 120deg,#e8dcc4 120deg 150deg,#c4b291 150deg 180deg,#e8dcc4 180deg 210deg,#c4b291 210deg 240deg,#e8dcc4 240deg 270deg,#c4b291 270deg 300deg,#e8dcc4 300deg 330deg,#c4b291 330deg 360deg);display:flex;align-items:center;justify-content:center;animation:casReel 5s linear infinite;")}><div style={cssText("width:34%;aspect-ratio:1;border-radius:50%;background:#0c0b14;")}></div></div>
            <div style={cssText("width:32%;aspect-ratio:1;border-radius:50%;background:conic-gradient(from 0deg,#e8dcc4 0 30deg,#c4b291 30deg 60deg,#e8dcc4 60deg 90deg,#c4b291 90deg 120deg,#e8dcc4 120deg 150deg,#c4b291 150deg 180deg,#e8dcc4 180deg 210deg,#c4b291 210deg 240deg,#e8dcc4 240deg 270deg,#c4b291 270deg 300deg,#e8dcc4 300deg 330deg,#c4b291 330deg 360deg);display:flex;align-items:center;justify-content:center;animation:casReel 3.4s linear infinite;")}><div style={cssText("width:52%;aspect-ratio:1;border-radius:50%;background:#0c0b14;")}></div></div>
          </div>
          <div style={cssText(`position:absolute;bottom:8.5%;left:50%;transform:translateX(-50%);padding:2px 8px;border-radius:10px;background:rgba(255,255,255,.94);font-size:8px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${idea.stripe};box-shadow:0 2px 5px rgba(0,0,0,.2);`)}>{idea.type}</div>
        </div>
      </div>
      {showMeta && (
        <div style={cssText("margin-top:11px;")}>
          <div style={cssText("display:flex;align-items:center;gap:6px;")}>
            <div style={cssText("font-size:14px;font-weight:700;letter-spacing:-.01em;color:#1c1c28;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;")}>{idea.name}</div>
            {idea.keyLow && (
              <span title="key confidence low" style={cssText("flex:none;font-size:9px;font-weight:700;color:#b45309;background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.4);border-radius:6px;padding:1px 5px;")}>key?</span>
            )}
          </div>
          <div style={cssText("display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:6px;")}>
            <span style={cssText("font-size:10.5px;font-weight:700;color:#2c2c33;background:rgba(20,20,25,.07);border-radius:7px;padding:2px 7px;text-transform:capitalize;")}>{idea.type}</span>
            <span title="mood is inferred, not measured" style={cssText("font-size:10.5px;font-weight:600;font-style:italic;color:#8a8791;border:1px dashed rgba(120,118,128,.5);border-radius:7px;padding:2px 7px;")}>~ {idea.mood}</span>
            <span style={cssText("font-size:10.5px;font-weight:500;color:#8a8791;")}>{idea.duration}</span>
          </div>
        </div>
      )}
    </div>
  );
}
