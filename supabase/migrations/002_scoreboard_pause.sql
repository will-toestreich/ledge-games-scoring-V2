-- Scoreboard pause: Mission Control can freeze the public scoreboard
-- (finals suspense, mid-correction). Run once in the Supabase dashboard:
-- SQL Editor → New query → paste → Run.

alter table v2_competitions
  add column if not exists scoreboard_paused boolean not null default false;
