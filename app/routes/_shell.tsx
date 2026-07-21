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
        <div style={cssText("position:fixed;bottom:0;left:0;right:0;height:80px;background:rgba(239,230,212,.92);backdrop-filter:blur(12px);border-top:1px solid rgba(0,0,0,.06);display:flex;align-items:center;justify-content:space-around;padding-bottom:14px;z-index:50;")}>
          <button onClick={() => nav("/ideas")} style={tab(ideasOn)}>
            <span style={cssText("font-size:20px;")}>▚</span>
            <span style={cssText("font-size:11px;font-weight:700;margin-top:3px;")}>Ideas</span>
          </button>
          <button onClick={() => nav("/record")} style={cssText("display:flex;flex-direction:column;align-items:center;border:none;cursor:pointer;background:none;")}>
            <span style={cssText("width:52px;height:52px;border-radius:50%;background:#17161B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 6px 16px rgba(20,15,40,.25);")}>●</span>
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
