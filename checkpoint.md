# Checkpoint — 2026-07-21

State: clean, all committed, `master`, HEAD `df8fba9`, tag `checkpoint-idea-notes-done`.

## Resume instructions (fresh session)

1. Read `CLAUDE.md` (project root) first — architecture, gotchas, decisions.
2. This file — what's done, what's next.
3. Continue at **openDAW integration, Task 1** below.

## Done this session

- Full core app (Phases 0–10 of `../memo-implementation-plan.md`): scaffold, PWA, Supabase schema, DSP core (Essentia), Idea Bank, Vibe Brief, Song Builder, Timer, Visualizer, Produce (stub), dashboard wiring.
- Self-check + CodeRabbit review pass, all findings fixed (chord-quality bugs in MIDI/playback, missing `r.ok` checks across arrange pipeline, `bank.ts` auth null-check).
- Swapped `/arrange` edge fn from Anthropic Claude to **Gemini** (`gemini-3.1-flash-lite`, Interactions API, real schema-enforced JSON mode — see `CLAUDE.md` Decisions).
- Wrote `CLAUDE.md` (project memory — read it before touching anything).
- **Idea Notes feature — fully done**, all 6 tasks in `docs/superpowers/plans/2026-07-21-idea-notes.md`. Note column on `ideas`, `updateIdeaNote`, `RecordPanel` passes new-idea-id through `onSaved`, `BankList` note textarea auto-focuses once on creation. typecheck+build clean, not live-verified (no browser in build env).

## Not started: openDAW integration

Spec: `docs/superpowers/specs/2026-07-21-opendaw-integration-design.md`
Plan: `docs/superpowers/plans/2026-07-21-opendaw-integration.md` (10 tasks)

**Start at Task 1** — a real API spike reading `node_modules/@opendaw/`'s actual `.d.ts` files (`ProjectApi`, `EngineFacade`, `WasmEngine`, `lib-midi`'s decoder). Nothing after Task 1 should run until Task 1's findings are appended to the bottom of the plan file — later tasks' draft code depends on it and may need adjusting. Task 1 can legitimately come back BLOCKED (falls back to the already-working `.mid` download path) — that's a sanctioned outcome per the spec, not a failure to force through.

Execution process: subagent-driven-development, same as everything else this session — fresh subagent per task, read the plan's exact task section, execute its steps, verify, commit.

## Manual steps still pending (user doing separately)

Not blocking further code work, but needed before anything runs live:
1. Create Supabase project → `npx supabase login` → `npx supabase link --project-ref <ref>` → `npx supabase db push` (now 2 migrations: `0001_init.sql`, `0002_add_idea_note.sql`)
2. Verify RLS in SQL editor as `anon` role
3. Fill real `.env` from `.env.example`
4. `npx supabase secrets set GEMINI_API_KEY=...` (not `ANTHROPIC_API_KEY` — swapped) → deploy both edge functions (`arrange` with JWT verify on, `track-search` with `--no-verify-jwt`)
5. `npx wrangler pages deploy build/client --project-name memo` (Cloudflare login required)
6. First live smoke test in an actual browser — nothing in this build has been browser-verified, only typecheck/build/Node-level checks (essentia WASM execution, MIDI roundtrip)

## Known open item

openDAW licensing: user said it's resolved on their end (was AGPL v3 blocker in the original stub) — not re-litigated, proceeding on that basis.
