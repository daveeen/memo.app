import { useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";

export default function Auth() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [sending, setSending] = useState(false);
  const [authError, setAuthError] = useState("");

  async function submit() {
    if (sending || !email.trim() || !password) return;
    setSending(true);
    setAuthError("");
    const { error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setSending(false);
    if (error) setAuthError(error.message);
    else nav("/ideas", { replace: true });
  }

  return (
    <div style={cssText("flex:1;min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 34px;")}>
      <div style={cssText("width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#17161B,#39373f);display:flex;align-items:center;justify-content:center;margin-bottom:24px;")}>
        <svg width="28" height="20" viewBox="0 0 40 28" fill="none"><path d="M2 20 L8 8 L14 20 L20 4 L26 20 L32 8 L38 20" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"></path></svg>
      </div>
      <h2 style={cssText("margin:0;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#17161B;")}>A voice memo with<br />perfect pitch.</h2>
      <p style={cssText("font-size:14px;color:#57565E;margin:10px 0 24px;")}>{mode === "signin" ? "Sign in to your account." : "Create an account."}</p>
      <input placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={cssText("width:100%;height:52px;border:1px solid rgba(0,0,0,.1);border-radius:15px;padding:0 16px;font-size:15px;color:#17161B;background:#fff;outline:none;")} />
      <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} style={cssText("margin-top:10px;width:100%;height:52px;border:1px solid rgba(0,0,0,.1);border-radius:15px;padding:0 16px;font-size:15px;color:#17161B;background:#fff;outline:none;")} />
      <button
        onClick={submit}
        disabled={sending || !email.trim() || !password}
        style={cssText(`margin-top:12px;width:100%;padding:16px;border-radius:16px;border:none;background:#17161B;color:#fff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;opacity:${sending || !email.trim() || !password ? .5 : 1};`)}
      >
        {sending && (
          <span style={cssText("width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:mSpin .8s linear infinite;display:inline-block;")}></span>
        )}
        {sending ? "…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      {authError && (
        <p role="alert" style={cssText("margin:10px 0 0;font-size:13px;color:#B5503C;")}>{authError}</p>
      )}
      <button
        onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setAuthError(""); }}
        style={cssText("margin-top:14px;width:100%;padding:8px;border:none;background:none;color:#8a8791;font-size:13px;font-weight:600;cursor:pointer;")}
      >
        {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
