-- 0006 revoked from `anon` specifically, but Postgres grants EXECUTE to
-- PUBLIC by default and every role (including anon) implicitly inherits
-- PUBLIC's privileges — so the anon-only revoke had no real effect. Revoke
-- from PUBLIC instead, then grant back only to the roles that need it.

revoke execute on function public.current_role() from public;
revoke execute on function public.current_school_id() from public;
revoke execute on function public.is_guardian_of(uuid) from public;
revoke execute on function public.can_view_trip(uuid) from public;
revoke execute on function public.start_trip(uuid, text) from public;
revoke execute on function public.end_trip(uuid) from public;
revoke execute on function public.check_in(uuid, uuid, text) from public;
revoke execute on function public.handle_new_user() from public;

-- RLS policies evaluate as the querying (authenticated) role, so these
-- helpers must stay callable by authenticated.
grant execute on function public.current_role() to authenticated;
grant execute on function public.current_school_id() to authenticated;
grant execute on function public.is_guardian_of(uuid) to authenticated;
grant execute on function public.can_view_trip(uuid) to authenticated;

-- Driver/admin actions — re-validate auth.uid() internally.
grant execute on function public.start_trip(uuid, text) to authenticated;
grant execute on function public.end_trip(uuid) to authenticated;
grant execute on function public.check_in(uuid, uuid, text) to authenticated;

-- handle_new_user is trigger-only; intentionally left with no direct grants.
