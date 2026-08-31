-- Accountability trail for sensitive admin actions. Two write paths:
-- (1) service-role Route Handlers (deactivate-driver, invite-user) insert
--     directly, since they already run as service-role and already know/trust
--     the calling admin's id;
-- (2) plain client-side RLS-governed writes (delete route/bus, retire/restore
--     bus, remove guardian) get a security-definer AFTER trigger, so the
--     client can't perform the mutation while skipping (or forging) the log
--     entry -- same "the trigger does the fan-out, not the client" idiom as
--     queue_sms_fallback/notify_trip_message.

create table public.audit_log (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools(id),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in (
    'route_deleted', 'bus_deleted', 'bus_retired', 'bus_restored',
    'guardian_removed', 'driver_deactivated', 'driver_reactivated', 'user_invited'
  )),
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit_log_select_admin" on public.audit_log
  for select using (public.current_role() = 'admin' and school_id = public.current_school_id());

-- Deliberately no insert/update/delete policy for anon/authenticated -- every
-- write comes from a service-role Route Handler or a security-definer
-- trigger below, same "zero client-writable policies" shape as
-- rate_limit_hits (0037) / pickup_codes (0026).

create or replace function public.log_route_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (school_id, actor_id, action, target_id, details)
  values (old.school_id, auth.uid(), 'route_deleted', old.id, jsonb_build_object('name', old.name));
  return old;
end;
$$;

create trigger trg_log_route_deletion
  after delete on public.routes
  for each row execute function public.log_route_deletion();

create or replace function public.log_bus_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (school_id, actor_id, action, target_id, details)
  values (old.school_id, auth.uid(), 'bus_deleted', old.id, jsonb_build_object('label', old.label));
  return old;
end;
$$;

create trigger trg_log_bus_deletion
  after delete on public.buses
  for each row execute function public.log_bus_deletion();

create or replace function public.log_bus_retirement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (school_id, actor_id, action, target_id, details)
  values (
    new.school_id,
    auth.uid(),
    case when new.retired_at is not null then 'bus_retired' else 'bus_restored' end,
    new.id,
    jsonb_build_object('label', new.label)
  );
  return new;
end;
$$;

create trigger trg_log_bus_retirement
  after update on public.buses
  for each row
  when (old.retired_at is distinct from new.retired_at)
  execute function public.log_bus_retirement();

create or replace function public.log_guardian_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_school_id uuid;
begin
  select school_id into v_school_id from public.students where id = old.student_id;
  if v_school_id is not null then
    insert into public.audit_log (school_id, actor_id, action, target_id, details)
    values (v_school_id, auth.uid(), 'guardian_removed', old.guardian_id, jsonb_build_object('student_id', old.student_id));
  end if;
  return old;
end;
$$;

create trigger trg_log_guardian_removal
  after delete on public.guardian_student_links
  for each row execute function public.log_guardian_removal();

-- These are `returns trigger` functions, not callable via PostgREST at all
-- (confirmed pattern from queue_sms_fallback/notify_trip_message) -- no
-- grant-lockdown re-verification needed.
