# Idea Notes — Design

## Purpose

Every recorded idea (hum/vocal/guitar capture) can carry a free-text note — lyric fragments, mood, "sounds like a bridge," reminders. Purely organizational: not fed into `/arrange`, not shown on Vibe Briefs (reference tracks), just attached to the user's own recordings.

## Scope

- **In scope:** one nullable text field on `ideas`, editable inline in `BankList`, auto-focused the moment a new idea is created.
- **Out of scope:** Vibe Brief notes, structured lyric editor, speech-to-text transcription, feeding notes into arrangement generation. (All explicitly declined during brainstorm — can be separate future specs if wanted.)

## Data model

New migration `supabase/migrations/0002_add_idea_note.sql`:

```sql
alter table ideas add column note text;
```

No RLS change needed — `ideas_owner` policy (`user_id = auth.uid()`) already covers all columns on the row, including the new one.

Naming: the field is `note` (singular). `CaptureAnalysis`/`BankEntry` already use `notes` (plural) for the detected-melody pitch array — a different, unrelated concept. Do not reuse that name.

## API

Append to `app/lib/api/bank.ts`, mirroring the existing `renameIdea`:

```ts
export async function updateIdeaNote(id: string, note: string) {
  await supabase.from("ideas").update({ note }).eq("id", id);
}
```

Fire-and-forget, no error surfaced — same established pattern as `renameIdea` in the same file. `BankRow` (local type in `BankList.tsx`) gains `note: string | null`.

## UI / data flow

**BankList.tsx:**
- Each `<li>` gets a `<textarea>` (or similarly-sized `<input>`) below the existing title input, `defaultValue={i.note ?? ""}`, `onBlur` calling `updateIdeaNote(i.id, e.target.value)` — same interaction pattern as the title field two lines above it.
- New prop `justCreatedId?: string` and `onFocusedJustCreated?: () => void`. A `useEffect` keyed on `[items, justCreatedId]`: if `justCreatedId` is set and a matching item exists in `items`, focus (and select-all, so typing starts fresh) that item's note textarea via a `ref` map, then call `onFocusedJustCreated?.()` to clear the flag upstream. This fires once per creation, not on every unrelated refresh — refreshes from renaming/other edits won't steal focus, because `justCreatedId` only changes when a *new* idea is actually created.

**RecordPanel.tsx:**
- `onSaved` prop signature changes from `() => void` to `(newIdeaId?: string) => void`. `saveIdea` already returns the inserted row (`data` from `.select().single()`) — pass `data.id` through in the existing success path. No other RecordPanel behavior changes.

**`app/routes/_index.tsx` (dashboard):**
- New state `const [justCreatedId, setJustCreatedId] = useState<string>()`.
- `RecordPanel`'s `onSaved` becomes `(id) => { setK(k => k + 1); if (id) setJustCreatedId(id); }`.
- `BankList` gets `justCreatedId={justCreatedId}` and `onFocusedJustCreated={() => setJustCreatedId(undefined)}`.

## Error handling

Matches the rest of this codebase's established minimal style: no toast system, no retry, fire-and-forget writes on blur (same as `renameIdea`). Not introducing a new error-handling pattern for one field.

## Testing / verification

No live browser available in this build environment (project-wide constraint, documented in `CLAUDE.md`). Verification is `npm run typecheck` + `npm run build` — both must pass with zero errors. The auto-focus behavior specifically needs a live-browser check before this is considered fully verified; note that gap rather than claim it works from static checks alone.

## Self-review

- No placeholders/TBDs.
- No contradictions: RecordPanel's prop-signature change is the only cross-file ripple, and it's a strict superset (optional callback arg) — doesn't break the existing no-arg call pattern anywhere else that might reference it.
- Scope: single, focused feature — no decomposition needed.
- Ambiguity check: "editable anytime" + "auto-focus once on creation, not on every refresh" was the one genuinely ambiguous point going in; resolved explicitly above via the `justCreatedId` clear-after-focus mechanism.
