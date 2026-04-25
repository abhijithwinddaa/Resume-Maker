-- Run this after supabase-feedback-migration.sql.
-- Adds:
-- 1) one-time welcome + daily reminder notification storage
-- 2) admin reply fields on feedback records

create extension if not exists pgcrypto;

alter table public.app_feedback
  add column if not exists admin_reply text,
  add column if not exists admin_reply_by text,
  add column if not exists admin_reply_at timestamptz,
  add column if not exists admin_reply_emailed_at timestamptz,
  add column if not exists admin_reply_email_id text;

create index if not exists idx_app_feedback_admin_reply_at
  on public.app_feedback(admin_reply_at desc);

create table if not exists public.app_user_notifications (
  user_id text primary key,
  user_email text not null,
  first_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  welcome_email_sent_at timestamptz,
  welcome_email_id text,
  last_reminder_sent_at timestamptz,
  last_reminder_email_id text,
  reminder_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_user_notifications_last_seen_at
  on public.app_user_notifications(last_seen_at desc);

create index if not exists idx_app_user_notifications_last_reminder_sent_at
  on public.app_user_notifications(last_reminder_sent_at asc nulls first);

create index if not exists idx_app_user_notifications_reminder_enabled
  on public.app_user_notifications(reminder_enabled);

create or replace function public.set_app_user_notifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_user_notifications_updated_at on public.app_user_notifications;
create trigger trg_app_user_notifications_updated_at
before update on public.app_user_notifications
for each row
execute function public.set_app_user_notifications_updated_at();

alter table public.app_user_notifications enable row level security;
