# Password Auth (replacing magic link) — Design

**Why:** Magic-link sign-in hit Supabase's default 2-emails/hour project cap (no custom SMTP configured), making sign-in unreliable during testing. Password auth needs zero emails since `enable_confirmations = false` in `supabase/config.toml` — `signUp()` returns an active session immediately.

**Scope:** `app/routes/auth.tsx` only. No schema/migration changes — `auth.users` already supports password auth natively via Supabase Auth.

## Design

- Single screen, no route split. Two inputs: email, password.
- `mode: "signin" | "signup"` state, default `"signin"`. A text link below the submit button toggles it.
- Submit button label and handler follow `mode`:
  - `"signin"` → `supabase.auth.signInWithPassword({ email, password })`
  - `"signup"` → `supabase.auth.signUp({ email, password })`
- Either call, on success, yields an active session → `nav("/ideas", { replace: true })` directly (no confirmation step, since `enable_confirmations = false`).
- Errors (wrong password, duplicate email on signup, weak password — `minimum_password_length = 6`, no extra `password_requirements` configured) surface via the existing `authError` paragraph, `error.message` passed through as-is (Supabase's messages are already user-readable for these cases).
- Removed entirely: `sent`, `sending`→kept (renamed conceptually to "submitting" but same variable), `cooldown`, `RESEND_COOLDOWN_SEC`, the cooldown `useEffect`, the "check your email" branch, `signInWithOtp`.

**Skipped (YAGNI):** forgot-password flow. Small app, add a reset-password route later if actually needed.

## Self-review

- No placeholders, no TBDs.
- No contradiction with existing `_shell.tsx` auth-guard logic (unchanged — it just checks for a session, doesn't care how the session was obtained).
- Scope is a single file, no decomposition needed.
