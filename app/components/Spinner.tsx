import { cssText } from "~/lib/cssText";

export function Spinner() {
  return (
    <div role="status" style={cssText("flex:1;display:flex;align-items:center;justify-content:center;min-height:200px;")}>
      <div style={cssText("width:40px;height:40px;border-radius:50%;border:4px solid rgba(0,0,0,.08);border-top-color:#B5503C;animation:mSpin 1s linear infinite;")}></div>
    </div>
  );
}
