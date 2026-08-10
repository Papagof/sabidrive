-- Supabase's security linter flags every SECURITY DEFINER function as
-- callable via PostgREST RPC by anon/authenticated by default. RLS already
-- makes these safe (unauthenticated callers get a null current_role()/
-- current_school_id(), so every policy that depends on them fails closed),
-- but tightening the grants removes unnecessary API surface:
--   - Internal helpers (current_role/current_school_id/is_guardian_of/
--     can_view_trip) must stay EXECUTE-able by `authenticated`, since RLS
--     policies evaluate as that role — only `anon` is revoked.
--   - start_trip/end_trip/check_in are meant to be called by authenticated
--     drivers (and re-validate auth.uid() internally); only `anon` is revoked.
--   - handle_new_user is a trigger-only function, never meant to be called
--     directly — revoked from both anon and authenticated. Trigger firing is
--     a separate internal invocation path, unaffected by these REST grants.

revoke execute on function public.current_role() from anon;
revoke execute on function public.current_school_id() from anon;
revoke execute on function public.is_guardian_of(uuid) from anon;
revoke execute on function public.can_view_trip(uuid) from anon;
revoke execute on function public.start_trip(uuid, text) from anon;
revoke execute on function public.end_trip(uuid) from anon;
revoke execute on function public.check_in(uuid, uuid, text) from anon;
revoke execute on function public.handle_new_user() from anon, authenticated;
