-- Run this in the Supabase SQL Editor.
-- This schema assumes Clerk is configured as a third-party auth provider
-- for Supabase so auth.jwt()->>'sub' contains the Clerk user ID.

create extension if not exists pgcrypto;

create table if not exists public.resumes (
  id uuid default gen_random_uuid() primary key,
  user_id text not null,
  name text not null default 'Untitled Resume',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists idx_resumes_user_id
  on public.resumes(user_id);

alter table public.resumes enable row level security;

drop policy if exists "Users can read own resumes" on public.resumes;
drop policy if exists "Users can insert own resumes" on public.resumes;
drop policy if exists "Users can update own resumes" on public.resumes;
drop policy if exists "Users can delete own resumes" on public.resumes;

create policy "Users can read own resumes"
  on public.resumes for select
  using (user_id = auth.jwt()->>'sub');

create policy "Users can insert own resumes"
  on public.resumes for insert
  with check (user_id = auth.jwt()->>'sub');

create policy "Users can update own resumes"
  on public.resumes for update
  using (user_id = auth.jwt()->>'sub');

create policy "Users can delete own resumes"
  on public.resumes for delete
  using (user_id = auth.jwt()->>'sub');
