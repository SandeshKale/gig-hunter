-- Run this in Supabase SQL editor → New Query

create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  external_id   text unique not null,          -- upwork job URL or ID (dedup key)
  platform      text not null default 'upwork',
  title         text not null,
  description   text,
  url           text,
  budget_type   text,                          -- 'fixed' | 'hourly'
  budget_min    numeric,
  budget_max    numeric,
  skills        text[],
  relevance_score integer default 0,          -- 0–10
  proposal      text,                          -- Claude-drafted proposal text
  status        text not null default 'new',  -- new | applied | replied | won | lost | skip
  applied_at    timestamptz,
  replied_at    timestamptz,
  won_at        timestamptz,
  follow_up_sent_at timestamptz,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at();

-- Dashboard stats view
create or replace view weekly_stats as
select
  count(*)                                                              as total_jobs,
  count(*) filter (where status = 'new')                               as new_count,
  count(*) filter (where status = 'applied')                           as applied_count,
  count(*) filter (where status = 'replied')                           as replied_count,
  count(*) filter (where status = 'won')                               as won_count,
  round(100.0 *
    count(*) filter (where status = 'won') /
    nullif(count(*) filter (where status = 'applied'), 0), 1)         as win_rate_pct
from jobs
where created_at >= now() - interval '7 days';
