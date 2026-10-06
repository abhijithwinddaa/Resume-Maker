-- Run this in the Supabase SQL Editor.
--
-- Stops exposing reviewers' email addresses (and admin notes) to anyone with
-- the public anon key.
--
-- Why: the policy "Public can read public app feedback" is row-level, and RLS
-- does not restrict columns, so `select user_email from app_feedback` worked
-- anonymously for every public review. Public reviews are now served only
-- through get_public_feedback(), which returns display-safe columns and a
-- masked author label computed here, so the address never leaves the database.
--
-- Safe to run more than once. Users' own rows, inserts/updates and the admin
-- policies are unchanged.

create or replace function public.get_public_feedback(p_limit integer default 30)
returns table (
  id uuid,
  rating integer,
  comment text,
  created_at timestamptz,
  admin_reply text,
  admin_reply_at timestamptz,
  author_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.id,
    f.rating,
    f.comment,
    f.created_at,
    f.admin_reply,
    f.admin_reply_at,
    case
      when position('@' in f.user_email) > 1
        then left(split_part(f.user_email, '@', 1), 2)
             || '***@' || split_part(f.user_email, '@', 2)
      else 'anonymous'
    end as author_label
  from public.app_feedback f
  where f.is_public = true
    and f.status <> 'rejected'
  order by f.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.get_public_feedback(integer) from public;
grant execute on function public.get_public_feedback(integer) to anon, authenticated;

-- The row-level public read is what exposed every column. Drop it last, after
-- the function above exists, so public reviews keep working throughout.
drop policy if exists "Public can read public app feedback" on public.app_feedback;
