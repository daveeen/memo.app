-- Cleans up duplicate vibe_briefs rows that piled up because saveBrief() used to
-- insert a fresh row on every re-pick of the same reference track (app-side fix:
-- app/lib/api/bank.ts now checks for an existing row before inserting). Keeps the
-- oldest row per (user_id, source, source_track_name); any song pointing at a row
-- being deleted is repointed at the kept row first, so no song loses its brief.

with ranked as (
  select id, user_id, source, source_track_name,
         row_number() over (
           partition by user_id, source, source_track_name
           order by created_at asc, id asc
         ) as rn
  from vibe_briefs
  where source_track_name is not null
), kept as (
  select r1.id as dupe_id, r2.id as keep_id
  from ranked r1
  join ranked r2
    on r2.user_id = r1.user_id
   and r2.source = r1.source
   and r2.source_track_name = r1.source_track_name
   and r2.rn = 1
  where r1.rn > 1
)
update songs s
set vibe_brief_id = k.keep_id
from kept k
where s.vibe_brief_id = k.dupe_id;

with ranked as (
  select id,
         row_number() over (
           partition by user_id, source, source_track_name
           order by created_at asc, id asc
         ) as rn
  from vibe_briefs
  where source_track_name is not null
)
delete from vibe_briefs where id in (select id from ranked where rn > 1);

-- Belt-and-suspenders: prevent future duplicates at the data layer too, not just
-- via the app-level check-before-insert.
create unique index if not exists vibe_briefs_unique_source
  on vibe_briefs (user_id, source, source_track_name)
  where source_track_name is not null;
