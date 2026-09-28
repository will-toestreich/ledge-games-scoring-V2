-- Scoreboard refresh interval: how often the public scoreboard polls for
-- new scores, in seconds (null = default 5). Run once in the Supabase
-- dashboard: SQL Editor → New query → paste → Run.

alter table v2_competitions
  add column if not exists scoreboard_refresh_seconds integer;
