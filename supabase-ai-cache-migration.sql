-- Run this in the Supabase SQL Editor to enable server-side AI response caching.
-- The table is intended for service-role access from Vercel Functions.

create table if not exists public.ai_response_cache (
  cache_key text primary key,
  operation text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_ai_response_cache_operation
  on public.ai_response_cache(operation);

create index if not exists idx_ai_response_cache_expires_at
  on public.ai_response_cache(expires_at);

alter table public.ai_response_cache enable row level security;

revoke all on public.ai_response_cache from anon;
revoke all on public.ai_response_cache from authenticated;

drop policy if exists "No direct access to ai cache" on public.ai_response_cache;

create policy "No direct access to ai cache"
  on public.ai_response_cache
  for all
  using (false)
  with check (false);
