-- Second bug found while wiping the database: log_route_deletion() and
-- log_bus_deletion() (0041_audit_log.sql) fire even when the route/bus
-- deletion is itself part of a cascading school deletion -- at that point
-- the schools row they're trying to reference is already gone (from the
-- perspective of the trigger's own INSERT, within the same transaction),
-- so the insert violates audit_log_school_id_fkey and blocks the entire
-- school deletion. There's nothing meaningful to log anyway once the school
-- itself is being torn down (nobody will ever read that row), so both
-- triggers now just skip the insert when the parent school no longer
-- exists. log_guardian_removal() already had an equivalent guard by
-- necessity (it looks up school_id via students, which itself cascades away
-- with the school) and needed no change.

create or replace function public.log_route_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.schools where id = old.school_id) then
    insert into public.audit_log (school_id, actor_id, action, target_id, details)
    values (old.school_id, auth.uid(), 'route_deleted', old.id, jsonb_build_object('name', old.name));
  end if;
  return old;
end;
$$;

create or replace function public.log_bus_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.schools where id = old.school_id) then
    insert into public.audit_log (school_id, actor_id, action, target_id, details)
    values (old.school_id, auth.uid(), 'bus_deleted', old.id, jsonb_build_object('label', old.label));
  end if;
  return old;
end;
$$;
