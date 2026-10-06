-- Run this in the Supabase SQL Editor.
--
-- Stops users forging admin replies on their own feedback row.
--
-- Why: the policies "Users can insert/update own app feedback" only check
-- user_id, status, approved_* and admin_notes. They do not restrict
-- admin_reply, admin_reply_by, admin_reply_at, admin_reply_emailed_at,
-- admin_reply_email_id or user_email, so anyone with the public anon key and
-- their own Clerk token could PATCH/POST their row with a fake "admin reply",
-- and the landing page publishes admin_reply. RLS cannot restrict individual
-- columns, so a trigger enforces it.
--
-- Allowed to write the admin_* columns: the service role (api/feedback/reply.ts
-- uses the service-role client), database owners (this SQL editor), and the
-- admin emails listed in public.feedback_actor_email() checks. Everyone else
-- gets an exception. For non-admins, user_email is set from their own token's
-- email (so nobody can point admin-reply emails at someone else's address).
--
-- Safe to run more than once.

create or replace function public.guard_app_feedback_admin_columns()
returns trigger
language plpgsql
as $$
declare
  is_privileged boolean;
begin
  is_privileged :=
    coalesce(auth.role(), '') = 'service_role'
    or current_user in ('service_role', 'postgres', 'supabase_admin')
    or public.feedback_actor_email() in (
      'abhijithyadav786@gmail.com',
      'abhijithwinddaa@gmail.com'
    );

  if is_privileged then
    return new;
  end if;

  -- The stored address is where admin replies get emailed, so it follows the
  -- signed-in user's own email claim. When the token carries no email, an
  -- insert keeps what the client sent and an update keeps the old address.
  if tg_op = 'INSERT' then
    new.user_email := coalesce(nullif(public.feedback_actor_email(), ''), new.user_email);
    if new.admin_reply is not null
       or new.admin_reply_by is not null
       or new.admin_reply_at is not null
       or new.admin_reply_emailed_at is not null
       or new.admin_reply_email_id is not null then
      raise exception 'admin reply fields can only be set by an administrator'
        using errcode = '42501';
    end if;
  else
    if new.admin_reply is distinct from old.admin_reply
       or new.admin_reply_by is distinct from old.admin_reply_by
       or new.admin_reply_at is distinct from old.admin_reply_at
       or new.admin_reply_emailed_at is distinct from old.admin_reply_emailed_at
       or new.admin_reply_email_id is distinct from old.admin_reply_email_id then
      raise exception 'admin reply fields can only be changed by an administrator'
        using errcode = '42501';
    end if;

    new.user_email := coalesce(nullif(public.feedback_actor_email(), ''), old.user_email);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_app_feedback_guard_admin_columns on public.app_feedback;
create trigger trg_app_feedback_guard_admin_columns
before insert or update on public.app_feedback
for each row
execute function public.guard_app_feedback_admin_columns();
