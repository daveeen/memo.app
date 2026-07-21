# Idea Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free-text `note` field to each recorded idea, editable inline in the Bank List, auto-focused the moment a new idea is created.

**Architecture:** One nullable `note text` column on `ideas` (new migration). `updateIdeaNote()` in `bank.ts` mirrors the existing `renameIdea()`. `BankList` gets a note `<textarea>` per row plus a `justCreatedId` prop that triggers a one-time auto-focus. `RecordPanel`'s `onSaved` callback gains the new idea's id so the dashboard can set that flag.

**Tech Stack:** Same as the rest of the project — React Router 7, Supabase, no new dependencies.

**Reference spec:** `docs/superpowers/specs/2026-07-21-idea-notes-design.md`

**No live browser in this build environment** (documented in project `CLAUDE.md`) — verification throughout is `npm run typecheck` / `npm run build`. The auto-focus behavior specifically needs a live-browser pass before it's considered fully verified; each relevant task says so explicitly rather than claiming success it can't demonstrate.

---

### Task 1: Migration — add `note` column

**Files:**
- Create: `supabase/migrations/0002_add_idea_note.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table ideas add column note text;
```

- [ ] **Step 2: Confirm no other migration file already exists with this number**

Run: `ls supabase/migrations/`
Expected: only `0001_init.sql` present before this file is added — `0002_add_idea_note.sql` is the next number, no collision.

- [ ] **Step 3: Static review**

This project has no live/linked Supabase instance to run `supabase db push` against yet (documented in `CLAUDE.md` setup section — that's a manual step the human does later). Confirm only: the statement is syntactically valid (single `ALTER TABLE ... ADD COLUMN`, terminated with `;`), and `ideas` is the correct existing table name (check `supabase/migrations/0001_init.sql` for the table's real name/columns before assuming).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_add_idea_note.sql
git commit -m "feat(db): add note column to ideas"
```

---

### Task 2: `updateIdeaNote` API helper

**Files:**
- Modify: `app/lib/api/bank.ts`

- [ ] **Step 1: Read the current file first**

Read `app/lib/api/bank.ts` in full before editing — confirm the exact current signature/style of `renameIdea` (the function this mirrors) and the current top-of-file imports, since the file has grown across several earlier tasks and this plan's draft must match its real current state, not an assumed one.

- [ ] **Step 2: Append the new function**, matching `renameIdea`'s existing fire-and-forget style exactly (no error handling beyond what `renameIdea` already does — don't introduce a new error-handling pattern for one function in a file that already established its convention):

```ts
export async function updateIdeaNote(id: string, note: string) {
  await supabase.from("ideas").update({ note }).eq("id", id);
}
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: exits 0, no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/lib/api/bank.ts
git commit -m "feat(bank): updateIdeaNote"
```

---

### Task 3: `RecordPanel` surfaces the new idea's id

**Files:**
- Modify: `app/components/RecordPanel.tsx`

- [ ] **Step 1: Read the current file first**

Read `app/components/RecordPanel.tsx` in full — it has evolved (mic-stream cleanup refs, shared analyser routing, try/catch around analyze/save) since it was first drafted. Confirm the exact current shape of the `onstop` handler's success path before editing.

- [ ] **Step 2: Change the `onSaved` prop type and call site**

The prop type changes from `{ onSaved: () => void }` to `{ onSaved: (newIdeaId?: string) => void }`. `saveIdea` (in `app/lib/api/bank.ts`) already returns the inserted row via `.select().single()` — capture that return value in `onstop`'s try block and pass its `id` through on the success path:

```ts
const savedIdea = await saveIdea(blob, a, "Untitled");
setStatus("idle");
onSaved(savedIdea.id);
```

(Adjust the exact local variable name for the `saveIdea` result to whatever doesn't collide with existing names in the current file — check before naming it `savedIdea`.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/components/RecordPanel.tsx
git commit -m "feat(bank): RecordPanel surfaces new idea id via onSaved"
```

---

### Task 4: `BankList` note field + auto-focus-once

**Files:**
- Modify: `app/components/BankList.tsx`

- [ ] **Step 1: Read the current file first**

Read `app/components/BankList.tsx` in full — confirm the current `BankRow` type shape, the current `items`/`filter` state (a mood/key/bpm filter was added in an earlier task), and how the title `<input>`'s `onBlur` pattern is currently written, to match its exact style.

- [ ] **Step 2: Extend `BankRow` and props**

Add `note: string | null` to the local `BankRow` type. Add two new props to the component: `justCreatedId?: string` and `onFocusedJustCreated?: () => void`.

- [ ] **Step 3: Add the note textarea per row**

Below the existing title `<input>` in each `<li>`, add a textarea using the same `defaultValue`/`onBlur` pattern already established for the title field:

```tsx
<textarea
  ref={el => { noteRefs.current[i.id] = el; }}
  defaultValue={i.note ?? ""}
  onBlur={e => updateIdeaNote(i.id, e.target.value)}
  placeholder="note..."
/>
```

Import `updateIdeaNote` alongside the file's existing `bank.ts` imports (`listIdeas`, `ideaAudioUrl`, `renameIdea`).

- [ ] **Step 4: Add the ref map and auto-focus effect**

```tsx
const noteRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

useEffect(() => {
  if (!justCreatedId) return;
  const el = noteRefs.current[justCreatedId];
  if (el) {
    el.focus();
    el.select();
    onFocusedJustCreated?.();
  }
}, [items, justCreatedId, onFocusedJustCreated]);
```

Place `noteRefs` declaration and this effect alongside the component's existing `useState`/`useEffect` calls (check current file for where those live — likely near the top of the component body, after the existing `items` state and `listIdeas` effect).

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/components/BankList.tsx
git commit -m "feat(bank): note field + auto-focus on creation"
```

---

### Task 5: Wire it through the dashboard

**Files:**
- Modify: `app/routes/_index.tsx`

- [ ] **Step 1: Read the current file first**

Read `app/routes/_index.tsx` in full — confirm current state variable names (`k`/`setK` for the bank refresh key, the `RecordPanel`/`BankList` prop wiring) before editing, since this file was assembled across the original Task 10.1 plus a follow-up ProducePanel-wiring fix.

- [ ] **Step 2: Add `justCreatedId` state and wire it through**

```tsx
const [justCreatedId, setJustCreatedId] = useState<string>();
```

Change the `RecordPanel`'s `onSaved` handler from whatever it currently is (likely `onSaved={() => setK(k => k + 1)}` or similar) to also capture the new id:

```tsx
<RecordPanel
  analyser={analyser}
  onSaved={(id) => { setK(k => k + 1); if (id) setJustCreatedId(id); }}
/>
```

Pass the two new props to `BankList`:

```tsx
<BankList
  refreshKey={k}
  justCreatedId={justCreatedId}
  onFocusedJustCreated={() => setJustCreatedId(undefined)}
  onPick={i => { setIdea(i); setRunning(true); }}
/>
```

(Keep the existing `onPick` and any other current props exactly as they are in the real file — this step only adds the two new ones and updates `onSaved`.)

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add app/routes/_index.tsx
git commit -m "feat: wire idea-note auto-focus through dashboard"
```

---

### Task 6: Final check

- [ ] **Step 1: Full self-check**

Run: `npm run typecheck && npm run build`
Expected: both exit 0, no errors.

- [ ] **Step 2: Note the live-verification gap**

This plan cannot verify in this environment: that the textarea actually renders correctly, that focus/select actually happens on a freshly recorded idea, that `onBlur` actually persists to a live Supabase `ideas` row. State this plainly rather than claiming it works — it needs one live-browser pass (record → confirm the new row's note field is focused → type → tab away → reload → confirm the note persisted) once a live Supabase project exists.
