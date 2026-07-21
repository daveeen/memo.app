import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";

const PUBLIC = new Set(["/", "/auth"]);

export default function Shell() {
  const loc = useLocation();
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const isPublic = PUBLIC.has(loc.pathname); // produce lives outside this shell, so no /produce case needed here

  useEffect(() => {
    if (isPublic) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { nav("/auth", { replace: true }); return; }
      setReady(true);
    });
  }, [loc.pathname, isPublic, nav]);

  if (!ready) return null;

  const p = loc.pathname;
  const showTabs = p.startsWith("/ideas") || p.startsWith("/songs") || p.startsWith("/brief");
  const tab = (on: boolean) => cssText(`display:flex;flex-direction:column;align-items:center;border:none;background:none;cursor:pointer;color:${on ? "#17161B" : "#a3a2ab"};font-size:17px;`);
  const ideasOn = p === "/ideas" || p.startsWith("/ideas/");
  const songsOn = p.startsWith("/songs") || p.startsWith("/brief");

  return (
    <div style={cssText("position:relative;min-height:100vh;background:#EFE6D4;display:flex;flex-direction:column;")}>
      <Outlet />
      {showTabs && (
        <div style={cssText("position:fixed;bottom:0;left:0;right:0;height:80px;background:rgba(231,220,193,.96);backdrop-filter:blur(12px);border-top:1px solid rgba(46,36,24,.08);box-shadow:0 -10px 26px rgba(46,36,24,.1);display:flex;align-items:center;justify-content:space-around;padding-bottom:14px;z-index:50;")}>
          <button onClick={() => nav("/ideas")} style={tab(ideasOn)}>
            <span style={cssText("font-size:20px;")}>▚</span>
            <span style={cssText("font-size:11px;font-weight:700;margin-top:3px;")}>Ideas</span>
          </button>
          <button onClick={() => nav("/record")} style={cssText("display:flex;flex-direction:column;align-items:center;border:none;background:none;cursor:pointer;margin-top:-16px;")}>
            <div style={cssText("width:66px;height:44px;border-radius:11px;background:linear-gradient(160deg,#CD8140,#8E3F27);box-shadow:0 10px 24px rgba(160,86,58,.45),inset 0 1px 2px rgba(255,255,255,.32),inset 0 -5px 12px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;gap:12px;border:4px solid #EFE6D4;")}>
              <div style={cssText("width:15px;height:15px;border-radius:50%;background:#F4EDDB;box-shadow:inset 0 1px 1px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;")}><div style={cssText("width:4px;height:4px;border-radius:50%;background:#2E2418;")}></div></div>
              <div style={cssText("width:15px;height:15px;border-radius:50%;background:#F4EDDB;box-shadow:inset 0 1px 1px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;")}><div style={cssText("width:4px;height:4px;border-radius:50%;background:#2E2418;")}></div></div>
            </div>
            <span style={cssText("font-size:10px;font-weight:700;margin-top:5px;color:#57565E;")}>Record</span>
          </button>
          <button onClick={() => nav("/songs")} style={tab(songsOn)}>
            <span style={cssText("font-size:20px;")}>♪</span>
            <span style={cssText("font-size:11px;font-weight:700;margin-top:3px;")}>Songs</span>
          </button>
        </div>
      )}
    </div>
  );
}
