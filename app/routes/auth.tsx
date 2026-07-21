import { useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";

export default function Auth() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  async function sendLink() {
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (!error) setSent(true);
  }
  async function signIn() {
    const { data } = await supabase.auth.getSession();
    if (data.session) nav("/ideas", { replace: true });
  }
  const resetAuth = () => setSent(false);
  return (
    <div style={cssText("flex:1;min-height:100vh;display:flex;flex-direction:column;justify-content:center;padding:0 34px;")}>
      <div style={cssText("width:52px;height:52px;border-radius:16px;background:linear-gradient(135deg,#17161B,#39373f);display:flex;align-items:center;justify-content:center;margin-bottom:24px;")}>
        <svg width="28" height="20" viewBox="0 0 40 28" fill="none"><path d="M2 20 L8 8 L14 20 L20 4 L26 20 L32 8 L38 20" stroke="white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"></path></svg>
      </div>
      {sent ? (
        <>
          <h2 style={cssText("margin:0;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#17161B;")}>Check your email.</h2>
          <p style={cssText("font-size:14px;color:#57565E;margin:10px 0 0;")}>We sent a magic link to<br /><b style={cssText("color:#17161B;")}>{email}</b>. Tap it to sign in.</p>
          <button onClick={signIn} style={cssText("margin-top:24px;width:100%;padding:16px;border-radius:16px;border:none;background:#17161B;color:#fff;font-size:15px;font-weight:700;cursor:pointer;")}>I clicked the link</button>
          <button onClick={resetAuth} style={cssText("margin-top:10px;width:100%;padding:12px;border:none;background:none;color:#8a8791;font-size:13px;font-weight:600;cursor:pointer;")}>Use a different email</button>
        </>
      ) : (
        <>
          <h2 style={cssText("margin:0;font-size:26px;font-weight:800;letter-spacing:-.03em;color:#17161B;")}>A voice memo with<br />perfect pitch.</h2>
          <p style={cssText("font-size:14px;color:#57565E;margin:10px 0 24px;")}>Sign in with a magic link — no password.</p>
          <input placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={cssText("width:100%;height:52px;border:1px solid rgba(0,0,0,.1);border-radius:15px;padding:0 16px;font-size:15px;color:#17161B;background:#fff;outline:none;")} />
          <button onClick={sendLink} style={cssText("margin-top:12px;width:100%;padding:16px;border-radius:16px;border:none;background:#17161B;color:#fff;font-size:15px;font-weight:700;cursor:pointer;")}>Send magic link</button>
        </>
      )}
    </div>
  );
}
