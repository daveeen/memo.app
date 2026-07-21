import { useEffect } from "react";
import { useNavigate } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";

export default function Splash() {
  const nav = useNavigate();
  async function enter() {
    const { data } = await supabase.auth.getSession();
    nav(data.session ? "/ideas" : "/auth", { replace: true });
  }
  useEffect(() => {
    const t = setTimeout(enter, 2100);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <button onClick={enter} style={cssText("flex:1;min-height:100vh;width:100%;border:none;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;padding:0;background:radial-gradient(120% 70% at 50% 36%,#F0E7D6 0%,#E4D8C2 60%,#DCCFB6 100%);")}>
      <div style={cssText("position:relative;width:96px;height:96px;border-radius:28px;background:linear-gradient(150deg,#2C2A31,#141319);display:flex;align-items:center;justify-content:center;box-shadow:0 20px 44px rgba(20,18,26,.4),inset 0 2px 3px rgba(255,255,255,.18),inset 0 -10px 22px rgba(0,0,0,.35);")}>
        <div style={cssText("position:absolute;inset:-16px;border-radius:36px;background:radial-gradient(circle,rgba(46,36,24,.32),transparent 70%);filter:blur(8px);animation:mGlow 3s ease-in-out infinite;")}></div>
        <svg width="54" height="38" viewBox="0 0 40 28" fill="none" style={cssText("position:relative;")}><path d="M2 20 L8 8 L14 20 L20 4 L26 20 L32 8 L38 20" stroke="#F4EDDB" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"></path></svg>
      </div>
      <div style={cssText("margin-top:22px;font-size:44px;font-weight:700;letter-spacing:.01em;color:#2E2418;line-height:1;")}>Memo</div>
      <div style={cssText("margin-top:12px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-weight:500;font-size:14.5px;color:#8a7250;letter-spacing:0;")}>Rescue the tune stuck in your head.</div>
      <div style={cssText("position:absolute;bottom:54px;left:0;right:0;text-align:center;font-size:14px;color:#a89a82;")}>tap to begin</div>
    </button>
  );
}
