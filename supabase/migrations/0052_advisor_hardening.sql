-- Found via the Supabase security advisor, now that the MCP tools are
-- authenticated in this environment for the first time this session.

-- 1. Grant-lockdown gap: notify_pickup_address_changed/notify_stop_assignment_changed
-- (0045_student_pickup_address.sql) are `returns trigger` functions created with
-- no explicit revoke, the same gap 0049_grant_lockdown_consistency.sql already
-- fixed for six sibling trigger functions -- these two were from a later
-- migration and were simply missed by that pass. Postgres already refuses to
-- call a `returns trigger` function outside trigger context, so this is
-- hygiene/consistency, not closing a live hole -- matches the exact reasoning
-- and shape of the 0049 fix.
revoke execute on function public.notify_pickup_address_changed() from public;
revoke execute on function public.notify_pickup_address_changed() from anon;
revoke execute on function public.notify_stop_assignment_changed() from public;
revoke execute on function public.notify_stop_assignment_changed() from anon;

-- 2. Mutable search_path: the three privilege-protection trigger functions
-- (0021_phone_verification.sql, 0048_protect_profile_privilege_columns.sql)
-- were created without an explicit search_path, unlike notify_pickup_address_changed
-- and every SECURITY DEFINER function in this schema, which already pin
-- `SET search_path TO 'public'`. These three are exactly the functions that
-- enforce the profile-privilege-escalation fix from this session's audit, so
-- pinning search_path (standard Postgres hardening against search_path
-- hijacking) matters more here than almost anywhere else in the schema.
-- Same signature on all three -- safe CREATE OR REPLACE, not the documented
-- overload trap (that only bites on a changed argument list).
create or replace function public.protect_phone_verified()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    if new.phone_verified is distinct from old.phone_verified then
      new.phone_verified := old.phone_verified;
    end if;
    if new.phone is distinct from old.phone then
      new.phone := old.phone;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_profile_privilege_columns()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    if new.role is distinct from old.role then
      new.role := old.role;
    end if;
    if new.school_id is distinct from old.school_id then
      new.school_id := old.school_id;
    end if;
    if new.email is distinct from old.email then
      new.email := old.email;
    end if;
    if new.deactivated_at is distinct from old.deactivated_at then
      new.deactivated_at := old.deactivated_at;
    end if;
    if new.verification_status is distinct from old.verification_status
       and public.current_role() is distinct from 'admin' then
      new.verification_status := old.verification_status;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_notification_immutable_fields()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.role() <> 'service_role' then
    new.recipient_id := old.recipient_id;
    new.type := old.type;
    new.title := old.title;
    new.body := old.body;
    new.related_trip_id := old.related_trip_id;
    new.related_student_id := old.related_student_id;
  end if;
  return new;
end;
$$;
