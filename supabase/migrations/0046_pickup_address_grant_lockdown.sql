-- Grant-lockdown gotcha, hit again despite being documented (see CLAUDE.md):
-- revoking from PUBLIC alone left anon still able to execute
-- update_student_pickup_address (0045) -- anon apparently has its own
-- directly-granted EXECUTE on new functions in this schema, separate from
-- the PUBLIC-inherited one. Every other RPC in this schema (e.g. trigger_sos,
-- 0033_driver_sos.sql) explicitly revokes from anon too; this one was missed
-- on first pass. Caught live by grant_lockdown.test.ts, not assumed.

revoke execute on function public.update_student_pickup_address(uuid, text) from public;
revoke execute on function public.update_student_pickup_address(uuid, text) from anon;
grant execute on function public.update_student_pickup_address(uuid, text) to authenticated;
