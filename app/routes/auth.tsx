import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { supabase } from "~/lib/supabase";
import { cssText } from "~/lib/cssText";

const RESEND_COOLDOWN_SEC = 60; // matches Supabase Auth's own OTP resend window — no point allowing a click before then, it'll just 429

export default function Auth() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown > 0]);

  async function sendLink() {
    if (sending || cooldown > 0 || !email.trim()) return; // no double-submit — repeated clicks each fired a real OTP request and tripped Supabase's rate limit
    setSending(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setSending(false);
    setCooldown(RESEND_COOLDOWN_SEC); // block further requests until Supabase's own window clears, whether this one succeeded or not
    if (error) setAuthError(error.status === 429 ? "Too many attempts — wait a bit before trying again." : error.message);
    else setSent(true);
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
          <button
            onClick={sendLink}
            disabled={sending || cooldown > 0 || !email.trim()}
            style={cssText(`margin-top:12px;width:100%;padding:16px;border-radius:16px;border:none;background:#17161B;color:#fff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;opacity:${sending || cooldown > 0 || !email.trim() ? .5 : 1};`)}
          >
            {sending && (
              <span style={cssText("width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:mSpin .8s linear infinite;display:inline-block;")}></span>
            )}
            {sending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Send magic link"}
          </button>
          {authError && (
            <p role="alert" style={cssText("margin:10px 0 0;font-size:13px;color:#B5503C;")}>{authError}</p>
          )}
        </>
      )}
    </div>
  );
}
