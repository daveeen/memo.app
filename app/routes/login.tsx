import { useState } from "react";
import { supabase } from "~/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function send() {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    if (!error) setSent(true);
  }

  return sent ? (
    <p>Check your email for the login link.</p>
  ) : (
    <div>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
      <button onClick={send}>Send magic link</button>
    </div>
  );
}
