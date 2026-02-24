-- Run this in the Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- 1. Create the resumes table
create table if not exists public.resumes (
  id         uuid default gen_random_uuid() primary key,
  user_id    text not null unique,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- 2. Enable Row Level Security
alter table public.resumes enable row level security;

-- 3. Allow anyone with anon key to do CRUD (filtered by user_id in the app)
--    For production, integrate Clerk JWT with Supabase auth for proper RLS.
create policy "Users can read own resume"
  on public.resumes for select
  using (true);

create policy "Users can insert own resume"
  on public.resumes for insert
  with check (true);

create policy "Users can update own resume"
  on public.resumes for update
  using (true);

create policy "Users can delete own resume"
  on public.resumes for delete
  using (true);
