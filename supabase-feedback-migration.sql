-- Run this in the Supabase SQL Editor to enable app feedback and ratings.
-- Admin moderation is restricted to these emails:
--   1) abhijithyadav786@gmail.com
--   2) abhijithwinddaa@gmail.com

create extension if not exists pgcrypto;

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  user_email text not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(trim(comment)) between 10 and 2000),
  is_public boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_feedback_status
  on public.app_feedback(status);

create index if not exists idx_app_feedback_created_at
  on public.app_feedback(created_at desc);

create index if not exists idx_app_feedback_rating
  on public.app_feedback(rating);

create or replace function public.set_app_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_feedback_updated_at on public.app_feedback;
create trigger trg_app_feedback_updated_at
before update on public.app_feedback
for each row
execute function public.set_app_feedback_updated_at();

alter table public.app_feedback enable row level security;

drop policy if exists "Users can read own app feedback" on public.app_feedback;
drop policy if exists "Users can insert own app feedback" on public.app_feedback;
drop policy if exists "Users can update own app feedback" on public.app_feedback;
drop policy if exists "Public can read approved app feedback" on public.app_feedback;
drop policy if exists "Admins can read all app feedback" on public.app_feedback;
drop policy if exists "Admins can moderate app feedback" on public.app_feedback;

create policy "Users can read own app feedback"
  on public.app_feedback for select
  using (user_id = auth.jwt()->>'sub');

create policy "Users can insert own app feedback"
  on public.app_feedback for insert
  with check (
    user_id = auth.jwt()->>'sub'
    and status = 'pending'
    and approved_by is null
    and approved_at is null
    and admin_notes is null
  );

create policy "Users can update own app feedback"
  on public.app_feedback for update
  using (user_id = auth.jwt()->>'sub')
  with check (
    user_id = auth.jwt()->>'sub'
    and status = 'pending'
    and approved_by is null
    and approved_at is null
    and admin_notes is null
  );

create policy "Public can read approved app feedback"
  on public.app_feedback for select
  using (status = 'approved' and is_public = true);

create policy "Admins can read all app feedback"
  on public.app_feedback for select
  using (
    lower(coalesce(auth.jwt()->>'email', auth.jwt()->>'primary_email_address', '')) in (
      'abhijithyadav786@gmail.com',
      'abhijithwinddaa@gmail.com'
    )
  );

create policy "Admins can moderate app feedback"
  on public.app_feedback for update
  using (
    lower(coalesce(auth.jwt()->>'email', auth.jwt()->>'primary_email_address', '')) in (
      'abhijithyadav786@gmail.com',
      'abhijithwinddaa@gmail.com'
    )
  )
  with check (
    lower(coalesce(auth.jwt()->>'email', auth.jwt()->>'primary_email_address', '')) in (
      'abhijithyadav786@gmail.com',
      'abhijithwinddaa@gmail.com'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Live popularity metrics for feedback panel
-- ─────────────────────────────────────────────────────────────

create table if not exists public.app_popularity_counters (
  feature_key text primary key
    check (feature_key in ('ats_resume_edit', 'resume_edit', 'create_resume', 'resume_download')),
  total_count bigint not null default 0,
  unique_users bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_popularity_user_usage (
  feature_key text not null
    check (feature_key in ('ats_resume_edit', 'resume_edit', 'create_resume', 'resume_download')),
  user_id text not null,
  first_used_at timestamptz not null default now(),
  primary key (feature_key, user_id)
);

insert into public.app_popularity_counters (feature_key)
values
  ('ats_resume_edit'),
  ('resume_edit'),
  ('create_resume'),
  ('resume_download')
on conflict (feature_key) do nothing;

alter table public.app_popularity_counters enable row level security;
alter table public.app_popularity_user_usage enable row level security;

revoke all on public.app_popularity_counters from anon;
revoke all on public.app_popularity_counters from authenticated;
revoke all on public.app_popularity_user_usage from anon;
revoke all on public.app_popularity_user_usage from authenticated;

drop policy if exists "Public can read popularity counters" on public.app_popularity_counters;

create policy "Public can read popularity counters"
  on public.app_popularity_counters for select
  using (true);

grant select on public.app_popularity_counters to anon;
grant select on public.app_popularity_counters to authenticated;

create or replace function public.record_popularity_usage(p_feature_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text;
  v_rows integer;
  v_unique_increment integer := 0;
begin
  v_user_id := auth.jwt()->>'sub';

  if v_user_id is null or v_user_id = '' then
    return;
  end if;

  if p_feature_key not in ('ats_resume_edit', 'resume_edit', 'create_resume', 'resume_download') then
    raise exception 'Invalid feature key: %', p_feature_key using errcode = '22023';
  end if;

  insert into public.app_popularity_user_usage (feature_key, user_id)
  values (p_feature_key, v_user_id)
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    v_unique_increment := 1;
  end if;

  insert into public.app_popularity_counters (
    feature_key,
    total_count,
    unique_users,
    updated_at
  )
  values (p_feature_key, 1, v_unique_increment, now())
  on conflict (feature_key)
  do update
    set total_count = public.app_popularity_counters.total_count + 1,
        unique_users = public.app_popularity_counters.unique_users + v_unique_increment,
        updated_at = now();
end;
$$;

revoke all on function public.record_popularity_usage(text) from public;
grant execute on function public.record_popularity_usage(text) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_popularity_counters'
  ) then
    alter publication supabase_realtime add table public.app_popularity_counters;
  end if;
end
$$;
