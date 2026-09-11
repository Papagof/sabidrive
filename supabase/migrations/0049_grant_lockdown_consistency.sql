-- Found in a project-wide audit: is_trip_crew() (0031_attendant_backup_crew.sql)
-- was created with no explicit revoke, on the stated reasoning that its
-- sibling helpers (current_role, current_school_id, is_guardian_of,
-- can_view_trip) were "none of them... locked down beyond the default
-- PUBLIC grant" -- that's factually wrong: all four were explicitly revoked
-- from public/anon in 0006_lock_down_function_grants.sql and
-- 0007_fix_function_grants.sql. is_trip_crew was the one helper in this
-- family actually left on the default PUBLIC grant. Practical risk is low
-- (it's read-only, resolves to false for an irrelevant/anon caller), but
-- this closes the gap and matches every sibling function's real grant shape,
-- not the incorrect comment that justified skipping it.
revoke execute on function public.is_trip_crew(uuid) from public;
revoke execute on function public.is_trip_crew(uuid) from anon;
grant execute on function public.is_trip_crew(uuid) to authenticated;

-- Same audit: six `returns trigger` functions (set_trip_message_sender_name,
-- notify_trip_message from 0034_trip_messages.sql; log_route_deletion,
-- log_bus_deletion, log_bus_retirement, log_guardian_removal from
-- 0041_audit_log.sql, log_route_deletion/log_bus_deletion re-created with a
-- guard in 0043_audit_log_trigger_school_guard.sql) were created with no
-- revoke at all. Postgres already refuses to let a `returns trigger`
-- function be called directly outside trigger context ("trigger functions
-- can only be called as triggers"), confirmed live for queue_sms_fallback/
-- notify_trip_message per CLAUDE.md -- so this is a consistency/hygiene fix,
-- not closing a live hole. It matches queue_sms_fallback (0011, revoked in
-- 0013/0014) and dispatch_push_notification (0016, revoked in 0017), both of
-- which got the same treatment after their own initial creation.
revoke execute on function public.set_trip_message_sender_name() from public;
revoke execute on function public.set_trip_message_sender_name() from anon;
revoke execute on function public.notify_trip_message() from public;
revoke execute on function public.notify_trip_message() from anon;
revoke execute on function public.log_route_deletion() from public;
revoke execute on function public.log_route_deletion() from anon;
revoke execute on function public.log_bus_deletion() from public;
revoke execute on function public.log_bus_deletion() from anon;
revoke execute on function public.log_bus_retirement() from public;
revoke execute on function public.log_bus_retirement() from anon;
revoke execute on function public.log_guardian_removal() from public;
revoke execute on function public.log_guardian_removal() from anon;
