-- The Ledge Games — initial schema
-- Mirrors the app's local data model (src/lib/types.ts, src/data/db.ts):
-- competitions (seasons) own competitors, scores, and keg attempts; one row
-- in app_state points at the active competition.
--
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table v2_competitions (
  id text primary key,
  status text not null default 'active' check (status in ('active', 'completed')),
  name text not null,
  year int not null,
  scorer_pin text not null default '1234',
  mentors_enabled boolean not null default true,
  title_tiebreak_winners jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table v2_competitors (
  competition_id text not null references v2_competitions(id) on delete cascade,
  id text not null,
  division_id text not null check (division_id in ('mens', 'womens', 'mentors')),
  bib_number int not null,
  first_name text not null,
  last_name text not null default '',
  nickname text,
  hometown text,
  email text,
  shirt_size text,
  registration text check (registration in ('paid', 'cash', 'sponsor')),
  paid boolean not null default false,
  checked_in boolean not null default false,
  no_show boolean not null default false,
  event_skips jsonb not null default '[]'::jsonb,
  primary key (competition_id, id),
  unique (competition_id, bib_number)
);

create table v2_scores (
  competition_id text not null references v2_competitions(id) on delete cascade,
  id text not null, -- `${competitorId}:${eventId}:r${round}:a${attempt}`
  competitor_id text not null,
  event_id text not null check (event_id in ('axe', 'keg', 'caber', 'archery', 'chop', 'hammer')),
  round int not null,
  attempt int not null,
  value numeric not null,
  penalty numeric not null default 0,
  declined boolean not null default false,
  recorded_at timestamptz not null default now(),
  primary key (competition_id, id)
);

create table v2_keg_attempts (
  competition_id text not null references v2_competitions(id) on delete cascade,
  id text not null, -- `${competitorId}:keg:h${height}:a${attempt}`
  competitor_id text not null,
  height_ft int not null,
  attempt int not null,
  result text not null check (result in ('clear', 'miss', 'pass')),
  recorded_at timestamptz not null default now(),
  primary key (competition_id, id)
);

-- Single-row pointer at the active competition
create table v2_app_state (
  id int primary key default 1 check (id = 1),
  active_competition_id text references v2_competitions(id)
);
insert into v2_app_state (id) values (1);

create index scores_by_competitor on v2_scores (competition_id, competitor_id);
create index scores_by_event on v2_scores (competition_id, event_id);
create index keg_by_competitor on v2_keg_attempts (competition_id, competitor_id);
create index competitors_by_division on v2_competitors (competition_id, division_id);

-- V1 security model: the app is a trusted-crew tool behind a UI PIN; the anon
-- key may read and write everything. Tighten with Supabase auth later.
alter table v2_competitions enable row level security;
alter table v2_competitors enable row level security;
alter table v2_scores enable row level security;
alter table v2_keg_attempts enable row level security;
alter table v2_app_state enable row level security;

create policy "anon full access" on v2_competitions for all using (true) with check (true);
create policy "anon full access" on v2_competitors for all using (true) with check (true);
create policy "anon full access" on v2_scores for all using (true) with check (true);
create policy "anon full access" on v2_keg_attempts for all using (true) with check (true);
create policy "anon full access" on v2_app_state for all using (true) with check (true);

-- Live scoreboard updates (the app also polls as a fallback)
alter publication supabase_realtime add table v2_scores, v2_keg_attempts, v2_competitors, v2_competitions, v2_app_state;
