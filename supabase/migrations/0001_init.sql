create table ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  title text not null default 'Untitled',
  raw_path text not null,
  duration real,
  key text, bpm real,
  notes_json jsonb, input_type text, mood text
);
create table vibe_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  source text not null, source_track_name text, preview_url text,
  shared_key text, shared_bpm real,
  progression_json jsonb, structure_json jsonb
);
create table songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  idea_id uuid references ideas(id) on delete set null,
  vibe_brief_id uuid references vibe_briefs(id) on delete set null,
  chordchart_json jsonb, structure_json jsonb,
  instrumentation_json jsonb, midi_path text
);

alter table ideas enable row level security;
alter table vibe_briefs enable row level security;
alter table songs enable row level security;

-- one policy family per table: owner-only
create policy ideas_owner on ideas for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy briefs_owner on vibe_briefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy songs_owner on songs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- storage buckets (private)
insert into storage.buckets (id, name, public) values ('raw-audio','raw-audio',false), ('midi','midi',false)
  on conflict (id) do nothing;

-- storage RLS: users touch only their own top-level folder (path = <user_id>/...)
create policy "raw own" on storage.objects for all
  using (bucket_id = 'raw-audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'raw-audio' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "midi own" on storage.objects for all
  using (bucket_id = 'midi' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'midi' and (storage.foldername(name))[1] = auth.uid()::text);
