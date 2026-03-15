-- Run this against an existing resumes table to move to multi-resume support
-- with Clerk-backed JWT row level security.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'resumes'
      and column_name = 'name'
  ) then
    alter table public.resumes
      add column name text not null default 'Untitled Resume';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'resumes'
      and constraint_name = 'resumes_user_id_key'
  ) then
    alter table public.resumes
      drop constraint resumes_user_id_key;
  end if;
end
$$;

create index if not exists idx_resumes_user_id
  on public.resumes(user_id);

alter table public.resumes enable row level security;

drop policy if exists "Users can read own resume" on public.resumes;
drop policy if exists "Users can insert own resume" on public.resumes;
drop policy if exists "Users can update own resume" on public.resumes;
drop policy if exists "Users can delete own resume" on public.resumes;
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
