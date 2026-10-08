-- Rate-limit + landing-stats hardening. Safe to run more than once.
-- Run in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 1. Global AI rate limit
-- The in-memory limiter only holds per warm Vercel instance, so parallel
-- requests spread across instances bypass it. This keeps the counter in
-- Postgres so every instance shares it. Only the service role (server) may
-- touch it.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_rate_limit_events (
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_rate_limit_events_user_created_idx
  on public.ai_rate_limit_events (user_id, created_at);

alter table public.ai_rate_limit_events enable row level security;
-- No policies on purpose: with RLS on and no policy, non-service roles see nothing.
revoke all on public.ai_rate_limit_events from public;
revoke all on public.ai_rate_limit_events from anon;
revoke all on public.ai_rate_limit_events from authenticated;

create or replace function public.consume_ai_rate_limit(
  p_user_id text,
  p_limit int,
  p_window_seconds int
)
returns table (allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window interval := make_interval(secs => p_window_seconds);
  v_count int;
  v_oldest timestamptz;
begin
  -- Serialise concurrent calls for the same user so count-then-insert is atomic.
  perform pg_advisory_xact_lock(hashtext(p_user_id));

  -- Keep the table small: drop this user's expired events.
  delete from public.ai_rate_limit_events e
  where e.user_id = p_user_id
    and e.created_at <= now() - v_window;

  select count(*), min(e.created_at)
    into v_count, v_oldest
  from public.ai_rate_limit_events e
  where e.user_id = p_user_id;

  if v_count < p_limit then
    insert into public.ai_rate_limit_events (user_id) values (p_user_id);
    return query select true, 0;
    return;
  end if;

  return query select
    false,
    greatest(1, ceil(extract(epoch from (v_oldest + v_window - now())))::int);
end;
$$;

revoke execute on function public.consume_ai_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.consume_ai_rate_limit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- 2. Landing stats: stop one user inflating total_count by looping the RPC
-- total_count now only increments if this user's last counted use of the
-- feature is older than a cooldown. unique_users logic is unchanged.
-- ---------------------------------------------------------------------------
alter table public.app_popularity_user_usage
  add column if not exists last_counted_at timestamptz;

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
  v_cooldown interval;
begin
  v_user_id := auth.jwt()->>'sub';

  if v_user_id is null or v_user_id = '' then
    return;
  end if;

  if p_feature_key not in ('ats_resume_edit', 'resume_edit', 'create_resume', 'resume_download') then
    raise exception 'Invalid feature key: %', p_feature_key using errcode = '22023';
  end if;

  -- Downloads are discrete actions (short cooldown); edit/create keys fire
  -- repeatedly while working, so one count per 10 minutes is plenty.
  v_cooldown := case p_feature_key
    when 'resume_download' then interval '2 minutes'
    else interval '10 minutes'
  end;

  -- First ever use by this user: counts as unique and as a total.
  insert into public.app_popularity_user_usage (feature_key, user_id, last_counted_at)
  values (p_feature_key, v_user_id, now())
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    v_unique_increment := 1;
  else
    -- Repeat use: the UPDATE row-locks, so concurrent calls can't both pass
    -- the cooldown check. Zero rows updated means still cooling down.
    update public.app_popularity_user_usage
       set last_counted_at = now()
     where feature_key = p_feature_key
       and user_id = v_user_id
       and (last_counted_at is null or last_counted_at < now() - v_cooldown);

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return;
    end if;
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
